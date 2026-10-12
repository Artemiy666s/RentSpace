const dayjs = require('dayjs');
const { db } = require('../db');
const { invalidateRentRegisterCache } = require('./managerDataService');

/**
 * Fix 3rd floor (Советская 62) lease rooms:
 * - ИП Гущинский → 2, 3, 4, 3а
 * - ИП Седлер → 5, 5а
 * Anchors to the floor of the tenants' existing map rooms so we never pull
 * same-numbered rooms from other floors/buildings.
 */
function normalizeRoomNumber(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/а/g, 'a')
    .replace(/\s+/g, '');
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function findLiveContract(tenantLike, propertyId) {
  const tenant = await db('tenants').where('name', 'like', `%${tenantLike}%`).whereNull('deleted_at').first();
  if (!tenant) return { tenant: null, contract: null };
  const contract = await db('contracts')
    .where({ tenant_id: tenant.id, property_id: propertyId })
    .whereNull('deleted_at')
    .whereIn('status', ['active', 'expiring'])
    .orderBy('id', 'asc')
    .first();
  return { tenant, contract };
}

async function loadContractLinks(contractId) {
  return db('contract_rooms as cr')
    .join('rooms as r', 'r.id', 'cr.room_id')
    .leftJoin('floors as f', 'f.id', 'r.floor_id')
    .leftJoin('buildings as b', 'b.id', 'r.building_id')
    .where('cr.contract_id', contractId)
    .select(
      'cr.id as linkId',
      'cr.room_id',
      'cr.area as linkArea',
      'cr.rate_without_vat as linkRate',
      'cr.end_date',
      'r.room_number',
      'r.area as roomArea',
      'r.rentable_area as rentableArea',
      'r.status as roomStatus',
      'r.floor_id as floorId',
      'f.name as floorName',
      'b.code as buildingCode',
      'b.name as buildingName'
    )
    .orderBy('cr.id', 'asc');
}

/** Prefer floor that already hosts 5а / 3 / 4 map offices for these tenants. */
async function resolveTargetFloorId(seedLinks) {
  const counts = new Map();
  for (const link of seedLinks) {
    const num = normalizeRoomNumber(link.room_number);
    const floorId = Number(link.floorId);
    if (!floorId) continue;
    // Strong signals for the Советская 62 / 3 этаж office block
    const weight = ['3', '4', '5', '5a', '2', '3a'].includes(num) ? 3 : 1;
    counts.set(floorId, (counts.get(floorId) || 0) + weight);
  }
  let best = null;
  let bestScore = -1;
  for (const [floorId, score] of counts) {
    if (score > bestScore) {
      best = floorId;
      bestScore = score;
    }
  }
  return best;
}

async function findRoomsOnFloor(floorId, numbers) {
  const wanted = new Set(numbers.map(normalizeRoomNumber));
  const rows = await db('rooms as r')
    .leftJoin('buildings as b', 'b.id', 'r.building_id')
    .leftJoin('floors as f', 'f.id', 'r.floor_id')
    .where('r.floor_id', floorId)
    .whereNull('r.deleted_at')
    .select('r.*', 'b.name as buildingName', 'f.name as floorName', 'f.id as floorId');

  const byNum = new Map();
  for (const row of rows) {
    const key = normalizeRoomNumber(row.room_number);
    if (!wanted.has(key)) continue;
    if (!byNum.has(key)) byNum.set(key, row);
  }
  return byNum;
}

async function detachLink(link, actions, dryRun, { reason }) {
  actions.push({
    type: 'detach_room',
    linkId: link.linkId,
    roomId: link.room_id,
    roomNumber: link.room_number,
    contractId: link.contractId || null,
    reason,
  });
  if (dryRun) return;
  await db('contract_rooms').where({ id: link.linkId }).delete();
  const still = await db('contract_rooms as cr')
    .join('contracts as c', 'c.id', 'cr.contract_id')
    .where('cr.room_id', link.room_id)
    .whereNull('c.deleted_at')
    .whereIn('c.status', ['active', 'expiring'])
    .first();
  if (!still) {
    await db('rooms').where({ id: link.room_id }).update({
      status: 'free',
      current_rate_without_vat: null,
      updated_at: db.fn.now(),
    });
    actions.push({ type: 'mark_room_free', roomId: link.room_id, roomNumber: link.room_number });
  }
}

