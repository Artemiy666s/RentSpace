const dayjs = require('dayjs');
const { db } = require('../db');
const { ensureDueRentCharges } = require('./chargeService');
const { invalidateRentRegisterCache } = require('./managerDataService');

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function roundArea(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Paper-register area fixes (payments already match paper totals):
 * - Жалелова: 78.1 → 88.1 @18 → 1902.96/мес
 * - Кадовба: 9.0 → 8.8 @21 → 221.76/мес
 * - БьютиСистем: map 81.22 → paper 62.9 @21 (scale room areas) → ~1585/мес
 */
async function fixTenantArea({
  pid,
  y,
  dryRun,
  key,
  tenantLike,
  paperTotalArea,
  rate,
  scaleRoomsToTotal = false,
}) {
  const actions = [];
  const tenant = await db('tenants').where('name', 'like', `%${tenantLike}%`).whereNull('deleted_at').first();
  if (!tenant) return { key, error: 'tenant_not_found' };

  const contract = await db('contracts')
    .where({ tenant_id: tenant.id, property_id: pid })
    .whereNull('deleted_at')
    .whereIn('status', ['active', 'expiring'])
    .orderBy('id', 'asc')
    .first();
  if (!contract) {
    return { key, tenantId: tenant.id, tenantName: tenant.name, error: 'live_contract_not_found' };
  }

  const links = await db('contract_rooms as cr')
    .join('rooms as r', 'r.id', 'cr.room_id')
    .where('cr.contract_id', contract.id)
    .where(function () {
      this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', dayjs().format('YYYY-MM-DD'));
    })
    .select(
      'cr.id as linkId',
      'cr.room_id',
      'cr.area',
      'cr.rate_without_vat',
      'r.room_number',
      'r.area as roomArea',
      'r.rentable_area'
    )
    .orderBy('cr.id');

  if (!links.length) {
    return {
      key,
      tenantId: tenant.id,
      tenantName: tenant.name,
      contractId: contract.id,
      error: 'no_open_links',
    };
  }

  const currentTotal = roundArea(links.reduce((s, l) => s + Number(l.area || 0), 0));
  actions.push({
    type: 'area_snapshot',
    currentTotal,
    paperTotalArea,
    rooms: links.map((l) => ({
      roomNumber: l.room_number,
      area: Number(l.area),
      rate: Number(l.rate_without_vat),
    })),
  });

  if (scaleRoomsToTotal && links.length > 1) {
    const scale = paperTotalArea / (currentTotal || 1);
    for (const link of links) {
      const nextArea = roundArea(Number(link.area || 0) * scale);
      if (Math.abs(nextArea - Number(link.area || 0)) > 0.05) {
        actions.push({
          type: 'scale_link_area',
          roomNumber: link.room_number,
          linkId: link.linkId,
          from: Number(link.area),
          to: nextArea,
        });
        if (!dryRun) {
          await db('contract_rooms').where({ id: link.linkId }).update({
            area: nextArea,
            rate_without_vat: rate,
          });
          await db('rooms').where({ id: link.room_id }).update({
            area: nextArea,
            rentable_area: nextArea,
            current_rate_without_vat: rate,
            updated_at: db.fn.now(),
          });
        }
      }
    }
  } else {
    const link = links[0];
    if (Math.abs(Number(link.area || 0) - paperTotalArea) > 0.05) {
      actions.push({
        type: 'set_link_area',
        roomNumber: link.room_number,
        linkId: link.linkId,
        from: Number(link.area),
        to: paperTotalArea,
      });
      if (!dryRun) {
        await db('contract_rooms').where({ id: link.linkId }).update({
          area: paperTotalArea,
          rate_without_vat: rate,
        });
        await db('rooms').where({ id: link.room_id }).update({
          area: paperTotalArea,
          rentable_area: paperTotalArea,
          current_rate_without_vat: rate,
          updated_at: db.fn.now(),
        });
      }
    }
  }

  const liveCharges = await db('rent_charges')
    .where({ contract_id: contract.id, period_year: y })
    .whereNot('status', 'cancelled')
    .select('id', 'period_month', 'amount_with_vat', 'area');

  actions.push({
    type: 'cancel_old_charges',
    count: liveCharges.length,
    sum: roundMoney(liveCharges.reduce((s, r) => s + Number(r.amount_with_vat || 0), 0)),
  });

  if (!dryRun && liveCharges.length) {
    await db('rent_charges')
      .whereIn(
        'id',
        liveCharges.map((r) => r.id)
      )
      .update({
        status: 'cancelled',
        manual_adjustment: true,
        adjustment_reason: `paper_area_fix_${key}`,
        updated_at: db.fn.now(),
      });
  }

  const expect = roundMoney(paperTotalArea * rate * 1.2);
  actions.push({ type: 'expected_monthly_with_vat', amount: expect });

  let created = [];
  if (!dryRun) {
    created = await ensureDueRentCharges({
      organizationId: contract.organization_id,
      propertyId: pid,
      fromDate: `${y}-01-01`,
      contractId: contract.id,
      onlyLastDue: false,
      userId: null,
    });
    actions.push({ type: 'regenerated', count: created.length });
    invalidateRentRegisterCache(pid);
  }

  const after = dryRun
    ? null
    : await db('rent_charges')
        .where({ contract_id: contract.id, period_year: y })
        .whereNot('status', 'cancelled')
        .select('period_month', 'area', 'rate_without_vat', 'amount_with_vat')
        .orderBy('period_month');

  return {
    key,
    tenantId: tenant.id,
    tenantName: tenant.name,
    contractId: contract.id,
    actions,
    after,
  };
}

async function repairPaperAreaFixes({ propertyId = 1, year = 2026, dryRun = true } = {}) {
  const pid = Number(propertyId) || 1;
  const y = Number(year) || dayjs().year();

  const tenants = [
    await fixTenantArea({
      pid,
      y,
      dryRun,
      key: 'zhalelova',
      tenantLike: 'Жалелова',
      paperTotalArea: 88.1,
      rate: 18,
    }),
    await fixTenantArea({
      pid,
      y,
      dryRun,
      key: 'kadovba',
      tenantLike: 'Кадовба',
      paperTotalArea: 8.8,
      rate: 21,
    }),
    await fixTenantArea({
      pid,
      y,
      dryRun,
      key: 'beautysystem',
      tenantLike: 'БьютиСистем',
      paperTotalArea: 62.9,
      rate: 21,
      scaleRoomsToTotal: true,
    }),
  ];

  return { propertyId: pid, year: y, dryRun, tenants };
}

module.exports = { repairPaperAreaFixes };
