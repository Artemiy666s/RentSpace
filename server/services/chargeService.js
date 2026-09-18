const dayjs = require('dayjs');
const { db } = require('../db');
const { calcRentAmount } = require('../utils/rent');
const { CHARGE_DAY, nowInMinsk } = require('../utils/billingPeriod');

/** Последний месяц, за который аренда уже должна быть начислена (Europe/Minsk, после 15-го). */
function lastDueRentYm(asOf = new Date()) {
  const now = nowInMinsk(asOf);
  let year = now.year;
  let month = now.day >= CHARGE_DAY ? now.month : now.month - 1;
  if (month <= 0) {
    month = 12;
    year -= 1;
  }
  return { year, month };
}

/**
 * Создаёт отсутствующие начисления аренды по объекту за все месяцы
 * от fromDate (или начала текущего года) до последнего «наступившего» месяца.
 */
async function ensureDueRentCharges({ organizationId, propertyId, fromDate, userId, asOf = new Date() }) {
  const due = lastDueRentYm(asOf);
  const start = dayjs(fromDate || `${due.year}-01-01`).startOf('month');
  let y = start.year();
  let m = start.month() + 1;
  const created = [];

  while (y < due.year || (y === due.year && m <= due.month)) {
    const ids = await generateRentCharges({
      organizationId,
      propertyId,
      year: y,
      month: m,
      userId,
    });
    created.push(...ids);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return created;
}

async function generateRentCharges({ organizationId, propertyId, year, month, userId }) {
  const periodStart = dayjs(`${year}-${month}-01`).format('YYYY-MM-DD');
  const periodEnd = dayjs(`${year}-${month}-01`).endOf('month').format('YYYY-MM-DD');

  const activeRooms = await db('contract_rooms as cr')
    .join('contracts as c', 'c.id', 'cr.contract_id')
    .join('rooms as r', 'r.id', 'cr.room_id')
    .where('c.organization_id', organizationId)
    .where('c.property_id', propertyId)
    .where('c.status', 'active')
    .where('cr.start_date', '<=', periodEnd)
    .where(function () {
      this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', periodStart);
    })
    .select(
      'cr.*',
      'c.tenant_id',
      'c.vat_rate',
      'c.start_date as contract_start',
      'c.end_date as contract_end',
      'r.id as room_id'
    );

  const created = [];
  for (const row of activeRooms) {
    const existing = await db('rent_charges').where({
      contract_id: row.contract_id,
      room_id: row.room_id,
      period_year: year,
      period_month: month,
    }).whereNot('status', 'cancelled').first();

    if (existing) continue;

    const amounts = calcRentAmount({
      area: row.area,
      rateWithoutVat: row.rate_without_vat,
      vatRate: row.vat_rate,
      year,
      month,
      startDate: row.start_date || row.contract_start,
      endDate: row.end_date || row.contract_end,
    });

    const [id] = await db('rent_charges').insert({
      organization_id: organizationId,
      property_id: propertyId,
      tenant_id: row.tenant_id,
      contract_id: row.contract_id,
      room_id: row.room_id,
      period_year: year,
      period_month: month,
      area: row.area,
      rate_without_vat: row.rate_without_vat,
      vat_rate: row.vat_rate,
      amount_without_vat: amounts.amountWithoutVat,
      vat_amount: amounts.vatAmount,
      amount_with_vat: amounts.amountWithVat,
      status: 'charged',
      created_by: userId,
    });
    created.push(id);
  }
  return created;
}

module.exports = { generateRentCharges, ensureDueRentCharges, lastDueRentYm };
