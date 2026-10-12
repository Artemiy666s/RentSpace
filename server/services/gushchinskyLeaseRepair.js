const { db } = require('../db');
const { invalidateRentRegisterCache } = require('./managerDataService');

/**
 * ИП Гущинский: keep rooms 3, 4 and 5 on one contract; drop 2/3а and duplicate links.
 * Room 5 is occupied on the map without a lease — attach it.
 */
async function repairGushchinskyLease({ propertyId = 1, dryRun = true } = {}) {
  const pid = Number(propertyId) || 1;
  const actions = [];

  const tenant = await db('tenants').where('name', 'like', '%Гущинск%').whereNull('deleted_at').first();
  if (!tenant) return { error: 'tenant_not_found', dryRun };

  const contract = await db('contracts')
    .where({ tenant_id: tenant.id, property_id: pid })
    .whereNull('deleted_at')
    .whereIn('status', ['active', 'expiring'])
    .orderBy('id', 'asc')
    .first();
  if (!contract) return { error: 'live_contract_not_found', dryRun, tenantId: tenant.id };

  const links = await db('contract_rooms as cr')
    .join('rooms as r', 'r.id', 'cr.room_id')
    .leftJoin('floors as f', 'f.id', 'r.floor_id')
    .leftJoin('buildings as b', 'b.id', 'r.building_id')
    .where('cr.contract_id', contract.id)
    .select(
      'cr.id as linkId',
      'cr.room_id',
      'cr.area as linkArea',
      'cr.rate_without_vat as linkRate',
      'r.room_number',
      'r.area as roomArea',
      'r.status as roomStatus',
      'f.id as floorId',
      'f.name as floorName',
      'b.code as buildingCode',
      'b.name as buildingName'
    )
    .orderBy('cr.id', 'asc');

  actions.push({
    type: 'current_links',
    contractId: contract.id,
    links: links.map((l) => ({
      linkId: l.linkId,
      roomId: l.room_id,
      roomNumber: l.room_number,
      linkArea: Number(l.linkArea),
      roomArea: Number(l.roomArea),
      floor: l.floorName,
      building: l.buildingCode || l.buildingName,
    })),
  });

  const keepNumbers = new Set(['3', '4', '5']);
  const seenRoomIds = new Set();
  const toDetach = [];
  let floorId = null;
  let buildingHint = null;

  for (const link of links) {
    const num = String(link.room_number || '').trim();
    floorId = floorId || link.floorId;
    buildingHint = buildingHint || link.buildingCode || link.buildingName;
    if (!keepNumbers.has(num) || seenRoomIds.has(Number(link.room_id))) {
      toDetach.push(link);
      continue;
    }
    seenRoomIds.add(Number(link.room_id));
  }

  for (const link of toDetach) {
    actions.push({
      type: 'detach_room',
      linkId: link.linkId,
      roomId: link.room_id,
      roomNumber: link.room_number,
      reason: seenRoomIds.has(Number(link.room_id)) ? 'duplicate_link' : 'not_in_keep_set',
    });
    if (!dryRun) {
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
  }

  // Find room 5 on same floor (or same building 62 / Советская 62)
  let room5 = null;
  if (floorId) {
    room5 = await db('rooms')
      .where({ floor_id: floorId, room_number: '5' })
      .whereNull('deleted_at')
      .first();
  }
  if (!room5) {
    room5 = await db('rooms as r')
      .join('buildings as b', 'b.id', 'r.building_id')
      .join('floors as f', 'f.id', 'r.floor_id')
      .where('r.property_id', pid)
      .whereNull('r.deleted_at')
      .where('r.room_number', '5')
      .where(function () {
        this.where('b.code', 'like', '%62%')
          .orWhere('b.name', 'like', '%62%')
          .orWhere('b.name', 'like', '%Советск%');
      })
      .where(function () {
        this.where('f.level_number', 3).orWhere('f.name', 'like', '%3%');
      })
      .select('r.*', 'b.name as buildingName', 'f.name as floorName')
      .first();
  }

  actions.push({
    type: 'lookup_room_5',
    found: room5
      ? {
          roomId: room5.id,
          area: Number(room5.area || room5.rentable_area || 0),
          status: room5.status,
          building: room5.buildingName,
          floor: room5.floorName,
        }
      : null,
  });

  if (room5) {
    const already = await db('contract_rooms')
      .where({ contract_id: contract.id, room_id: room5.id })
      .first();
    if (!already) {
      // Detach from any other live contract first
      const other = await db('contract_rooms as cr')
        .join('contracts as c', 'c.id', 'cr.contract_id')
        .where('cr.room_id', room5.id)
        .whereNull('c.deleted_at')
        .whereIn('c.status', ['active', 'expiring'])
        .whereNot('c.id', contract.id)
        .select('cr.id', 'c.id as contractId')
        .first();
      if (other) {
        actions.push({
          type: 'detach_room_5_from_other',
          linkId: other.id,
          fromContractId: other.contractId,
        });
        if (!dryRun) await db('contract_rooms').where({ id: other.id }).delete();
      }

      const area = Number(room5.rentable_area || room5.area || 0) || 0.01;
      const rate = Number(contract.rate_without_vat || 18) || 18;
      actions.push({
        type: 'attach_room_5',
        contractId: contract.id,
        roomId: room5.id,
        area,
        rate,
      });
      if (!dryRun) {
        await db('contract_rooms').insert({
          contract_id: contract.id,
          room_id: room5.id,
          area,
          rate_without_vat: rate,
          start_date: contract.start_date || contract.contract_date || null,
        });
      }
    } else {
      actions.push({ type: 'room_5_already_linked', roomId: room5.id });
    }

    if (!dryRun) {
      await db('rooms').where({ id: room5.id }).update({
        status: 'occupied',
        current_rate_without_vat: Number(contract.rate_without_vat || 18) || 18,
        updated_at: db.fn.now(),
      });
      actions.push({ type: 'mark_room_5_occupied', roomId: room5.id });
    }
  }

  // Sync keep rooms 3/4 status + use map areas on links when link area looks like half
  const keepLinks = await db('contract_rooms as cr')
    .join('rooms as r', 'r.id', 'cr.room_id')
    .where('cr.contract_id', contract.id)
    .whereIn('r.room_number', ['3', '4', '5'])
    .select('cr.id', 'cr.area as linkArea', 'r.id as roomId', 'r.room_number', 'r.area as roomArea');

  for (const link of keepLinks) {
    const roomArea = Number(link.roomArea || 0);
    const linkArea = Number(link.linkArea || 0);
    if (roomArea > 0 && Math.abs(roomArea - linkArea) > 1) {
      actions.push({
        type: 'sync_link_area_from_room',
        linkId: link.id,
        roomNumber: link.room_number,
        from: linkArea,
        to: roomArea,
      });
      if (!dryRun) {
        await db('contract_rooms').where({ id: link.id }).update({
          area: roomArea,
          updated_at: db.fn.now(),
        });
      }
    }
    if (!dryRun) {
      await db('rooms').where({ id: link.roomId }).update({
        status: 'occupied',
        current_rate_without_vat: Number(contract.rate_without_vat || 18) || 18,
        updated_at: db.fn.now(),
      });
    }
  }

  const finalLinks = dryRun
    ? null
    : await db('contract_rooms as cr')
        .join('rooms as r', 'r.id', 'cr.room_id')
        .where('cr.contract_id', contract.id)
        .select('r.room_number', 'cr.area')
        .orderBy('r.room_number');

  const areaSum = dryRun
    ? null
    : roundMoney(finalLinks.reduce((s, r) => s + Number(r.area || 0), 0));

  if (!dryRun) invalidateRentRegisterCache(pid);

  return {
    dryRun,
    tenantId: tenant.id,
    tenantName: tenant.name,
    contractId: contract.id,
    contractNumber: contract.contract_number,
    actions,
    finalRooms: finalLinks,
    finalArea: areaSum,
  };
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

module.exports = { repairGushchinskyLease };
