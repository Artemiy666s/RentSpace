const dayjs = require('dayjs');
const { db } = require('../db');
const { getMonthReadiness } = require('./monthCloseService');

/** KPI, графики и аналитика для дашборда директора */
async function buildDirectorAnalytics(propertyId, organizationId) {
  const rooms = await db('rooms')
    .where({ property_id: propertyId })
    .whereNull('deleted_at');

  const totalArea = rooms.reduce((s, r) => s + Number(r.area), 0);
  const occupied = rooms.filter((r) => r.status === 'occupied' || r.status === 'debt');
  const occupiedArea = occupied.reduce((s, r) => s + Number(r.area), 0);
  const freeArea = totalArea - occupiedArea;
  const occupancy = totalArea > 0 ? Math.round((occupiedArea / totalArea) * 1000) / 10 : 0;

  const year = dayjs().year();
  const month = dayjs().month() + 1;

  const rentMonth = await db('rent_charges')
    .where({ property_id: propertyId, period_year: year, period_month: month })
    .whereNot('status', 'cancelled')
    .sum('amount_with_vat as total')
    .first();

  const paymentsMonth = await db('payments')
    .where({ property_id: propertyId, period_year: year, period_month: month })
    .sum('amount as total')
    .first();

  const charged = Number(rentMonth?.total || 0);
  const paid = Number(paymentsMonth?.total || 0);
  const debt = Math.max(0, charged - paid);

  const revenueByMonth = await db('rent_charges')
    .where({ property_id: propertyId })
    .where('period_year', year)
    .whereNot('status', 'cancelled')
    .select('period_month')
    .sum('amount_with_vat as total')
    .groupBy('period_month');

  const paymentsByMonth = await db('payments')
    .where({ property_id: propertyId, period_year: year })
    .select('period_month')
    .sum('amount as total')
    .groupBy('period_month');

  const expensesByMonth = await db('expenses')
    .where({ property_id: propertyId, period_year: year })
    .select('period_month')
    .sum('amount as total')
    .groupBy('period_month');

  const roomsByStatus = await db('rooms')
    .where({ property_id: propertyId })
    .whereNull('deleted_at')
    .select('status')
    .count('id as count')
    .groupBy('status');

  const expiring = await db('contracts')
    .where({ property_id: propertyId, status: 'active' })
    .where('end_date', '<=', dayjs().add(60, 'day').format('YYYY-MM-DD'))
    .where('end_date', '>=', dayjs().format('YYYY-MM-DD'))
    .limit(10);

  const debtors = await db('tenants')
    .where({ organization_id: organizationId, status: 'debtor' })
    .limit(10);

  const freeRooms = await db('rooms as r')
    .join('buildings as b', 'b.id', 'r.building_id')
    .join('floors as f', 'f.id', 'r.floor_id')
    .where('r.property_id', propertyId)
    .whereNull('r.deleted_at')
    .whereIn('r.status', ['free', 'ready_for_rent'])
    .select(
      'r.id',
      'r.room_number',
      'r.name',
      'r.area',
      'r.status',
      'r.room_type',
      'b.name as building_name',
      'f.name as floor_name',
      'f.level_number'
    )
    .orderBy('r.room_number', 'asc')
    .limit(10);

  const occupancyByFloor = await db('rooms as r')
    .join('floors as f', 'f.id', 'r.floor_id')
    .where('r.property_id', propertyId)
    .whereNull('r.deleted_at')
    .groupBy('f.id', 'f.name', 'f.level_number')
    .select(
      'f.name',
      'f.level_number',
      db.raw('COUNT(r.id) as total'),
      db.raw("SUM(CASE WHEN r.status IN ('occupied','debt') THEN 1 ELSE 0 END) as occupied_count"),
      db.raw('SUM(r.area) as total_area'),
      db.raw("SUM(CASE WHEN r.status IN ('occupied','debt') THEN r.area ELSE 0 END) as occupied_area")
    );

  return {
    kpis: {
      totalArea,
      occupiedArea,
      freeArea,
      occupancy,
      rentMonth: charged,
      debt,
      paidMonth: paid,
    },
    revenueByMonth,
    paymentsByMonth,
    expensesByMonth,
    roomsByStatus,
    expiringContracts: expiring,
    debtors,
    freeRooms,
    occupancyByFloor,
    chartYear: year,
  };
}

async function getManagerDashboard(propertyId, organizationId) {
  const director = await buildDirectorAnalytics(propertyId, organizationId);
  const todayPayments = await db('payments as p')
    .leftJoin('tenants as t', 't.id', 'p.tenant_id')
    .leftJoin('contracts as c', 'c.id', 'p.contract_id')
    .where({ 'p.property_id': propertyId })
    .where('p.payment_date', dayjs().format('YYYY-MM-DD'))
    .select(
      'p.id',
      'p.amount',
      'p.payment_type',
      'p.payment_date',
      't.name as tenant_name',
      'c.contract_number'
    )
    .orderBy('p.amount', 'desc');

  const requests = await db('service_requests')
    .where({ property_id: propertyId })
    .whereNot('status', 'closed')
    .orderBy('created_at', 'desc')
    .limit(5);

  const activity = await db('activity_events')
    .where({ property_id: propertyId })
    .orderBy('created_at', 'desc')
    .limit(15);

  let negotiations = [];
  try {
    negotiations = await db('room_negotiations as n')
      .join('rooms as r', 'r.id', 'n.room_id')
      .join('buildings as b', 'b.id', 'r.building_id')
      .join('floors as f', 'f.id', 'r.floor_id')
      .where('r.property_id', propertyId)
      .whereNotIn('n.status', ['converted', 'declined'])
      .select(
        'n.*',
        'r.room_number',
        'r.room_type',
        'b.name as building_name',
        'f.name as floor_name',
        'f.level_number'
      )
      .orderBy('n.next_contact_date', 'asc')
      .limit(8);
  } catch {
    negotiations = [];
  }

  const debtRooms = await db('rooms as r')
    .join('buildings as b', 'b.id', 'r.building_id')
    .join('floors as f', 'f.id', 'r.floor_id')
    .where({ 'r.property_id': propertyId, 'r.status': 'debt' })
    .whereNull('r.deleted_at')
    .select(
      'r.id',
      'r.room_number',
      'r.room_type',
      'b.name as building_name',
      'f.name as floor_name',
      'f.level_number'
    )
    .limit(8);

  const expiringSoon = await db('contracts as c')
    .join('tenants as t', 't.id', 'c.tenant_id')
    .where({ 'c.property_id': propertyId, 'c.status': 'active' })
    .where('c.end_date', '<=', dayjs().add(30, 'day').format('YYYY-MM-DD'))
    .where('c.end_date', '>=', dayjs().format('YYYY-MM-DD'))
    .select('c.id', 'c.contract_number', 'c.end_date', 't.name as tenant_name')
    .limit(8);

  const year = dayjs().year();
  const month = dayjs().month() + 1;
  let monthReadiness = null;
  try {
    monthReadiness = await getMonthReadiness(propertyId, year, month);
  } catch {
    monthReadiness = null;
  }

  return {
    ...director,
    todayPayments,
    serviceRequests: requests,
    activity,
    negotiations,
    debtRooms,
    expiringSoon,
    monthReadiness,
  };
}

/** Полный дашборд: аналитика + операционные блоки (как у заведующей) */
async function getDirectorDashboard(propertyId, organizationId) {
  return getManagerDashboard(propertyId, organizationId);
}

module.exports = { getDirectorDashboard, getManagerDashboard };
