const dayjs = require('dayjs');
const { db } = require('../db');
const { invalidateRentRegisterCache } = require('./managerDataService');

/**
 * Attach ИП Власенко to Советская 56А / 1 этаж / помещение 5.
 * Dry-run by default.
 */
async function repairVlasenkoRoomAttach({ propertyId = 1, dryRun = true } = {}) {
  const pid = Number(propertyId) || 1;
  const actions = [];

  const tenant = await db('tenants').where('name', 'like', '%Власенко%').whereNull('deleted_at').first();
  if (!tenant) {
    return { propertyId: pid, dryRun, error: 'tenant_not_found' };
  }

  const contract = await db('contracts')
    .where({ tenant_id: tenant.id, property_id: pid })
    .whereNull('deleted_at')
    .whereIn('status', ['active', 'expiring'])
    .orderBy('id', 'asc')
    .first();
  if (!contract) {
    return {
      propertyId: pid,
      dryRun,
      tenantId: tenant.id,
      tenantName: tenant.name,
      error: 'active_contract_not_found',
    };
  }

  const room = await db('rooms as r')
    .join('buildings as b', 'b.id', 'r.building_id')
    .join('floors as f', 'f.id', 'r.floor_id')
    .where('r.property_id', pid)
    .whereNull('r.deleted_at')
    .where('r.room_number', '5')
    .where(function () {
      this.where('f.level_number', 1).orWhere('f.name', 'like', '%1%');
    })
    .where(function () {
      this.where('b.code', '56а')
        .orWhere('b.code', '56a')
        .orWhere('b.name', 'like', '%56а%')
        .orWhere('b.name', 'like', '%56a%')
        .orWhere('b.name', 'like', '%Советская%56%');
    })
    .select(
      'r.id as roomId',
      'r.room_number',
      'r.status',
      'r.area',
      'r.rentable_area',
      'b.code as buildingCode',
      'b.name as buildingName',
      'f.name as floorName',
      'f.level_number'
    )
    .orderBy('r.id', 'asc')
    .first();

  if (!room) {
    return {
      propertyId: pid,
      dryRun,
      tenantId: tenant.id,
      tenantName: tenant.name,
      contractId: contract.id,
      error: 'room_5_not_found_56a_floor1',
    };
  }

  const existing = await db('contract_rooms')
    .where({ contract_id: contract.id, room_id: room.roomId })
    .first();
  if (existing && !existing.end_date) {
    actions.push({ type: 'already_linked', linkId: existing.id, roomId: room.roomId });
    return {
      propertyId: pid,
      dryRun,
      tenantId: tenant.id,
      tenantName: tenant.name,
      contractId: contract.id,
      contractNumber: contract.contract_number,
      room,
      actions,
    };
  }

  const otherLive = await db('contract_rooms as cr')
    .join('contracts as c', 'c.id', 'cr.contract_id')
    .leftJoin('tenants as t', 't.id', 'c.tenant_id')
    .where('cr.room_id', room.roomId)
    .whereNull('c.deleted_at')
    .whereIn('c.status', ['active', 'expiring'])
    .where(function () {
      this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', dayjs().format('YYYY-MM-DD'));
    })
    .whereNot('c.id', contract.id)
    .select('cr.id as linkId', 'c.id as contractId', 'c.contract_number', 't.name as tenantName')
    .first();

  if (otherLive) {
    actions.push({
      type: 'detach_other_live_link',
      linkId: otherLive.linkId,
      fromContractId: otherLive.contractId,
      fromContractNumber: otherLive.contract_number,
      fromTenant: otherLive.tenantName,
      roomId: room.roomId,
    });
    if (!dryRun) {
      await db('contract_rooms').where({ id: otherLive.linkId }).delete();
    }
  }

  // Drop stale ended/self duplicates for this pair
  if (existing) {
    actions.push({ type: 'remove_stale_self_link', linkId: existing.id });
    if (!dryRun) {
      await db('contract_rooms').where({ id: existing.id }).delete();
    }
  }

  const area = Number(room.rentable_area || room.area || 0) || 0.01;
  const rate = Number(contract.rate_without_vat || 21) || 21;
  const startDate = contract.start_date || contract.contract_date || null;

  actions.push({
    type: 'attach_room',
    contractId: contract.id,
    roomId: room.roomId,
    roomNumber: room.room_number,
    building: room.buildingCode || room.buildingName,
    floor: room.floorName,
    area,
    rate,
    startDate,
  });

  if (!dryRun) {
    await db('contract_rooms').insert({
      contract_id: contract.id,
      room_id: room.roomId,
      area,
      rate_without_vat: rate,
      start_date: startDate,
      end_date: null,
    });
    await db('rooms').where({ id: room.roomId }).update({
      status: 'occupied',
      current_rate_without_vat: rate,
      updated_at: db.fn.now(),
    });
    invalidateRentRegisterCache(pid);
  }

  return {
    propertyId: pid,
    dryRun,
    tenantId: tenant.id,
    tenantName: tenant.name,
    contractId: contract.id,
    contractNumber: contract.contract_number,
    room,
    actions,
  };
}

module.exports = { repairVlasenkoRoomAttach };
