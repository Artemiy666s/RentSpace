const dayjs = require('dayjs');
const { db } = require('../db');
const { calcRentAmount } = require('../utils/rent');

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Read-only: for each live contract, expected Sept rent from open room links
 * (area × rate × VAT, prorated) vs sum of live rent_charges for that month.
 */
async function auditSeptRoomCharges({
  propertyId = 1,
  year = 2026,
  month = 9,
  eps = 0.02,
} = {}) {
  const pid = Number(propertyId) || 1;
  const y = Number(year) || 2026;
  const m = Number(month) || 9;
  const periodStart = dayjs(`${y}-${m}-01`).format('YYYY-MM-DD');
  const periodEnd = dayjs(`${y}-${m}-01`).endOf('month').format('YYYY-MM-DD');

  const contracts = await db('contracts as c')
    .join('tenants as t', 't.id', 'c.tenant_id')
    .where({ 'c.property_id': pid })
    .whereNull('c.deleted_at')
    .whereNull('t.deleted_at')
    .whereIn('c.status', ['active', 'expiring'])
    .select(
      'c.id as contractId',
      'c.contract_number as contractNumber',
      'c.vat_rate as vatRate',
      'c.start_date as contractStart',
      'c.end_date as contractEnd',
      't.name as tenantName'
    )
    .orderBy('t.name', 'asc');

  const contractIds = contracts.map((c) => c.contractId);
  if (!contractIds.length) {
    return {
      propertyId: pid,
      year: y,
      month: m,
      readOnly: true,
      summary: { contracts: 0, match: 0, mismatch: 0, noRooms: 0, noCharge: 0 },
      rows: [],
    };
  }

  const [links, charges] = await Promise.all([
    db('contract_rooms as cr')
      .join('rooms as r', 'r.id', 'cr.room_id')
      .leftJoin('buildings as b', 'b.id', 'r.building_id')
      .whereIn('cr.contract_id', contractIds)
      .whereNull('r.deleted_at')
      .where('cr.start_date', '<=', periodEnd)
      .where(function () {
        this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', periodStart);
      })
      .select(
        'cr.contract_id',
        'cr.room_id',
        'cr.area',
        'cr.rate_without_vat',
        'cr.start_date',
        'cr.end_date',
        'r.room_number',
        'b.name as buildingName'
      )
      .orderBy(['cr.contract_id', 'r.room_number']),
    db('rent_charges')
      .where({ property_id: pid, period_year: y, period_month: m })
      .whereIn('contract_id', contractIds)
      .whereNot('status', 'cancelled')
      .select(
        'id',
        'contract_id',
        'room_id',
        'area',
        'rate_without_vat',
        'amount_without_vat',
        'amount_with_vat'
      ),
  ]);

  const linksByContract = new Map();
  for (const link of links) {
    if (!linksByContract.has(link.contract_id)) linksByContract.set(link.contract_id, []);
    linksByContract.get(link.contract_id).push(link);
  }
  const chargesByContract = new Map();
  for (const ch of charges) {
    if (!chargesByContract.has(ch.contract_id)) chargesByContract.set(ch.contract_id, []);
    chargesByContract.get(ch.contract_id).push(ch);
  }

  const rows = [];
  let match = 0;
  let mismatch = 0;
  let noRooms = 0;
  let noCharge = 0;

  for (const c of contracts) {
    const roomLinks = linksByContract.get(c.contractId) || [];
    const liveCharges = chargesByContract.get(c.contractId) || [];
    const vatRate = Number(c.vatRate) || 20;

    const rooms = roomLinks.map((link) => {
      const amounts = calcRentAmount({
        area: link.area,
        rateWithoutVat: link.rate_without_vat,
        vatRate,
        year: y,
        month: m,
        startDate: link.start_date || c.contractStart,
        endDate: link.end_date || c.contractEnd,
      });
      const label = link.room_number
        ? link.buildingName
          ? `${link.buildingName} / ${link.room_number}`
          : String(link.room_number)
        : `#${link.room_id}`;
      return {
        roomId: link.room_id,
        label,
        area: Number(link.area) || 0,
        rateWithoutVat: Number(link.rate_without_vat) || 0,
        amountWithoutVat: amounts.amountWithoutVat,
        amountWithVat: amounts.amountWithVat,
        activeDays: amounts.activeDays,
        formula: `${Number(link.area) || 0} × ${Number(link.rate_without_vat) || 0} → ${amounts.amountWithVat.toFixed(2)}`,
      };
    });

    const expected = roundMoney(rooms.reduce((s, r) => s + r.amountWithVat, 0));
    const charged = roundMoney(liveCharges.reduce((s, r) => s + Number(r.amount_with_vat || 0), 0));
    const diff = roundMoney(charged - expected);
    const absDiff = Math.abs(diff);

    let status = 'match';
    if (!rooms.length && charged <= eps) status = 'no_rooms_no_charge';
    else if (!rooms.length && charged > eps) status = 'charge_without_rooms';
    else if (rooms.length && charged <= eps) status = 'rooms_without_charge';
    else if (absDiff > eps) status = 'mismatch';

    if (status === 'match' || status === 'no_rooms_no_charge') match += 1;
    else mismatch += 1;
    if (!rooms.length) noRooms += 1;
    if (charged <= eps) noCharge += 1;

    rows.push({
      contractId: c.contractId,
      tenantName: c.tenantName,
      contractNumber: c.contractNumber || '',
      roomCount: rooms.length,
      chargeCount: liveCharges.length,
      rooms,
      charges: liveCharges.map((ch) => ({
        id: ch.id,
        roomId: ch.room_id,
        area: Number(ch.area) || 0,
        rateWithoutVat: Number(ch.rate_without_vat) || 0,
        amountWithVat: roundMoney(ch.amount_with_vat),
      })),
      expected,
      charged,
      diff,
      status,
    });
  }

  const mismatches = rows
    .filter((r) => r.status !== 'match' && r.status !== 'no_rooms_no_charge')
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  return {
    propertyId: pid,
    year: y,
    month: m,
    readOnly: true,
    eps,
    summary: {
      contracts: rows.length,
      match,
      mismatch,
      noRooms,
      noCharge,
      expectedTotal: roundMoney(rows.reduce((s, r) => s + r.expected, 0)),
      chargedTotal: roundMoney(rows.reduce((s, r) => s + r.charged, 0)),
      diffTotal: roundMoney(rows.reduce((s, r) => s + r.diff, 0)),
    },
    mismatches,
    matches: rows.filter((r) => r.status === 'match'),
  };
}

module.exports = { auditSeptRoomCharges };
