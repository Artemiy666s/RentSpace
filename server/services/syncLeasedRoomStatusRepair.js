const dayjs = require('dayjs');
const { db } = require('../db');
const { invalidateRentRegisterCache } = require('./managerDataService');

/**
 * rooms.status sometimes stays free/ready while an open contract_rooms link exists.
 * Map overlays lease → «сдано»; room card used raw status → «свободно».
 * Sync status (+ rate) from open leases.
 */
async function repairSyncLeasedRoomStatus({ propertyId = 1, dryRun = true } = {}) {
  const pid = Number(propertyId) || 1;
  const asOf = dayjs().format('YYYY-MM-DD');

  const leased = await db('contract_rooms as cr')
    .join('contracts as c', 'c.id', 'cr.contract_id')
    .join('rooms as r', 'r.id', 'cr.room_id')
    .leftJoin('tenants as t', 't.id', 'c.tenant_id')
    .where('c.property_id', pid)
    .whereIn('c.status', ['active', 'expiring'])
    .whereNull('c.deleted_at')
    .whereNull('t.deleted_at')
    .where(function () {
      this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', asOf);
    })
    .whereNotIn('r.status', ['occupied', 'debt'])
    .whereNull('r.deleted_at')
    .select(
      'r.id as roomId',
      'r.room_number',
      'r.status as roomStatus',
      'r.current_rate_without_vat as roomRate',
      'cr.rate_without_vat as linkRate',
      'c.rate_without_vat as contractRate',
      'c.id as contractId',
      't.name as tenantName'
    );

  const actions = [];
  for (const row of leased) {
    const rate =
      Number(row.linkRate) ||
      Number(row.contractRate) ||
      Number(row.roomRate) ||
      null;
    actions.push({
      type: 'mark_occupied',
      roomId: row.roomId,
      roomNumber: row.room_number,
      fromStatus: row.roomStatus,
      tenant: row.tenantName,
      contractId: row.contractId,
      rate,
    });
    if (!dryRun) {
      await db('rooms').where({ id: row.roomId }).update({
        status: 'occupied',
        current_rate_without_vat: rate,
        updated_at: db.fn.now(),
      });
    }
  }

  if (!dryRun && actions.length) invalidateRentRegisterCache(pid);

  return {
    dryRun,
    propertyId: pid,
    fixed: actions.length,
    actions,
  };
}

module.exports = { repairSyncLeasedRoomStatus };
