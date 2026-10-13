const dayjs = require('dayjs');
const { db } = require('../db');
const { invalidateRentRegisterCache } = require('./managerDataService');

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Fix contract_rooms.start_date that landed in 19xx (century bug, e.g. 1926 instead of 2026),
 * then cancel rent_charges before the real contract/link start.
 * Dry-run by default.
 */
async function repairLinkStartCentury({
  propertyId = 1,
  year = 2026,
  dryRun = true,
  minBadYear = 1900,
  maxBadYear = 1999,
} = {}) {
  const pid = Number(propertyId) || 1;
  const y = Number(year) || 2026;

  // Load candidates in JS — SQL YEAR()/range filters proved unreliable on this TiDB path.
  const allLinks = await db('contract_rooms as cr')
    .join('contracts as c', 'c.id', 'cr.contract_id')
    .join('tenants as t', 't.id', 'c.tenant_id')
    .join('rooms as r', 'r.id', 'cr.room_id')
    .where('c.property_id', pid)
    .whereNull('c.deleted_at')
    .whereNotNull('cr.start_date')
    .whereIn('c.status', ['active', 'expiring'])
    .select(
      'cr.id as linkId',
      'cr.contract_id',
      'cr.room_id',
      'cr.start_date as linkStart',
      'cr.end_date as linkEnd',
      'c.start_date as contractStart',
      'c.contract_date as contractDate',
      'c.contract_number',
      'c.status',
      't.name as tenantName',
      'r.room_number'
    );

  const badLinks = allLinks.filter((row) => {
    const yLink = dayjs(row.linkStart).year();
    if (yLink >= minBadYear && yLink <= maxBadYear) return true;
    // Also catch "exactly 100 years before contract start"
    const anchor = row.contractStart || row.contractDate;
    if (!anchor) return false;
    const yContract = dayjs(anchor).year();
    return yContract - yLink === 100;
  });

  const plans = [];
  for (const row of badLinks) {
    const oldStart = dayjs(row.linkStart);
    const fixedStart = oldStart.add(100, 'year');
    // Prefer contract start if same month-day after +100y, else +100y on link
    const contractAnchor = row.contractStart || row.contractDate;
    let newStart = fixedStart.format('YYYY-MM-DD');
    if (contractAnchor) {
      const ca = dayjs(contractAnchor).format('YYYY-MM-DD');
      if (ca === fixedStart.format('YYYY-MM-DD')) newStart = ca;
    }

    const chargeCutoff = newStart; // cancel charges with period before this month
    const cutoffMonth = dayjs(chargeCutoff).month() + 1; // 1-12
    const cutoffYear = dayjs(chargeCutoff).year();

    const preCharges = await db('rent_charges')
      .where({ contract_id: row.contract_id })
      .whereNot('status', 'cancelled')
      .where(function () {
        this.where('period_year', '<', cutoffYear).orWhere(function () {
          this.where('period_year', cutoffYear).where('period_month', '<', cutoffMonth);
        });
      })
      .select('id', 'period_year', 'period_month', 'amount_with_vat');

    // Also cancel same-year months before start within focus year display
    const focusPre = preCharges.filter((c) => Number(c.period_year) === y);

    plans.push({
      linkId: row.linkId,
      contractId: row.contract_id,
      tenantName: row.tenantName,
      contractNumber: row.contract_number || '',
      roomNumber: row.room_number,
      oldStart: oldStart.format('YYYY-MM-DD'),
      newStart,
      contractStart: contractAnchor ? dayjs(contractAnchor).format('YYYY-MM-DD') : null,
      cancelChargeIds: preCharges.map((c) => c.id),
      cancelCount: preCharges.length,
      cancelSum: roundMoney(preCharges.reduce((s, c) => s + Number(c.amount_with_vat || 0), 0)),
      cancelFocusYearSum: roundMoney(focusPre.reduce((s, c) => s + Number(c.amount_with_vat || 0), 0)),
      cancelByMonth: focusPre.reduce((acc, c) => {
        const m = Number(c.period_month);
        acc[m] = roundMoney((acc[m] || 0) + Number(c.amount_with_vat || 0));
        return acc;
      }, {}),
    });
  }

  let fixedLinks = 0;
  let cancelledCharges = 0;
  if (!dryRun) {
    for (const plan of plans) {
      await db('contract_rooms').where({ id: plan.linkId }).update({
        start_date: plan.newStart,
        updated_at: db.fn.now(),
      });
      fixedLinks += 1;
      if (plan.cancelChargeIds.length) {
        const chunk = 400;
        for (let i = 0; i < plan.cancelChargeIds.length; i += chunk) {
          const ids = plan.cancelChargeIds.slice(i, i + chunk);
          await db('rent_charges').whereIn('id', ids).update({
            status: 'cancelled',
            manual_adjustment: true,
            adjustment_reason: 'fix_link_start_century_prestart',
            updated_at: db.fn.now(),
          });
          cancelledCharges += ids.length;
        }
      }
    }
    invalidateRentRegisterCache(pid);
  }

  return {
    propertyId: pid,
    year: y,
    dryRun,
    planCount: plans.length,
    fixedLinks: dryRun ? 0 : fixedLinks,
    cancelledCharges: dryRun ? 0 : cancelledCharges,
    cancelSumTotal: roundMoney(plans.reduce((s, p) => s + p.cancelSum, 0)),
    plans,
  };
}

module.exports = { repairLinkStartCentury };
