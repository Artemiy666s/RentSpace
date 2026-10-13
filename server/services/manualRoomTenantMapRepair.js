const dayjs = require('dayjs');
const { db } = require('../db');
const { invalidateRentRegisterCache } = require('./managerDataService');

/**
 * Apply manager-confirmed map room → tenant assignments.
 * Rooms are often stuck on terminated duplicate contracts while the live
 * contract has no open link — map then shows «сдано» without tenant.
 *
 * Skips blanks the manager will fill later.
 */

function normalizeRoomNumber(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/а/g, 'a')
    .replace(/б/g, 'b')
    .replace(/\s+/g, '');
}

/** Explicit map: roomId → tenant name fragment for live-contract lookup. */
const ASSIGNMENTS = [
  // Советская 56
  { roomId: 180124, tenantLike: 'Плеханова', note: '56 / 1 / 3' },
  { roomId: 180130, tenantLike: 'Пинчук', note: '56 / 2 / 3' },
  { roomId: 180131, tenantLike: 'Жукова', note: '56 / 2 / 4' },
  { roomId: 180142, tenantLike: 'Жалелова', note: '56 / 3 / 2' },
  { roomId: 180147, tenantLike: 'СмартЛайн', note: '56 / 3 / 7' },
  { roomId: 210102, tenantLike: 'Бандюкевич', note: '56 / Бар / 888' },

  // Советская 56а
  { roomId: 180099, tenantLike: 'Волчек', note: '56а / 1 / 1' },
  { roomId: 180097, tenantLike: 'Сити Вуман', note: '56а / 1 / 3' },
  { roomId: 695598, tenantLike: 'Забиран', note: '56а / 1 / 8' },
  { roomId: 270102, tenantLike: 'Рапеко', note: '56а / 2 / 1' },
  { roomId: 270103, tenantLike: 'БЛЭК', note: '56а / 2 / 3' },
  { roomId: 270106, tenantLike: 'БЛЭК', note: '56а / 2 / 4' },
  { roomId: 270109, tenantLike: 'Кадовба', note: '56а / 2 / 7' },
  { roomId: 270110, tenantLike: 'Алондерис', note: '56а / 2 / 8' },
  { roomId: 180108, tenantLike: 'Флотабол', note: '56а / 3 / 3' },
  { roomId: 180115, tenantLike: 'Флотабол', note: '56а / 3 / 7' },
  { roomId: 180117, tenantLike: 'Борсук', note: '56а / 3 / 8' },

  // Советская 56е
  { roomId: 180152, tenantLike: 'ДмиВе', note: '56е / 1 / 1' },
  { roomId: 180153, tenantLike: 'Барбершоп', note: '56е / 1 / 2' },
  { roomId: 180155, tenantLike: 'Ерошкин', note: '56е / 1 / 4' },
  { roomId: 180156, tenantLike: 'Налегач', note: '56е / 1 / 5' },
  { roomId: 180157, tenantLike: 'Радюк', note: '56е / 1 / 6' },
  { roomId: 180159, tenantLike: 'Барбершоп', note: '56е / 1 / 8' },
  { roomId: 180160, tenantLike: 'Драгун', note: '56е / 1 / 9' },
  // User: 1а → Турчина, «16»(1б 12.39) → Казак (swap vs previous wrong links)
  { roomId: 635598, tenantLike: 'Турчина', note: '56е / 2 / 1а' },
  { roomId: 635599, tenantLike: 'Казак', note: '56е / 2 / 1б' },

  // Советская 62
  { roomId: 360108, tenantLike: 'БьютиСистем', note: '62 / 1 / 11а' },
  { roomId: 360113, tenantLike: 'Машевск', note: '62 / 2 / 4' },
  { roomId: 360119, tenantLike: 'ЛАСИЦА', note: '62 / 2 / 10' },
  { roomId: 360120, tenantLike: 'Медвецк', note: '62 / 2 / 11' },
  { roomId: 360121, tenantLike: 'Медвецк', note: '62 / 2 / 11а' },
  { roomId: 665599, tenantLike: 'ТехМонтаж', note: '62 / 2 / 14' },
  { roomId: 665600, tenantLike: 'Мери', note: '62 / 2 / 15' },
];

/** Extra cleanups that prevent wrong labels / double debt surfaces. */
const DETACH_IF_ON_TENANT = [
  // Gushchinsky's room 4 must not stay on Машевский
  { roomId: 390101, detachTenantLike: 'Машевск', reason: 'belongs_to_gushchinsky' },
  // Medvedskaya's 11а must not stay on Мерилин / ТехМонтаж
  { roomId: 360121, detachTenantLike: 'Мери', reason: 'belongs_to_medvedskaya' },
  { roomId: 360121, detachTenantLike: 'ТехМонтаж', reason: 'belongs_to_medvedskaya' },
];

