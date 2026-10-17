const dayjs = require('dayjs');
const { db } = require('../db');
const { invalidateRentRegisterCache } = require('./managerDataService');

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Энджой: paper total 167.7@13 (= 2616.12 с НДС).
 * В сент/окт рядом с общей строкой 167.7 повисли покомнатные — задвоение площади.
 * Оплаты за сентябрь как раз = 2616.12 (полная правильная аренда).
 * Чиним: оставляем общую 167.7, отменяем per-room в тех же месяцах.
 */
async function repairEnjoyCharges({ propertyId = 1, year = 2026, dryRun = true } = {}) {
  const pid = Number(propertyId) || 1;
  const y = Number(year) || dayjs().year();
  const actions = [];

  const tenant = await db('tenants')
    .where('name', 'like', '%ЭНДЖОЙ%')
    .whereNull('deleted_at')
    .first();
  if (!tenant) return { error: 'tenant_not_found', dryRun };

  const contract = await db('contracts')
    .where({ tenant_id: tenant.id, property_id: pid })
    .whereNull('deleted_at')
    .whereIn('status', ['active', 'expiring'])
    .orderBy('id', 'asc')
    .first();
  if (!contract) {
    return { error: 'live_contract_not_found', dryRun, tenantId: tenant.id };
  }

  const charges = await db('rent_charges')
    .where({ contract_id: contract.id, period_year: y })
    .whereNot('status', 'cancelled')
    .select(
      'id',
      'period_month',
      'room_id',
      'area',
      'rate_without_vat',
      'amount_with_vat',
      'amount_without_vat'
    )
    .orderBy(['period_month', 'id']);

  const byMonth = new Map();
  for (const row of charges) {
    const m = Number(row.period_month);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(row);
  }

  const cancelIds = [];
  for (const [month, rows] of byMonth) {
    const wholes = rows.filter(
      (r) => r.room_id == null || Math.abs(Number(r.area || 0) - 167.7) <= 0.35
    );
    const rooms = rows.filter(
      (r) => r.room_id != null && Math.abs(Number(r.area || 0) - 167.7) > 0.35
    );
    if (!wholes.length || !rooms.length) continue;

    const keep = wholes.sort((a, b) => Number(b.amount_with_vat) - Number(a.amount_with_vat))[0];
    const drop = [
      ...rooms.map((r) => r.id),
      ...wholes.filter((r) => r.id !== keep.id).map((r) => r.id),
    ];
    cancelIds.push(...drop);
    actions.push({
      type: 'drop_room_charges_beside_total_167_7',
      month,
      keepId: keep.id,
      keepAmount: Number(keep.amount_with_vat),
      dropIds: drop,
      dropSum: roundMoney(drop.reduce((s, id) => {
        const row = rows.find((r) => r.id === id);
        return s + Number(row?.amount_with_vat || 0);
      }, 0)),
      roomAreas: rooms.map((r) => Number(r.area)),
    });
  }

  if (!dryRun && cancelIds.length) {
    await db('rent_charges')
      .whereIn('id', [...new Set(cancelIds)])
      .update({
        status: 'cancelled',
        manual_adjustment: true,
        adjustment_reason: 'enjoy_cancel_room_beside_total_167_7',
        updated_at: db.fn.now(),
      });
    invalidateRentRegisterCache(pid);
  }

  const after = dryRun
    ? null
    : await db('rent_charges')
        .where({ contract_id: contract.id, period_year: y })
        .whereNot('status', 'cancelled')
        .select('period_month', 'room_id', 'area', 'amount_with_vat')
        .orderBy(['period_month', 'id']);

  return {
    dryRun,
    tenantId: tenant.id,
    tenantName: tenant.name,
    contractId: contract.id,
    actions,
    cancelledCount: [...new Set(cancelIds)].length,
    after,
  };
}

module.exports = { repairEnjoyCharges };
