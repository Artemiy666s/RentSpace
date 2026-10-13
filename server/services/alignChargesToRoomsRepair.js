const dayjs = require('dayjs');
const { db } = require('../db');
const { calcRentAmount } = require('../utils/rent');
const { ensureDueRentCharges } = require('./chargeService');
const { invalidateRentRegisterCache } = require('./managerDataService');
const { auditSeptRoomCharges } = require('./septRoomChargeAudit');

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function expectedFromLinks(links, contract, year, month) {
  const vatRate = Number(contract.vat_rate) || 20;
  return roundMoney(
    links.reduce((sum, link) => {
      const amounts = calcRentAmount({
        area: link.area,
        rateWithoutVat: link.rate_without_vat,
        vatRate,
        year,
        month,
        startDate: link.start_date || contract.start_date,
        endDate: link.end_date || contract.end_date,
      });
      return sum + amounts.amountWithVat;
    }, 0)
  );
}

/**
 * Align 2026 rent charges (from fromMonth) to current room links.
 * - Type B (open rooms, wrong sum): cancel year charges + regenerate from links
 * - Type A with closed links matching charge footprint: clear end_date, then rebuild
 * - Type A with no links at all: cancel year charges (ghost ledger)
 * Read-only when dryRun=true.
 */
async function alignChargesToRooms({
  propertyId = 1,
  year = 2026,
  fromMonth = 3,
  dryRun = true,
  eps = 0.02,
} = {}) {
  const pid = Number(propertyId) || 1;
  const y = Number(year) || 2026;
  const fromM = Math.max(1, Math.min(12, Number(fromMonth) || 3));
  const asOf = dayjs().format('YYYY-MM-DD');

  const mismatchIds = new Set();
  const audits = [];
  for (let m = fromM; m <= 9; m += 1) {
    const audit = await auditSeptRoomCharges({ propertyId: pid, year: y, month: m, eps });
    audits.push({ month: m, summary: audit.summary, mismatchCount: audit.mismatches.length });
    for (const row of audit.mismatches) mismatchIds.add(row.contractId);
  }

  const plans = [];
  for (const contractId of [...mismatchIds].sort((a, b) => a - b)) {
    const contract = await db('contracts as c')
      .join('tenants as t', 't.id', 'c.tenant_id')
      .where('c.id', contractId)
      .select(
        'c.id',
        'c.organization_id',
        'c.property_id',
        'c.tenant_id',
        'c.status',
        'c.vat_rate',
        'c.start_date',
        'c.end_date',
        'c.contract_number',
        't.name as tenantName'
      )
      .first();
    if (!contract) continue;

    const allLinks = await db('contract_rooms as cr')
      .join('rooms as r', 'r.id', 'cr.room_id')
      .where('cr.contract_id', contractId)
      .select(
        'cr.id as linkId',
        'cr.room_id',
        'cr.area',
        'cr.rate_without_vat',
        'cr.start_date',
        'cr.end_date',
        'r.room_number',
        'r.status as roomStatus'
      );

    const openLinks = allLinks.filter(
      (l) => !l.end_date || dayjs(l.end_date).format('YYYY-MM-DD') >= asOf
    );
    const closedLinks = allLinks.filter(
      (l) => l.end_date && dayjs(l.end_date).format('YYYY-MM-DD') < asOf
    );

    const liveCharges = await db('rent_charges')
      .where({ contract_id: contractId, period_year: y })
      .whereNot('status', 'cancelled')
      .where('period_month', '>=', fromM)
      .select('id', 'period_month', 'amount_with_vat', 'area', 'rate_without_vat', 'room_id');

    const chargedSum = roundMoney(
      liveCharges.reduce((s, r) => s + Number(r.amount_with_vat || 0), 0)
    );

    // Rooms currently taken by another live contract
    const roomIds = allLinks.map((l) => l.room_id);
    let roomsTakenElsewhere = [];
    if (roomIds.length) {
      roomsTakenElsewhere = await db('contract_rooms as cr')
        .join('contracts as c', 'c.id', 'cr.contract_id')
        .join('tenants as t', 't.id', 'c.tenant_id')
        .whereIn('cr.room_id', roomIds)
        .whereNot('cr.contract_id', contractId)
        .whereNull('c.deleted_at')
        .whereIn('c.status', ['active', 'expiring'])
        .where(function () {
          this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', asOf);
        })
        .select('cr.room_id', 'c.id as otherContractId', 't.name as otherTenant');
    }

    let action = 'skip';
    let reason = '';
    let clearLinkIds = [];
    let expectedAfter = 0;

    if (openLinks.length > 0) {
      action = 'rebuild_from_open_links';
      reason = 'open_rooms_exist_amount_or_coverage_mismatch';
      expectedAfter = expectedFromLinks(openLinks, contract, y, 9);
    } else if (closedLinks.length > 0 && roomsTakenElsewhere.length === 0) {
      // Closed only because end_date — reopen then rebuild (typical map cleanup casualty)
      action = 'reopen_links_and_rebuild';
      reason = 'only_closed_links_rooms_free';
      clearLinkIds = closedLinks.map((l) => l.linkId);
      expectedAfter = expectedFromLinks(
        closedLinks.map((l) => ({ ...l, end_date: null })),
        contract,
        y,
        9
      );
    } else if (closedLinks.length > 0 && roomsTakenElsewhere.length > 0) {
      action = 'cancel_charges_rooms_taken';
      reason = 'links_closed_and_rooms_occupied_by_others';
      expectedAfter = 0;
    } else if (allLinks.length === 0 && liveCharges.length > 0) {
      action = 'cancel_charges_no_links';
      reason = 'ghost_charges_without_any_room_links';
      expectedAfter = 0;
    } else {
      action = 'skip';
      reason = 'no_actionable_state';
    }

    plans.push({
      contractId,
      tenantName: contract.tenantName,
      contractNumber: contract.contract_number || '',
      action,
      reason,
      openLinkCount: openLinks.length,
      closedLinkCount: closedLinks.length,
      chargeCountFromMonth: liveCharges.length,
      chargedSumFromMonth: chargedSum,
      expectedSeptAfter: expectedAfter,
      clearLinkIds,
      roomsTakenElsewhere: roomsTakenElsewhere.slice(0, 10),
      openRooms: openLinks.map((l) => ({
        roomNumber: l.room_number,
        area: Number(l.area),
        rate: Number(l.rate_without_vat),
      })),
      closedRooms: closedLinks.map((l) => ({
        roomNumber: l.room_number,
        area: Number(l.area),
        rate: Number(l.rate_without_vat),
        endDate: l.end_date,
      })),
    });
  }

  const applied = [];
  if (!dryRun) {
    for (const plan of plans) {
      if (plan.action === 'skip') continue;

      if (
        plan.action === 'reopen_links_and_rebuild' &&
        plan.clearLinkIds.length
      ) {
        await db('contract_rooms').whereIn('id', plan.clearLinkIds).update({
          end_date: null,
          updated_at: db.fn.now(),
        });
      }

      if (
        plan.action === 'rebuild_from_open_links' ||
        plan.action === 'reopen_links_and_rebuild'
      ) {
        const live = await db('rent_charges')
          .where({ contract_id: plan.contractId, period_year: y })
          .whereNot('status', 'cancelled')
          .pluck('id');
        if (live.length) {
          await db('rent_charges').whereIn('id', live).update({
            status: 'cancelled',
            manual_adjustment: true,
            adjustment_reason: `align_rooms_${plan.action}`,
            updated_at: db.fn.now(),
          });
        }
        const contract = await db('contracts').where({ id: plan.contractId }).first();
        const created = await ensureDueRentCharges({
          organizationId: contract.organization_id,
          propertyId: pid,
          fromDate: `${y}-01-01`,
          contractId: plan.contractId,
          onlyLastDue: false,
          userId: null,
        });
        applied.push({
          contractId: plan.contractId,
          tenantName: plan.tenantName,
          action: plan.action,
          cancelled: live.length,
          created: created.length,
        });
        continue;
      }

      if (
        plan.action === 'cancel_charges_no_links' ||
        plan.action === 'cancel_charges_rooms_taken'
      ) {
        const live = await db('rent_charges')
          .where({ contract_id: plan.contractId, period_year: y })
          .whereNot('status', 'cancelled')
          .where('period_month', '>=', fromM)
          .pluck('id');
        if (live.length) {
          await db('rent_charges').whereIn('id', live).update({
            status: 'cancelled',
            manual_adjustment: true,
            adjustment_reason: `align_rooms_${plan.action}`,
            updated_at: db.fn.now(),
          });
        }
        applied.push({
          contractId: plan.contractId,
          tenantName: plan.tenantName,
          action: plan.action,
          cancelled: live.length,
          created: 0,
        });
      }
    }
    invalidateRentRegisterCache(pid);
  }

  const after = [];
  for (let m = fromM; m <= 9; m += 1) {
    const audit = await auditSeptRoomCharges({ propertyId: pid, year: y, month: m, eps });
    after.push({
      month: m,
      match: audit.summary.match,
      mismatch: audit.summary.mismatch,
      expectedTotal: audit.summary.expectedTotal,
      chargedTotal: audit.summary.chargedTotal,
      diffTotal: audit.summary.diffTotal,
    });
  }

  const byAction = {};
  for (const p of plans) {
    byAction[p.action] = (byAction[p.action] || 0) + 1;
  }

  return {
    propertyId: pid,
    year: y,
    fromMonth: fromM,
    dryRun,
    auditsBefore: audits,
    planCount: plans.length,
    byAction,
    plans,
    applied,
    auditsAfter: after,
  };
}

module.exports = { alignChargesToRooms };