async function attachRoom({ contract, room, rate, actions, dryRun }) {
  const area = Number(room.rentable_area || room.area || 0) || 0.01;
  const useRate = Number(rate || contract.rate_without_vat || 0) || 0;
  actions.push({
    type: 'attach_room',
    contractId: contract.id,
    roomId: room.id,
    roomNumber: room.room_number,
    area,
    rate: useRate,
  });
  if (dryRun) return;
  await db('contract_rooms').insert({
    contract_id: contract.id,
    room_id: room.id,
    area,
    rate_without_vat: useRate,
    start_date: contract.start_date || contract.contract_date || null,
    end_date: null,
  });
  await db('rooms').where({ id: room.id }).update({
    status: 'occupied',
    current_rate_without_vat: useRate,
    updated_at: db.fn.now(),
  });
}

async function syncContractRooms({
  contract,
  keepSet,
  floorRooms,
  defaultRate,
  actions,
  dryRun,
  label,
}) {
  const links = await loadContractLinks(contract.id);
  actions.push({
    type: `${label}_current_links`,
    contractId: contract.id,
    links: links.map((l) => ({
      linkId: l.linkId,
      roomId: l.room_id,
      roomNumber: l.room_number,
      linkArea: Number(l.linkArea),
      roomArea: Number(l.roomArea),
      floorId: l.floorId,
    })),
  });

  const seenRoomIds = new Set();
  const seenNumbers = new Set();

  for (const link of links) {
    const num = normalizeRoomNumber(link.room_number);
    const roomId = Number(link.room_id);
    const onTargetFloor = floorRooms.has(num) && Number(floorRooms.get(num).id) === roomId;

    if (!keepSet.has(num) || seenRoomIds.has(roomId) || seenNumbers.has(num) || !onTargetFloor) {
      let reason = 'not_in_keep_set';
      if (seenRoomIds.has(roomId) || seenNumbers.has(num)) reason = 'duplicate_link';
      else if (keepSet.has(num) && !onTargetFloor) reason = 'wrong_floor_room';
      await detachLink({ ...link, contractId: contract.id }, actions, dryRun, { reason });
      continue;
    }

    seenRoomIds.add(roomId);
    seenNumbers.add(num);

    const roomArea = Number(link.roomArea || link.rentableArea || 0);
    const linkArea = Number(link.linkArea || 0);
    if (roomArea > 0 && Math.abs(roomArea - linkArea) > 0.05) {
      actions.push({
        type: 'sync_link_area_from_room',
        linkId: link.linkId,
        roomNumber: link.room_number,
        from: linkArea,
        to: roomArea,
      });
      if (!dryRun) {
        await db('contract_rooms').where({ id: link.linkId }).update({ area: roomArea });
      }
    }

    // Map hides tenant when contract_rooms.end_date is before today.
    const end = link.end_date ? dayjs(link.end_date) : null;
    if (end && end.isValid() && end.isBefore(dayjs(), 'day')) {
      actions.push({
        type: 'clear_past_link_end_date',
        linkId: link.linkId,
        roomNumber: link.room_number,
        from: link.end_date,
      });
      if (!dryRun) {
        await db('contract_rooms').where({ id: link.linkId }).update({ end_date: null });
      }
    }

    if (!dryRun) {
      await db('rooms').where({ id: roomId }).update({
        status: 'occupied',
        current_rate_without_vat: Number(link.linkRate || defaultRate || contract.rate_without_vat || 0) || null,
        updated_at: db.fn.now(),
      });
    }
  }

  for (const num of keepSet) {
    if (seenNumbers.has(num)) continue;
    const room = floorRooms.get(num);
    if (!room) {
      actions.push({ type: 'room_not_found', tenant: label, roomNumber: num });
      continue;
    }

    const other = await db('contract_rooms as cr')
      .join('contracts as c', 'c.id', 'cr.contract_id')
      .join('rooms as r', 'r.id', 'cr.room_id')
      .where('cr.room_id', room.id)
      .whereNull('c.deleted_at')
      .whereIn('c.status', ['active', 'expiring'])
      .whereNot('c.id', contract.id)
      .select('cr.id as linkId', 'cr.room_id', 'r.room_number', 'c.id as contractId')
      .first();
    if (other) {
      await detachLink(other, actions, dryRun, { reason: `move_to_${label}` });
    }

    await attachRoom({
      contract,
      room,
      rate: defaultRate || contract.rate_without_vat,
      actions,
      dryRun,
    });
    seenRoomIds.add(Number(room.id));
    seenNumbers.add(num);
  }

  const finalLinks = dryRun
    ? null
    : await db('contract_rooms as cr')
        .join('rooms as r', 'r.id', 'cr.room_id')
        .where('cr.contract_id', contract.id)
        .select('r.room_number', 'cr.area', 'cr.rate_without_vat')
        .orderBy('r.room_number');

  return {
    contractId: contract.id,
    contractNumber: contract.contract_number,
    finalRooms: finalLinks,
    finalArea: finalLinks
      ? roundMoney(finalLinks.reduce((s, r) => s + Number(r.area || 0), 0))
      : null,
  };
}

