const dayjs = require('dayjs');
const { db } = require('../db');
const { ensureDueRentCharges } = require('./chargeService');
const { invalidateRentRegisterCache } = require('./managerDataService');
const { calcRentAmount } = require('../utils/rent');

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function roundArea(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normRoom(num) {
  return String(num || '')
    .trim()
    .toLowerCase()
    .replace(/а/g, 'a');
}

async function findLiveContract(tenantLike, pid) {
  const tenant = await db('tenants').where('name', 'like', `%${tenantLike}%`).whereNull('deleted_at').first();
  if (!tenant) return { tenant: null, contract: null };
  const contract = await db('contracts')
    .where({ tenant_id: tenant.id, property_id: pid })
    .whereNull('deleted_at')
    .whereIn('status', ['active', 'expiring'])
    .orderBy('id', 'asc')
    .first();
  return { tenant, contract };
}

async function loadOpenLinks(contractId) {
  return db('contract_rooms as cr')
    .join('rooms as r', 'r.id', 'cr.room_id')
    .where('cr.contract_id', contractId)
    .where(function () {
      this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', dayjs().format('YYYY-MM-DD'));
    })
    .select(
      'cr.id as linkId',
      'cr.room_id',
      'cr.area',
      'cr.rate_without_vat',
      'cr.start_date',
      'cr.end_date',
      'r.room_number',
      'r.area as roomArea',
      'r.rentable_area'
    )
    .orderBy('r.room_number');
}

/** All links on contract (including ended) — needed to stop billing a room that still has end_date in current month. */
async function loadAllLinks(contractId) {
  return db('contract_rooms as cr')
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
      'r.area as roomArea'
    )
    .orderBy('r.room_number');
}

async function cancelYearCharges(contractId, year, reason, dryRun, actions) {
  const live = await db('rent_charges')
    .where({ contract_id: contractId, period_year: year })
    .whereNot('status', 'cancelled')
    .select('id', 'period_month', 'amount_with_vat', 'room_id', 'rate_without_vat');
  actions.push({
    type: 'cancel_charges',
    count: live.length,
    sum: roundMoney(live.reduce((s, r) => s + Number(r.amount_with_vat || 0), 0)),
  });
  if (!dryRun && live.length) {
    await db('rent_charges')
      .whereIn(
        'id',
        live.map((r) => r.id)
      )
      .update({
        status: 'cancelled',
        manual_adjustment: true,
        adjustment_reason: reason,
        updated_at: db.fn.now(),
      });
  }
}

async function regenerate(contract, pid, year, dryRun, actions) {
  if (dryRun) return;
  const created = await ensureDueRentCharges({
    organizationId: contract.organization_id,
    propertyId: pid,
    fromDate: `${year}-01-01`,
    contractId: contract.id,
    onlyLastDue: false,
    userId: null,
  });
  actions.push({ type: 'regenerated', count: created.length });
}

async function monthTotals(contractId, year) {
  const rows = await db('rent_charges')
    .where({ contract_id: contractId, period_year: year })
    .whereNot('status', 'cancelled')
    .select('period_month', 'amount_with_vat', 'area', 'rate_without_vat', 'room_id');
  const byMonth = {};
  const detail = {};
  for (const r of rows) {
    const m = Number(r.period_month);
    byMonth[m] = roundMoney((byMonth[m] || 0) + Number(r.amount_with_vat || 0));
    if (!detail[m]) detail[m] = [];
    detail[m].push({
      roomId: r.room_id,
      area: Number(r.area),
      rate: Number(r.rate_without_vat),
      amt: Number(r.amount_with_vat),
    });
  }
  return { rows, byMonth, detail };
}

/**
 * Safe note fixes:
 * - Billing areas/rates live on contract_rooms only.
 * - rooms.area (map geometry) is never overwritten; may restore known map areas.
 * - Zero-rate links are not billed (see chargeService skip).
 *
 * Машевский: помещение 4 = 34.4@13 → 536.64; помещение 5 на договоре, но rate 0 (не в счёте).
 * МериЛиз: 1@41.67 → 50 (already ok — no-op if match).
 * Седлер: contract_rooms paper 70.1@9 + 51.9@5; map rooms restored to 66.62 / 33.21.
 * БьютиСистем: keep link areas summing to 62.9 @21; do not rewrite map geometry.
 */
