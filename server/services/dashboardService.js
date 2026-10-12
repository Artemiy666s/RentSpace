const dayjs = require('dayjs');
const { db } = require('../db');
const { getMonthReadinessLite } = require('./monthCloseService');
const { listRentRegister } = require('./managerDataService');
const {
  maxDueRentMonth,
  maxDebtRentMonth,
  maxDueUtilityMonth,
  nowInMinsk,
} = require('../utils/billingPeriod');
const { roomRentableArea, isOccupiedForArea, sumRentableArea } = require('../utils/rentableArea');
const { cacheWrap } = require('../utils/ttlCache');

const DASHBOARD_TTL_MS = 30_000;

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Задолженность по аренде + коммунальные — как в реестре «Нач. / Опл.»:
 * по каждому месяцу и договору долг = max(0, начислено − оплачено за этот месяц).
 * Текущий месяц аренды в просрочку не входит (счета с 10-го ещё не «долг»).
 * Без FIFO/перекидывания оплат между месяцами и договорами.
 */
async function buildRentDebtAndUtilities(propertyId, year, registerRowsPreloaded = null) {
  const registerRows =
    registerRowsPreloaded || (await listRentRegister(propertyId, year, null, { ensureCharges: false }));
  const dueThrough = maxDebtRentMonth(year);

  const monthTotals = {};
  const debtBreakdown = [];
  let debt = 0;

  for (const row of registerRows) {
    const months = [];
    let rowDebt = 0;
    for (let m = 1; m <= dueThrough; m += 1) {
      const charged = Number(row.months?.[m]?.rent || 0);
      const paid = Number(row.months?.[m]?.paid || 0);
      const monthDebt = roundMoney(Math.max(0, charged - paid));
      if (monthDebt <= 0.005) continue;
      months.push({ month: m, debt: monthDebt });
      monthTotals[m] = roundMoney((monthTotals[m] || 0) + monthDebt);
      rowDebt = roundMoney(rowDebt + monthDebt);
    }
    if (rowDebt <= 0.005) continue;
    debt = roundMoney(debt + rowDebt);
    debtBreakdown.push({
      contractId: row.contractId,
      tenantName: row.tenantName || '—',
      contractNumber: row.contractLabel || String(row.contractId),
      debt: rowDebt,
      months: months.sort((a, b) => b.month - a.month),
    });
  }

  debtBreakdown.sort((a, b) => b.debt - a.debt || a.tenantName.localeCompare(b.tenantName, 'ru'));

  const debtMonths = Object.entries(monthTotals)
    .map(([month, amount]) => ({
      year,
      month: Number(month),
      amount: roundMoney(amount),
    }))
    .filter((row) => row.amount > 0.005)
    .sort((a, b) => b.month - a.month);

  const utilDueThrough = maxDueUtilityMonth(year);
  const utilMonths = [];
  const utilMonthDebtTotals = {};
  let utilityDebt = 0;

  for (let m = 1; m <= utilDueThrough; m += 1) {
    let charged = 0;
    let paid = 0;
    let monthDebt = 0;
    for (const row of registerRows) {
      const c = Number(row.months?.[m]?.utility || 0);
      const p = Number(row.months?.[m]?.utilityPaid || 0);
      charged += c;
      paid += p;
      monthDebt += Math.max(0, c - p);
    }
    charged = roundMoney(charged);
    paid = roundMoney(paid);
    monthDebt = roundMoney(monthDebt);
    if (charged || paid) utilMonths.push({ year, month: m, charged, paid });
    if (monthDebt > 0.005) {
      utilMonthDebtTotals[m] = monthDebt;
      utilityDebt = roundMoney(utilityDebt + monthDebt);
    }
  }
  utilMonths.sort((a, b) => b.month - a.month);

  const utilityDebtMonths = Object.entries(utilMonthDebtTotals)
    .map(([month, amount]) => ({
      year,
      month: Number(month),
      amount: roundMoney(amount),
    }))
    .filter((row) => row.amount > 0.005)
    .sort((a, b) => b.month - a.month);

  const utilities = {
    charged: roundMoney(utilMonths.reduce((s, row) => s + row.charged, 0)),
    paid: roundMoney(utilMonths.reduce((s, row) => s + row.paid, 0)),
    debt: utilityDebt,
    debtMonths: utilityDebtMonths,
    months: utilMonths,
  };

  const utilitiesPrevMonth =
    utilMonths[0] ||
    (utilDueThrough > 0 ? { year, month: utilDueThrough, charged: 0, paid: 0 } : null);

  return { debt, debtMonths, debtBreakdown, utilities, utilitiesPrevMonth };
}