async function repairGushchinskyLease({ propertyId = 1, dryRun = true } = {}) {
  const pid = Number(propertyId) || 1;
  const actions = [];

  const gush = await findLiveContract('Гущинск', pid);
  if (!gush.tenant) return { error: 'gushchinsky_tenant_not_found', dryRun };
  if (!gush.contract) return { error: 'gushchinsky_live_contract_not_found', dryRun, tenantId: gush.tenant.id };

  const sedler = await findLiveContract('Седлер', pid);
  if (!sedler.tenant) return { error: 'sedler_tenant_not_found', dryRun };
  if (!sedler.contract) return { error: 'sedler_live_contract_not_found', dryRun, tenantId: sedler.tenant.id };

  const gushLinks = await loadContractLinks(gush.contract.id);
  const sedlerLinks = await loadContractLinks(sedler.contract.id);
  const floorId = await resolveTargetFloorId([...gushLinks, ...sedlerLinks]);
  if (!floorId) return { error: 'target_floor_not_found', dryRun };

  const floorRooms = await findRoomsOnFloor(floorId, ['2', '3', '4', '3a', '5', '5a']);
  actions.push({
    type: 'target_floor',
    floorId,
    rooms: [...floorRooms.entries()].map(([num, r]) => ({
      num,
      roomId: r.id,
      roomNumber: r.room_number,
      area: Number(r.area || r.rentable_area || 0),
      status: r.status,
    })),
  });

  // Sedler first: claim 5/5a and drop wrong room 3.
  const sedlerResult = await syncContractRooms({
    contract: sedler.contract,
    keepSet: new Set(['5', '5a']),
    floorRooms,
    defaultRate: Number(sedler.contract.rate_without_vat || 9) || 9,
    actions,
    dryRun,
    label: 'sedler',
  });

  const gushResult = await syncContractRooms({
    contract: gush.contract,
    keepSet: new Set(['2', '3', '4', '3a']),
    floorRooms,
    defaultRate: Number(gush.contract.rate_without_vat || 18) || 18,
    actions,
    dryRun,
    label: 'gushchinsky',
  });

  if (!dryRun) invalidateRentRegisterCache(pid);

  return {
    dryRun,
    gushchinsky: {
      tenantId: gush.tenant.id,
      tenantName: gush.tenant.name,
      ...gushResult,
    },
    sedler: {
      tenantId: sedler.tenant.id,
      tenantName: sedler.tenant.name,
      ...sedlerResult,
    },
    actions,
  };
}

module.exports = { repairGushchinskyLease };