async function repairNoteDiscrepancies({ propertyId = 1, year = 2026, dryRun = true } = {}) {
  const pid = Number(propertyId) || 1;
  const y = Number(year) || dayjs().year();
  const report = { dryRun, propertyId: pid, year: y, tenants: [] };

  // ——— Машевский: только пом. 4 (34.4×13=536.64); пом. 5 не биллить ———
  {
    const actions = [];
    const { tenant, contract } = await findLiveContract('Машевск', pid);
    if (!tenant || !contract) {
      report.tenants.push({ key: 'mashevsky', error: 'not_found' });
    } else {
      // Include ended links — room 5 may have end_date mid-month but still bills Oct.
      const links = await loadAllLinks(contract.id);
      actions.push({
        type: 'links_snapshot',
        links: links.map((l) => ({
          room: l.room_number,
          roomId: l.room_id,
          linkArea: Number(l.area),
          mapArea: Number(l.roomArea),
          rate: Number(l.rate_without_vat),
          start: l.start_date,
          end: l.end_date,
        })),
      });

      for (const link of links) {
        const n = normRoom(link.room_number);
        if (n === '4') {
          const area = roundArea(Number(link.roomArea || link.area || 34.4));
          actions.push({
            type: 'bill_room',
            room: link.room_number,
            roomId: link.room_id,
            area,
            rate: 13,
            expected: calcRentAmount({
              area,
              rateWithoutVat: 13,
              year: y,
              month: 10,
              startDate: '2000-01-01',
            }).amountWithVat,
          });
          if (!dryRun) {
            await db('contract_rooms').where({ id: link.linkId }).update({
              area,
              rate_without_vat: 13,
            });
            await db('rooms').where({ id: link.room_id }).update({
              current_rate_without_vat: 13,
              updated_at: db.fn.now(),
            });
          }
        } else if (n === '5' || Number(link.room_id) === 180132) {
          actions.push({
            type: 'unlink_billing',
            room: link.room_number,
            roomId: link.room_id,
            mapArea: Number(link.roomArea),
            rate: 0,
            fromRate: Number(link.rate_without_vat),
            end: link.end_date,
          });
          if (!dryRun) {
            await db('contract_rooms').where({ id: link.linkId }).update({
              rate_without_vat: 0,
            });
          }
        }
      }

      const room5Charges = await db('rent_charges')
        .where({ contract_id: contract.id, period_year: y, room_id: 180132 })
        .whereNot('status', 'cancelled')
        .select('id', 'period_month', 'amount_with_vat');
      actions.push({
        type: 'cancel_room5_charges',
        count: room5Charges.length,
        sum: roundMoney(room5Charges.reduce((s, r) => s + Number(r.amount_with_vat || 0), 0)),
      });
      if (!dryRun && room5Charges.length) {
        await db('rent_charges')
          .whereIn(
            'id',
            room5Charges.map((r) => r.id)
          )
          .update({
            status: 'cancelled',
            manual_adjustment: true,
            adjustment_reason: 'note_mashevsky_room5_not_billed',
            updated_at: db.fn.now(),
          });
      }

      if (!dryRun) {
        await db('contracts').where({ id: contract.id }).update({
          rate_without_vat: 13,
          updated_at: db.fn.now(),
        });
      }

      await cancelYearCharges(contract.id, y, 'note_mashevsky_room4_only', dryRun, actions);
      await regenerate(contract, pid, y, dryRun, actions);
      const after = dryRun ? null : await monthTotals(contract.id, y);
      report.tenants.push({
        key: 'mashevsky',
        tenantName: tenant.name,
        contractId: contract.id,
        actions,
        afterMonths: after?.byMonth || null,
        afterDetail: after?.detail || null,
      });
    }
  }

  // ——— МериЛиз (verify only / light fix) ———
  {
    const actions = [];
    const { tenant, contract } = await findLiveContract('МериЛиз', pid);
    if (!tenant || !contract) {
      report.tenants.push({ key: 'meriliz', error: 'not_found' });
    } else {
      const links = await loadOpenLinks(contract.id);
      let needsRebuild = false;
      for (const link of links) {
        const areaOk = Math.abs(Number(link.area) - 1) < 0.01;
        const rateOk = Math.abs(Number(link.rate_without_vat) - 41.67) < 0.01;
        actions.push({
          type: 'verify_link',
          room: link.room_number,
          area: Number(link.area),
          rate: Number(link.rate_without_vat),
          ok: areaOk && rateOk,
        });
        if (!areaOk || !rateOk) {
          needsRebuild = true;
          if (!dryRun) {
            await db('contract_rooms').where({ id: link.linkId }).update({
              area: 1,
              rate_without_vat: 41.67,
            });
            await db('rooms').where({ id: link.room_id }).update({
              current_rate_without_vat: 41.67,
              updated_at: db.fn.now(),
            });
          }
        }
      }
      if (needsRebuild) {
        if (!dryRun) {
          await db('contracts').where({ id: contract.id }).update({
            rate_without_vat: 41.67,
            updated_at: db.fn.now(),
          });
        }
        await cancelYearCharges(contract.id, y, 'note_meriliz_50', dryRun, actions);
        await regenerate(contract, pid, y, dryRun, actions);
      } else {
        actions.push({ type: 'skip_rebuild', reason: 'already_matches_1x41.67' });
      }
      const after = dryRun ? null : await monthTotals(contract.id, y);
      report.tenants.push({
        key: 'meriliz',
        tenantName: tenant.name,
        contractId: contract.id,
        actions,
        afterMonths: after?.byMonth || null,
      });
    }
  }

  // ——— Седлер: billing on contract_rooms = paper; restore map geometry ———
  {
    const actions = [];
    const { tenant, contract } = await findLiveContract('Седлер', pid);
    if (!tenant || !contract) {
      report.tenants.push({ key: 'sedler', error: 'not_found' });
    } else {
      const links = await loadOpenLinks(contract.id);
      // Known map geometry (before paper billing overwrite).
      const mapGeometry = { '5a': 66.62, '5': 33.21 };
      const billing = { '5a': { area: 70.1, rate: 9 }, '5': { area: 51.9, rate: 5 } };

      for (const link of links) {
        const n = normRoom(link.room_number);
        const bill = billing[n];
        if (!bill) continue;
        const mapArea = mapGeometry[n];
        actions.push({
          type: 'set_billing_keep_map',
          room: link.room_number,
          billing: bill,
          mapArea,
          linkAreaNow: Number(link.area),
          roomAreaNow: Number(link.roomArea),
        });
        if (!dryRun) {
          await db('contract_rooms').where({ id: link.linkId }).update({
            area: bill.area,
            rate_without_vat: bill.rate,
          });
          // Restore map polygon area if we previously overwrote it with paper area.
          if (mapArea != null && Math.abs(Number(link.roomArea) - mapArea) > 0.05) {
            await db('rooms').where({ id: link.room_id }).update({
              area: mapArea,
              rentable_area: mapArea,
              current_rate_without_vat: bill.rate,
              updated_at: db.fn.now(),
            });
            actions.push({
              type: 'restore_map_area',
              room: link.room_number,
              from: Number(link.roomArea),
              to: mapArea,
            });
          } else {
            await db('rooms').where({ id: link.room_id }).update({
              current_rate_without_vat: bill.rate,
              updated_at: db.fn.now(),
            });
          }
        }
      }

      const e1 = calcRentAmount({
        area: 70.1,
        rateWithoutVat: 9,
        year: y,
        month: 10,
        startDate: '2000-01-01',
      });
      const e2 = calcRentAmount({
        area: 51.9,
        rateWithoutVat: 5,
        year: y,
        month: 10,
        startDate: '2000-01-01',
      });
      actions.push({
        type: 'expected_monthly',
        amount: roundMoney(e1.amountWithVat + e2.amountWithVat),
        note: 'paper 70.1×9 + 51.9×5 с НДС; рукопись 1077.84 ≈ если обе ставки 9 на карте',
        parts: [e1.amountWithVat, e2.amountWithVat],
      });

      // Rebuild only if current month total wrong
      const before = await monthTotals(contract.id, y);
      const oct = before.byMonth[10] || 0;
      const expected = roundMoney(e1.amountWithVat + e2.amountWithVat);
      if (Math.abs(oct - expected) > 0.05) {
        await cancelYearCharges(contract.id, y, 'note_sedler_paper_billing', dryRun, actions);
        await regenerate(contract, pid, y, dryRun, actions);
      } else {
        actions.push({ type: 'skip_rebuild', reason: 'october_already_expected', oct });
      }

      const after = dryRun ? null : await monthTotals(contract.id, y);
      report.tenants.push({
        key: 'sedler',
        tenantName: tenant.name,
        contractId: contract.id,
        actions,
        afterMonths: after?.byMonth || null,
        afterDetail: after?.detail || null,
      });
    }
  }

  // ——— БьютиСистем: verify sum≈62.9, rate 21; never scale rooms.area ———
  {
    const actions = [];
    const { tenant, contract } = await findLiveContract('БьютиСистем', pid);
    if (!tenant || !contract) {
      report.tenants.push({ key: 'beautysystem', error: 'not_found' });
    } else {
      const links = await loadOpenLinks(contract.id);
      const linkTotal = roundArea(links.reduce((s, l) => s + Number(l.area || 0), 0));
      const mapTotal = roundArea(links.reduce((s, l) => s + Number(l.roomArea || 0), 0));
      actions.push({
        type: 'area_check',
        linkTotal,
        mapTotal,
        paper: 62.9,
        rooms: links.map((l) => ({
          room: l.room_number,
          linkArea: Number(l.area),
          mapArea: Number(l.roomArea),
          rate: Number(l.rate_without_vat),
        })),
      });

      for (const link of links) {
        if (Math.abs(Number(link.rate_without_vat) - 21) > 0.01) {
          actions.push({ type: 'fix_rate', room: link.room_number, to: 21 });
          if (!dryRun) {
            await db('contract_rooms').where({ id: link.linkId }).update({ rate_without_vat: 21 });
            await db('rooms').where({ id: link.room_id }).update({
              current_rate_without_vat: 21,
              updated_at: db.fn.now(),
            });
          }
        }
      }

      // If link total drifted from paper, scale only contract_rooms (not map).
      if (Math.abs(linkTotal - 62.9) > 0.05 && links.length) {
        const scale = 62.9 / linkTotal;
        let assigned = 0;
        for (let i = 0; i < links.length; i += 1) {
          const link = links[i];
          const next =
            i === links.length - 1
              ? roundArea(62.9 - assigned)
              : roundArea(Number(link.area) * scale);
          assigned = roundArea(assigned + next);
          actions.push({
            type: 'scale_billing_area_only',
            room: link.room_number,
            from: Number(link.area),
            to: next,
            mapAreaUnchanged: Number(link.roomArea),
          });
          if (!dryRun) {
            await db('contract_rooms').where({ id: link.linkId }).update({ area: next });
          }
        }
      }

      const expected = calcRentAmount({
        area: 62.9,
        rateWithoutVat: 21,
        year: y,
        month: 10,
        startDate: '2000-01-01',
      }).amountWithVat;
      actions.push({ type: 'expected_monthly', amount: expected });

      const before = await monthTotals(contract.id, y);
      const oct = before.byMonth[10] || 0;
      if (Math.abs(oct - expected) > 0.5) {
        await cancelYearCharges(contract.id, y, 'note_beautysystem_verify', dryRun, actions);
        await regenerate(contract, pid, y, dryRun, actions);
      } else {
        actions.push({ type: 'skip_rebuild', reason: 'october_close_enough', oct, expected });
      }

      const after = dryRun ? null : await monthTotals(contract.id, y);
      report.tenants.push({
        key: 'beautysystem',
        tenantName: tenant.name,
        contractId: contract.id,
        actions,
        afterMonths: after?.byMonth || null,
        afterDetail: after?.detail || null,
      });
    }
  }

  if (!dryRun) invalidateRentRegisterCache(pid);
  return report;
}

module.exports = { repairNoteDiscrepancies };