async function findLiveContract(tenantLike, propertyId) {
  const tenants = await db('tenants')
    .where('name', 'like', `%${tenantLike}%`)
    .whereNull('deleted_at')
    .select('id', 'name')
    .limit(5);
  if (!tenants.length) return { error: 'tenant_not_found', tenantLike };

  // Prefer exact-ish longest name match when several hit
  tenants.sort((a, b) => b.name.length - a.name.length);
  const tenant = tenants[0];

  const contracts = await db('contracts')
    .where({ tenant_id: tenant.id, property_id: propertyId })
    .whereNull('deleted_at')
    .whereIn('status', ['active', 'expiring'])
    .orderBy('id', 'asc')
    .select('*');

  if (!contracts.length) {
    return { error: 'live_contract_not_found', tenantLike, tenantId: tenant.id, tenantName: tenant.name };
  }

  // Prefer the live contract that already has any rooms / charges history
  let best = contracts[0];
  let bestScore = -1;
  for (const c of contracts) {
    const rooms = await db('contract_rooms').where({ contract_id: c.id }).count('* as c').first();
    const charges = await db('rent_charges')
      .where({ contract_id: c.id })
      .whereNot('status', 'cancelled')
      .count('* as c')
      .first();
    const score = Number(rooms?.c || 0) * 10 + Number(charges?.c || 0);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return { tenant, contract: best, allLive: contracts };
}

async function listRoomLinks(roomId) {
  return db('contract_rooms as cr')
    .join('contracts as c', 'c.id', 'cr.contract_id')
    .join('tenants as t', 't.id', 'c.tenant_id')
    .where('cr.room_id', roomId)
    .select(
      'cr.id as linkId',
      'cr.room_id',
      'cr.area',
      'cr.rate_without_vat',
      'cr.end_date',
      'cr.start_date',
      'c.id as contractId',
      'c.status as contractStatus',
      'c.deleted_at as contractDeletedAt',
      'c.rate_without_vat as contractRate',
      't.id as tenantId',
      't.name as tenantName'
    )
    .orderBy('cr.id', 'asc');
}

async function ensureAssignment({ roomId, tenantLike, note }, propertyId, dryRun, actions) {
  const room = await db('rooms').where({ id: roomId }).whereNull('deleted_at').first();
  if (!room) {
    actions.push({ type: 'room_missing', roomId, note });
    return;
  }

  const found = await findLiveContract(tenantLike, propertyId);
  if (found.error) {
    actions.push({ type: 'skip', roomId, note, ...found });
    return;
  }

  const { tenant, contract } = found;
  const area = Number(room.rentable_area || room.area || 0) || 0.01;
  const rate =
    Number(room.current_rate_without_vat) ||
    Number(contract.rate_without_vat) ||
    0;

  const links = await listRoomLinks(roomId);
  const onLive = links.filter((l) => Number(l.contractId) === Number(contract.id));
  const others = links.filter((l) => Number(l.contractId) !== Number(contract.id));

  for (const link of others) {
    actions.push({
      type: 'detach_foreign_or_dead_link',
      roomId,
      roomNumber: room.room_number,
      note,
      linkId: link.linkId,
      fromContractId: link.contractId,
      fromTenant: link.tenantName,
      fromStatus: link.contractStatus,
      toTenant: tenant.name,
      toContractId: contract.id,
    });
    if (!dryRun) await db('contract_rooms').where({ id: link.linkId }).delete();
  }

  if (onLive.length) {
    const keep = onLive[0];
    for (const dup of onLive.slice(1)) {
      actions.push({
        type: 'detach_duplicate_live_link',
        roomId,
        linkId: dup.linkId,
        contractId: contract.id,
      });
      if (!dryRun) await db('contract_rooms').where({ id: dup.linkId }).delete();
    }

    const patch = {};
    if (keep.end_date) {
      patch.end_date = null;
      actions.push({
        type: 'clear_past_or_closed_end_date',
        roomId,
        linkId: keep.linkId,
        from: keep.end_date,
        tenant: tenant.name,
      });
    }
    if (area > 0 && Math.abs(Number(keep.area || 0) - area) > 0.05) {
      patch.area = area;
      actions.push({
        type: 'sync_link_area',
        roomId,
        linkId: keep.linkId,
        from: Number(keep.area),
        to: area,
      });
    }
    if (rate > 0 && Math.abs(Number(keep.rate_without_vat || 0) - rate) > 0.05) {
      patch.rate_without_vat = rate;
      actions.push({
        type: 'sync_link_rate',
        roomId,
        linkId: keep.linkId,
        from: Number(keep.rate_without_vat),
        to: rate,
      });
    }
    if (Object.keys(patch).length && !dryRun) {
      await db('contract_rooms').where({ id: keep.linkId }).update(patch);
    }
    actions.push({
      type: 'keep_live_link',
      roomId,
      roomNumber: room.room_number,
      note,
      tenant: tenant.name,
      contractId: contract.id,
      linkId: keep.linkId,
    });
  } else {
    actions.push({
      type: 'attach_to_live_contract',
      roomId,
      roomNumber: room.room_number,
      note,
      tenant: tenant.name,
      contractId: contract.id,
      area,
      rate,
    });
    if (!dryRun) {
      await db('contract_rooms').insert({
        contract_id: contract.id,
        room_id: roomId,
        area,
        rate_without_vat: rate,
        start_date: contract.start_date || contract.contract_date || dayjs().format('YYYY-MM-DD'),
        end_date: null,
      });
    }
  }

  if (!dryRun) {
    await db('rooms').where({ id: roomId }).update({
      status: 'occupied',
      current_rate_without_vat: rate || room.current_rate_without_vat,
      updated_at: db.fn.now(),
    });
  }
}

async function detachStray({ roomId, detachTenantLike, reason }, propertyId, dryRun, actions) {
  const links = await listRoomLinks(roomId);
  for (const link of links) {
    if (!String(link.tenantName || '').includes(detachTenantLike)) continue;
    // Only detach if this is NOT the intended live owner from ASSIGNMENTS
    const intended = ASSIGNMENTS.find((a) => Number(a.roomId) === Number(roomId));
    if (intended) {
      const live = await findLiveContract(intended.tenantLike, propertyId);
      if (!live.error && Number(live.contract.id) === Number(link.contractId)) continue;
    }
    actions.push({
      type: 'detach_stray',
      roomId,
      linkId: link.linkId,
      tenant: link.tenantName,
      contractId: link.contractId,
      reason,
    });
    if (!dryRun) await db('contract_rooms').where({ id: link.linkId }).delete();
  }

  if (!dryRun) {
    const still = await db('contract_rooms as cr')
      .join('contracts as c', 'c.id', 'cr.contract_id')
      .where('cr.room_id', roomId)
      .whereNull('c.deleted_at')
      .whereIn('c.status', ['active', 'expiring'])
      .where(function () {
        this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', dayjs().format('YYYY-MM-DD'));
      })
      .first();
    if (!still && !ASSIGNMENTS.some((a) => Number(a.roomId) === Number(roomId))) {
      await db('rooms').where({ id: roomId }).update({
        // keep occupied if manager left blank — still «сдано» visually until clarified
        updated_at: db.fn.now(),
      });
    }
  }
}

async function repairManualRoomTenantMap({ propertyId = 1, dryRun = true } = {}) {
  const pid = Number(propertyId) || 1;
  const actions = [];

  // First detach known strays so assignments don't fight them
  for (const row of DETACH_IF_ON_TENANT) {
    await detachStray(row, pid, dryRun, actions);
  }

  for (const row of ASSIGNMENTS) {
    await ensureAssignment(row, pid, dryRun, actions);
  }

  // Summary: would map show tenant?
  const asOf = dayjs().format('YYYY-MM-DD');
  const verify = [];
  for (const row of ASSIGNMENTS) {
    const links = await listRoomLinks(row.roomId);
    const open = links.filter(
      (l) =>
        ['active', 'expiring'].includes(l.contractStatus) &&
        !l.contractDeletedAt &&
        (!l.end_date || dayjs(l.end_date).format('YYYY-MM-DD') >= asOf)
    );
    verify.push({
      roomId: row.roomId,
      note: row.note,
      expectedTenantLike: row.tenantLike,
      mapWouldShow: open[0]?.tenantName || null,
      openLinkCount: open.length,
      allLinkCount: links.length,
    });
  }

  if (!dryRun) invalidateRentRegisterCache(pid);

  return {
    dryRun,
    propertyId: pid,
    assignmentCount: ASSIGNMENTS.length,
    actions,
    verify,
    blanksSkipped: [],
  };
}

module.exports = {
  repairManualRoomTenantMap,
  ASSIGNMENTS,
  normalizeRoomNumber,
};