/** KPI, графики и аналитика — одни и те же для директора, зама и заведующей */
async function buildDirectorAnalytics(propertyId, organizationId) {
  const minsk = nowInMinsk();
  const year = minsk.year;
  const rentPeriodMonth = maxDueRentMonth(year);
  const today = dayjs().format('YYYY-MM-DD');
  const in60 = dayjs().add(60, 'day').format('YYYY-MM-DD');

  const asOf = today;
  const [roomsWithFloor, registerRows, expensesByMonth, expiring, debtors, leasedIds] =
    await Promise.all([
      db('rooms as r')
        .leftJoin('buildings as b', 'b.id', 'r.building_id')
        .leftJoin('floors as f', 'f.id', 'r.floor_id')
        .where('r.property_id', propertyId)
        .whereNull('r.deleted_at')
        .select(
          'r.id',
          'r.room_number',
          'r.name',
          'r.area',
          'r.rentable_area',
          'r.status',
          'r.room_type',
          'r.building_id',
          'r.floor_id',
          'b.name as building_name',
          'f.name as floor_name',
          'f.level_number',
          'f.id as floor_pk'
        ),
      // Дашборд только читает: ensureDueRentCharges — на странице реестра, не здесь.
      listRentRegister(propertyId, year, null, { ensureCharges: false }),
      db('expenses')
        .where({ property_id: propertyId, period_year: year })
        .groupBy('period_month')
        .sum('amount as total')
        .select('period_month'),
      db('contracts')
        .where({ property_id: propertyId, status: 'active' })
        .where('end_date', '<=', in60)
        .where('end_date', '>=', today)
        .limit(10),
      organizationId
        ? db('tenants').where({ organization_id: organizationId, status: 'debtor' }).limit(10)
        : Promise.resolve([]),
      db('contract_rooms as cr')
        .join('contracts as c', 'c.id', 'cr.contract_id')
        .where('c.property_id', propertyId)
        .whereIn('c.status', ['active', 'expiring'])
        .whereNull('c.deleted_at')
        .where(function () {
          this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', asOf);
        })
        .pluck('cr.room_id'),
    ]);

  const rooms = roomsWithFloor;
  const leased = new Set(leasedIds.map((id) => Number(id)));
  for (const r of rooms) {
    if (leased.has(Number(r.id)) && !isOccupiedForArea(r.status)) r.status = 'occupied';
  }
  const totalArea = sumRentableArea(rooms);
  const occupiedArea = sumRentableArea(rooms, (r) => isOccupiedForArea(r.status));
  const freeArea = Math.max(0, totalArea - occupiedArea);
  const freeRentableArea = freeArea;
  const occupancy = totalArea > 0 ? Math.round((occupiedArea / totalArea) * 1000) / 10 : 0;

  const charged =
    rentPeriodMonth > 0
      ? registerRows.reduce(
          (s, row) => s + Number(row.months?.[rentPeriodMonth]?.rent || 0),
          0
        )
      : 0;
  const paid =
    rentPeriodMonth > 0
      ? registerRows.reduce(
          (s, row) => s + Number(row.months?.[rentPeriodMonth]?.paid || 0),
          0
        )
      : 0;

  const { debt, debtMonths, debtBreakdown, utilities, utilitiesPrevMonth } =
    await buildRentDebtAndUtilities(propertyId, year, registerRows);

  const revenueByMonth = [];
  const paymentsByMonth = [];
  for (let m = 1; m <= 12; m++) {
    let rent = 0;
    let rentPaid = 0;
    for (const row of registerRows) {
      rent += Number(row.months?.[m]?.rent || 0);
      rentPaid += Number(row.months?.[m]?.paid || 0);
    }
    if (rent) revenueByMonth.push({ period_month: m, total: roundMoney(rent) });
    if (rentPaid) paymentsByMonth.push({ period_month: m, total: roundMoney(rentPaid) });
  }

  const statusCounts = {};
  for (const r of rooms) {
    const st = r.status || 'unknown';
    statusCounts[st] = (statusCounts[st] || 0) + 1;
  }
  const roomsByStatus = Object.entries(statusCounts).map(([status, count]) => ({
    status,
    count,
  }));

  const freeRooms = rooms
    .filter((r) => ['free', 'ready_for_rent'].includes(r.status))
    .sort((a, b) => String(a.room_number).localeCompare(String(b.room_number), 'ru'))
    .slice(0, 10)
    .map((r) => ({
      id: r.id,
      room_number: r.room_number,
      name: r.name,
      area: r.area,
      status: r.status,
      room_type: r.room_type,
      building_name: r.building_name,
      floor_name: r.floor_name,
      level_number: r.level_number,
    }));

  const floorMap = new Map();
  for (const row of rooms) {
    const key = row.floor_pk || row.floor_id || `f-${row.floor_name}`;
    if (!floorMap.has(key)) {
      floorMap.set(key, {
        name: row.floor_name,
        level_number: row.level_number,
        total: 0,
        occupied_count: 0,
        total_area: 0,
        occupied_area: 0,
      });
    }
    const bucket = floorMap.get(key);
    const sqm = roomRentableArea(row);
    if (sqm <= 0 && !isOccupiedForArea(row.status)) continue;
    bucket.total += 1;
    bucket.total_area += sqm;
    if (isOccupiedForArea(row.status)) {
      bucket.occupied_count += 1;
      bucket.occupied_area += sqm;
    }
  }
  const occupancyByFloor = Array.from(floorMap.values());

  return {
    kpis: {
      totalArea,
      occupiedArea,
      freeArea,
      freeRentableArea,
      occupancy,
      rentMonth: roundMoney(charged),
      debt,
      debtMonths,
      paidMonth: roundMoney(paid),
      utilities,
      utilitiesPrevMonth,
    },
    debtBreakdown,
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
  const pid = Number(propertyId);
  const oid = organizationId == null ? 0 : Number(organizationId);
  const cacheKey = `dashboard:v5:${pid}:${oid}`;

  return cacheWrap(cacheKey, DASHBOARD_TTL_MS, async () => {
    const today = dayjs().format('YYYY-MM-DD');
    const minsk = nowInMinsk();

    const [
      director,
      todayPayments,
      requests,
      activity,
      negotiations,
      debtRooms,
      expiringSoon,
      monthReadiness,
    ] = await Promise.all([
      buildDirectorAnalytics(pid, organizationId),
      db('payments as p')
        .leftJoin('tenants as t', 't.id', 'p.tenant_id')
        .leftJoin('contracts as c', 'c.id', 'p.contract_id')
        .where({ 'p.property_id': pid })
        .where('p.payment_date', today)
        .select(
          'p.id',
          'p.amount',
          'p.payment_type',
          'p.payment_date',
          't.name as tenant_name',
          'c.contract_number'
        )
        .orderBy('p.amount', 'desc'),
      db('service_requests')
        .where({ property_id: pid })
        .whereNot('status', 'closed')
        .orderBy('created_at', 'desc')
        .limit(5),
      db('activity_events')
        .where({ property_id: pid })
        .orderBy('created_at', 'desc')
        .limit(15),
      db('room_negotiations as n')
        .join('rooms as r', 'r.id', 'n.room_id')
        .join('buildings as b', 'b.id', 'r.building_id')
        .join('floors as f', 'f.id', 'r.floor_id')
        .where('r.property_id', pid)
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
        .limit(8)
        .catch(() => []),
      db('rooms as r')
        .join('buildings as b', 'b.id', 'r.building_id')
        .join('floors as f', 'f.id', 'r.floor_id')
        .where({ 'r.property_id': pid, 'r.status': 'debt' })
        .whereNull('r.deleted_at')
        .select(
          'r.id',
          'r.room_number',
          'r.room_type',
          'b.name as building_name',
          'f.name as floor_name',
          'f.level_number'
        )
        .limit(8),
      db('contracts as c')
        .join('tenants as t', 't.id', 'c.tenant_id')
        .where({ 'c.property_id': pid, 'c.status': 'active' })
        .where('c.end_date', '<=', dayjs().add(30, 'day').format('YYYY-MM-DD'))
        .where('c.end_date', '>=', dayjs().format('YYYY-MM-DD'))
        .select('c.id', 'c.contract_number', 'c.end_date', 't.name as tenant_name')
        .limit(8),
      getMonthReadinessLite(pid, minsk.year, minsk.month).catch(() => null),
    ]);

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
  });
}

/** Один и тот же дашборд для директора / зама / заведующей */
async function getDirectorDashboard(propertyId, organizationId) {
  return getManagerDashboard(propertyId, organizationId);
}

module.exports = { getDirectorDashboard, getManagerDashboard };
