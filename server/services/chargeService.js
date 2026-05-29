const dayjs = require('dayjs');
const { db } = require('../db');
const { calcRentAmount } = require('../utils/rent');

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

module.exports = { generateRentCharges };
