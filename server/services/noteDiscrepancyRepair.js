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
      'r.room_number',
      'r.area as roomArea'
    )
    .orderBy('r.room_number');
}

async function cancelYearCharges(contractId, year, reason, dryRun, actions) {
  const live = await db('rent_charges')
    .where({ contract_id: contractId, period_year: year })
    .whereNot('status', 'cancelled')
    .select('id', 'period_month', 'amount_with_vat');
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
  for (const r of rows) {
    const m = Number(r.period_month);
    byMonth[m] = roundMoney((byMonth[m] || 0) + Number(r.amount_with_vat || 0));
  }
  return { rows, byMonth };
}

/**
 * Handwritten manager note (2026-10-17):
 * - Машевский: 536.64 (not 639.84) → 34.4 × 13 с НДС
 * - МериЛиз: 1 м² = 41.67 без НДС → 50 с НДС (not 25.20)
 * - Седлер: paper 70.1@9 + 51.9@5 (not map 66.62@9 + 33.21@5 = 918.76)
 * - БьютиСистем: exact paper 62.9@21
 */
async function repairNoteDiscrepancies({ propertyId = 1, year = 2026, dryRun = true } = {}) {
  const pid = Number(propertyId) || 1;
  const y = Number(year) || dayjs().year();
  const report = { dryRun, propertyId: pid, year: y, tenants: [] };

  // ——— Машевский: bill room ~34.4 @ 13 only (536.64); stop charging second room ———
  {
    const actions = [];
    const { tenant, contract } = await findLiveContract('Машевск', pid);
    if (!tenant || !contract) {
      report.tenants.push({ key: 'mashevsky', error: 'not_found' });
    } else {
      const links = await loadOpenLinks(contract.id);
      const byNum = Object.fromEntries(
        links.map((l) => [String(l.room_number || '').trim(), l])
      );
      const room4 = byNum['4'];
      const room5 = byNum['5'];
      if (room4) {
        const area = roundArea(Number(room4.area || room4.roomArea || 34.4) || 34.4);
        actions.push({
          type: 'set_link',
          room: '4',
          area,
          rate: 13,
          from: { area: Number(room4.area), rate: Number(room4.rate_without_vat) },
        });
        if (!dryRun) {
          await db('contract_rooms').where({ id: room4.linkId }).update({
            area,
            rate_without_vat: 13,
          });
          await db('rooms').where({ id: room4.room_id }).update({
            current_rate_without_vat: 13,
            updated_at: db.fn.now(),
          });
        }
      }
      if (room5) {
        // Keep link for map occupancy but do not bill (paper amount is 34.4×13).
        actions.push({
          type: 'zero_rate_second_room',
          room: '5',
          area: Number(room5.area),
          fromRate: Number(room5.rate_without_vat),
        });
        if (!dryRun) {
          await db('contract_rooms').where({ id: room5.linkId }).update({
            rate_without_vat: 0,
          });
        }
      }
      if (!dryRun) {
        await db('contracts').where({ id: contract.id }).update({
          rate_without_vat: 13,
          updated_at: db.fn.now(),
        });
      }
      const expected = calcRentAmount({
        area: 34.4,
        rateWithoutVat: 13,
        year: y,
        month: 10,
        startDate: '2000-01-01',
      });
      actions.push({ type: 'expected_monthly', amount: expected.amountWithVat });
      await cancelYearCharges(contract.id, y, 'note_mashevsky_536_64', dryRun, actions);
      await regenerate(contract, pid, y, dryRun, actions);
      const after = dryRun ? null : await monthTotals(contract.id, y);
      report.tenants.push({
        key: 'mashevsky',
        tenantName: tenant.name,
        contractId: contract.id,
        actions,
        afterMonths: after?.byMonth || null,
      });
    }
  }

  // ——— МериЛиз: 1 м² × 41.67 = 50 с НДС ———
  {
    const actions = [];
    const { tenant, contract } = await findLiveContract('Мери', pid);
    if (!tenant || !contract) {
      report.tenants.push({ key: 'meriliz', error: 'not_found' });
    } else {
      const links = await loadOpenLinks(contract.id);
      for (const link of links) {
        actions.push({
          type: 'set_link_rate',
          room: link.room_number,
          area: 1,
          rate: 41.67,
          from: { area: Number(link.area), rate: Number(link.rate_without_vat) },
        });
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
      if (!dryRun) {
        await db('contracts').where({ id: contract.id }).update({
          rate_without_vat: 41.67,
          updated_at: db.fn.now(),
        });
      }
      const expected = calcRentAmount({
        area: 1,
        rateWithoutVat: 41.67,
        year: y,
        month: 10,
        startDate: '2000-01-01',
      });
      actions.push({ type: 'expected_monthly', amount: expected.amountWithVat });
      await cancelYearCharges(contract.id, y, 'note_meriliz_50', dryRun, actions);
      await regenerate(contract, pid, y, dryRun, actions);
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

  // ——— Седлер: paper 70.1@9 + 51.9@5 ———
  {
    const actions = [];
    const { tenant, contract } = await findLiveContract('Седлер', pid);
    if (!tenant || !contract) {
      report.tenants.push({ key: 'sedler', error: 'not_found' });
    } else {
      const links = await loadOpenLinks(contract.id);
      for (const link of links) {
        const normalized = String(link.room_number || '')
          .trim()
          .toLowerCase()
          .replace(/а/g, 'a');
        let t = null;
        if (normalized === '5a') t = { area: 70.1, rate: 9 };
        else if (normalized === '5') t = { area: 51.9, rate: 5 };
        if (!t) continue;
        actions.push({
          type: 'set_paper_area_rate',
          room: link.room_number,
          from: { area: Number(link.area), rate: Number(link.rate_without_vat) },
          to: t,
        });
        if (!dryRun) {
          await db('contract_rooms').where({ id: link.linkId }).update({
            area: t.area,
            rate_without_vat: t.rate,
          });
          await db('rooms').where({ id: link.room_id }).update({
            area: t.area,
            rentable_area: t.area,
            current_rate_without_vat: t.rate,
            updated_at: db.fn.now(),
          });
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
        parts: [e1.amountWithVat, e2.amountWithVat],
      });
      await cancelYearCharges(contract.id, y, 'note_sedler_paper_areas', dryRun, actions);
      await regenerate(contract, pid, y, dryRun, actions);
      const after = dryRun ? null : await monthTotals(contract.id, y);
      report.tenants.push({
        key: 'sedler',
        tenantName: tenant.name,
        contractId: contract.id,
        actions,
        afterMonths: after?.byMonth || null,
      });
    }
  }

  // ——— БьютиСистем: scale open links to exactly 62.9 @ 21 ———
  {
    const actions = [];
    const { tenant, contract } = await findLiveContract('БьютиСистем', pid);
    if (!tenant || !contract) {
      report.tenants.push({ key: 'beautysystem', error: 'not_found' });
    } else {
      const links = await loadOpenLinks(contract.id);
      const currentTotal = roundArea(links.reduce((s, l) => s + Number(l.area || 0), 0));
      const paperTotal = 62.9;
      const scale = paperTotal / (currentTotal || 1);
      let assigned = 0;
      for (let i = 0; i < links.length; i += 1) {
        const link = links[i];
        const nextArea =
          i === links.length - 1
            ? roundArea(paperTotal - assigned)
            : roundArea(Number(link.area || 0) * scale);
        assigned = roundArea(assigned + nextArea);
        actions.push({
          type: 'scale_link',
          room: link.room_number,
          from: Number(link.area),
          to: nextArea,
          rate: 21,
        });
        if (!dryRun) {
          await db('contract_rooms').where({ id: link.linkId }).update({
            area: nextArea,
            rate_without_vat: 21,
          });
          await db('rooms').where({ id: link.room_id }).update({
            area: nextArea,
            rentable_area: nextArea,
            current_rate_without_vat: 21,
            updated_at: db.fn.now(),
          });
        }
      }
      if (!dryRun) {
        await db('contracts').where({ id: contract.id }).update({
          rate_without_vat: 21,
          updated_at: db.fn.now(),
        });
      }
      const expected = calcRentAmount({
        area: 62.9,
        rateWithoutVat: 21,
        year: y,
        month: 10,
        startDate: '2000-01-01',
      });
      actions.push({ type: 'expected_monthly', amount: expected.amountWithVat });
      await cancelYearCharges(contract.id, y, 'note_beautysystem_62_9', dryRun, actions);
      await regenerate(contract, pid, y, dryRun, actions);
      const after = dryRun ? null : await monthTotals(contract.id, y);
      report.tenants.push({
        key: 'beautysystem',
        tenantName: tenant.name,
        contractId: contract.id,
        actions,
        afterMonths: after?.byMonth || null,
      });
    }
  }

  if (!dryRun) invalidateRentRegisterCache(pid);
  return report;
}

module.exports = { repairNoteDiscrepancies };
