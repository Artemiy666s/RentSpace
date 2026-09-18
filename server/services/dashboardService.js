const dayjs = require('dayjs');
const { db } = require('../db');
const { getMonthReadiness } = require('./monthCloseService');
const { listRentRegister } = require('./managerDataService');
const { maxDueRentMonth, maxDueUtilityMonth, nowInMinsk } = require('../utils/billingPeriod');
const { roomRentableArea, isOccupiedForArea, sumRentableArea } = require('../utils/rentableArea');

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Задолженность по аренде + коммунальные.
 * Цифры совпадают с реестром «Аренда по счетам» (те же договоры и правила 15-го числа).
 */
async function buildRentDebtAndUtilities(propertyId, year, registerRowsPreloaded = null) {
  const registerRows = registerRowsPreloaded || (await listRentRegister(propertyId, year));
  const dueThrough = maxDueRentMonth(year);

  const monthTotals = {};
  const debtBreakdown = [];

  for (const row of registerRows) {
    let yearPaid = 0;
    for (let m = 1; m <= 12; m++) {
      yearPaid += Number(row.months?.[m]?.paid || 0);
    }
    let paidLeft = roundMoney(yearPaid);

    let contractDebt = 0;
    const months = [];
    for (let m = 1; m <= dueThrough; m++) {
      const charged = Number(row.months?.[m]?.rent || 0);
      if (!charged && paidLeft <= 0) continue;
      const applied = Math.min(charged, paidLeft);
      paidLeft = roundMoney(paidLeft - applied);
      const debt = Math.max(0, charged - applied);
      if (debt <= 0.005) continue;
      months.push({ month: m, debt: roundMoney(debt) });
      contractDebt = roundMoney(contractDebt + debt);
      monthTotals[m] = (monthTotals[m] || 0) + debt;
    }

    // Итог по договору — как колонка «Задолженность» в реестре
    const registerDebt = roundMoney(row.debt || 0);
    if (registerDebt <= 0.005) continue;

    debtBreakdown.push({
      contractId: row.contractId,
      tenantName: row.tenantName || '—',
      contractNumber: row.contractLabel || String(row.contractId),
      debt: registerDebt,
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

  const debt = roundMoney(registerRows.reduce((s, row) => s + Number(row.debt || 0), 0));

  const utilDueThrough = maxDueUtilityMonth(year);
  const utilMonths = [];
  for (let m = 1; m <= utilDueThrough; m++) {
    let charged = 0;
    let paid = 0;
    for (const row of registerRows) {
      charged += Number(row.months?.[m]?.utility || 0);
      paid += Number(row.months?.[m]?.utilityPaid || 0);
    }
    charged = roundMoney(charged);
    paid = roundMoney(paid);
    if (!charged && !paid) continue;
    utilMonths.push({ year, month: m, charged, paid });
  }
  utilMonths.sort((a, b) => b.month - a.month);

  const utilities = {
    charged: roundMoney(utilMonths.reduce((s, row) => s + row.charged, 0)),
    paid: roundMoney(utilMonths.reduce((s, row) => s + row.paid, 0)),
    months: utilMonths,
  };

  const utilitiesPrevMonth =
    utilMonths[0] ||
    (utilDueThrough > 0 ? { year, month: utilDueThrough, charged: 0, paid: 0 } : null);

  return { debt, debtMonths, debtBreakdown, utilities, utilitiesPrevMonth };
}

/** KPI, графики и аналитика — одни и те же для директора, зама и заведующей */
async function buildDirectorAnalytics(propertyId, organizationId) {
  const rooms = await db('rooms')
    .where({ property_id: propertyId })
    .whereNull('deleted_at');

  // «Общая торговая» / свободная — только сдаваемая площадь (без технических, коридоров и т.п.)
  const totalArea = sumRentableArea(rooms);
  const occupiedArea = sumRentableArea(rooms, (r) => isOccupiedForArea(r.status));
  const freeArea = Math.max(0, totalArea - occupiedArea);
  const freeRentableArea = freeArea;
  const occupancy = totalArea > 0 ? Math.round((occupiedArea / totalArea) * 1000) / 10 : 0;

  const minsk = nowInMinsk();
  const year = minsk.year;
  const rentPeriodMonth = maxDueRentMonth(year);

  const registerRows = await listRentRegister(propertyId, year);
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

  // Графики только по договорам реестра (не «осиротевшие» начисления)
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

  const expensesByMonth = await db('expenses')
    .where({ property_id: propertyId, period_year: year })
    .groupBy('period_month')
    .sum('amount as total')
    .select('period_month');

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

  const debtors = organizationId
    ? await db('tenants').where({ organization_id: organizationId, status: 'debtor' }).limit(10)
    : [];

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

  const occupancyByFloorRows = await db('rooms as r')
    .join('floors as f', 'f.id', 'r.floor_id')
    .where('r.property_id', propertyId)
    .whereNull('r.deleted_at')
    .select(
      'f.id as floor_id',
      'f.name',
      'f.level_number',
      'r.area',
      'r.rentable_area',
      'r.status',
      'r.room_type'
    );

  const floorMap = new Map();
  for (const row of occupancyByFloorRows) {
    const key = row.floor_id;
    if (!floorMap.has(key)) {
      floorMap.set(key, {
        name: row.name,
        level_number: row.level_number,
        total: 0,
        occupied_count: 0,
        total_area: 0,
        occupied_area: 0,
      });
    }
    const bucket = floorMap.get(key);
    const sqm = roomRentableArea(row);
    if (sqm <= 0 && !isOccupiedForArea(row.status)) {
      // техническое / не сдаётся — не в торговую площадь и не в счётчик сдаваемых
      continue;
    }
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
  const director = await buildDirectorAnalytics(propertyId, organizationId);
  const today = dayjs().format('YYYY-MM-DD');
  const todayPayments = await db('payments as p')
    .leftJoin('tenants as t', 't.id', 'p.tenant_id')
    .leftJoin('contracts as c', 'c.id', 'p.contract_id')
    .where({ 'p.property_id': propertyId })
    .where('p.payment_date', today)
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

  const minsk = nowInMinsk();
  let monthReadiness = null;
  try {
    monthReadiness = await getMonthReadiness(propertyId, minsk.year, minsk.month);
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

/** Один и тот же дашборд для директора / зама / заведующей */
async function getDirectorDashboard(propertyId, organizationId) {
  return getManagerDashboard(propertyId, organizationId);
}

module.exports = { getDirectorDashboard, getManagerDashboard };
