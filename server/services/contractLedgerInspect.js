const { db } = require('../db');

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/** Read-only: contracts, room links, charges, payments for a tenant. */
async function inspectContractLedger({
  propertyId = 1,
  year = 2026,
  tenantLike,
  contractId = null,
} = {}) {
  const pid = Number(propertyId) || 1;
  const y = Number(year) || 2026;
  if (!tenantLike && !contractId) return { error: 'tenantLike_or_contractId_required' };

  let contractsQ = db('contracts as c')
    .join('tenants as t', 't.id', 'c.tenant_id')
    .where({ 'c.property_id': pid })
    .whereNull('c.deleted_at')
    .select(
      'c.id as contractId',
      'c.contract_number',
      'c.contract_date',
      'c.start_date',
      'c.end_date',
      'c.status',
      'c.vat_rate',
      't.id as tenantId',
      't.name as tenantName'
    )
    .orderBy('c.id', 'asc');

  if (contractId) contractsQ = contractsQ.where('c.id', Number(contractId));
  else contractsQ = contractsQ.where('t.name', 'like', `%${tenantLike}%`);

  const contracts = await contractsQ;
  const out = [];

  for (const c of contracts) {
    const links = await db('contract_rooms as cr')
      .join('rooms as r', 'r.id', 'cr.room_id')
      .leftJoin('buildings as b', 'b.id', 'r.building_id')
      .where('cr.contract_id', c.contractId)
      .select(
        'cr.id as linkId',
        'cr.room_id',
        'cr.area',
        'cr.rate_without_vat',
        'cr.start_date',
        'cr.end_date',
        'r.room_number',
        'b.name as buildingName'
      )
      .orderBy('r.room_number');

    const charges = await db('rent_charges')
      .where({ contract_id: c.contractId, period_year: y })
      .whereNot('status', 'cancelled')
      .select(
        'id',
        'period_month',
        'room_id',
        'area',
        'rate_without_vat',
        'amount_with_vat',
        'status',
        'created_at',
        'adjustment_reason'
      )
      .orderBy(['period_month', 'id']);

    const cancelled = await db('rent_charges')
      .where({ contract_id: c.contractId, period_year: y, status: 'cancelled' })
      .select('id', 'period_month', 'amount_with_vat', 'adjustment_reason', 'updated_at')
      .orderBy('period_month');

    const payments = await db('payments')
      .where({ contract_id: c.contractId, period_year: y, payment_type: 'rent' })
      .select('id', 'period_month', 'amount', 'payment_date', 'purpose')
      .orderBy(['period_month', 'id']);

    const byMonth = {};
    for (let m = 1; m <= 12; m++) byMonth[m] = { charged: 0, paid: 0, chargeIds: [] };
    for (const ch of charges) {
      const m = Number(ch.period_month);
      byMonth[m].charged = roundMoney(byMonth[m].charged + Number(ch.amount_with_vat || 0));
      byMonth[m].chargeIds.push(ch.id);
    }
    for (const p of payments) {
      const m = Number(p.period_month);
      if (!byMonth[m]) continue;
      byMonth[m].paid = roundMoney(byMonth[m].paid + Number(p.amount || 0));
    }

    const dueCharged = roundMoney(
      Object.entries(byMonth)
        .filter(([m]) => Number(m) <= 9)
        .reduce((s, [, v]) => s + v.charged, 0)
    );
    const yearPaid = roundMoney(payments.reduce((s, p) => s + Number(p.amount || 0), 0));

    out.push({
      ...c,
      contractDate: c.contract_date,
      startDate: c.start_date,
      endDate: c.end_date,
      links: links.map((l) => ({
        linkId: l.linkId,
        roomId: l.room_id,
        label: `${l.buildingName || ''} / ${l.room_number}`.trim(),
        area: Number(l.area),
        rate: Number(l.rate_without_vat),
        startDate: l.start_date,
        endDate: l.end_date,
      })),
      chargesByMonth: byMonth,
      liveCharges: charges,
      cancelledSample: cancelled.slice(0, 40),
      payments,
      dueCharged,
      yearPaid,
      registerDebt: Math.max(0, roundMoney(dueCharged - yearPaid)),
    });
  }

  return { propertyId: pid, year: y, readOnly: true, contracts: out };
}

module.exports = { inspectContractLedger };
