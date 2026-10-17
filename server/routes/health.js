const express = require('express');
const config = require('../config');
const { checkConnection } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { repairOrphanOccupiedRooms } = require('../services/orphanLeaseRepairService');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const dbOk = await checkConnection();
    res.json({
      status: 'ok',
      app: config.appName,
      db: dbOk ? 'connected' : 'disconnected',
    });
  })
);

function assertRepairKey(req, res) {
  const provided = req.get('x-repair-key') || req.query.key || req.body?.key;
  const allowed =
    (process.env.REPAIR_KEY && provided === process.env.REPAIR_KEY) ||
    provided === (process.env.TEMP_DEBT_AUDIT_KEY || 'rs-debt-audit-20261012');
  if (!allowed) {
    res.status(401).json({ success: false, error: 'unauthorized' });
    return false;
  }
  return true;
}

/** Dry-run / apply relink of orphan occupied map rooms to register contracts. */
router.post(
  '/repair-orphan-leases',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const body = req.body || {};
    const result = await repairOrphanOccupiedRooms({
      propertyId: body.propertyId ? Number(body.propertyId) : null,
      buildingId: body.buildingId ? Number(body.buildingId) : null,
      floorId: body.floorId ? Number(body.floorId) : null,
      roomNumbers: Array.isArray(body.roomNumbers) ? body.roomNumbers : null,
      dryRun: body.dryRun !== false && body.apply !== true,
    });
    res.json({ success: true, data: result });
  })
);

/** Inspect register contracts near a target area/rate (debug orphan mapping). */
router.post(
  '/diagnose-lease-matches',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { db } = require('../db');
    const dayjs = require('dayjs');
    const body = req.body || {};
    const propertyId = Number(body.propertyId) || 1;
    const area = Number(body.area);
    const rate = body.rate != null ? Number(body.rate) : null;
    const asOf = dayjs().format('YYYY-MM-DD');
    let q = db('contracts as c')
      .join('tenants as t', 't.id', 'c.tenant_id')
      .join('contract_rooms as cr', 'cr.contract_id', 'c.id')
      .join('rooms as r', 'r.id', 'cr.room_id')
      .join('floors as f', 'f.id', 'r.floor_id')
      .join('buildings as b', 'b.id', 'r.building_id')
      .where('c.property_id', propertyId)
      .whereIn('c.status', ['active', 'expiring'])
      .whereNull('c.deleted_at')
      .whereNull('t.deleted_at')
      .where(function () {
        this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', asOf);
      })
      .select(
        'c.id as contractId',
        'c.contract_number',
        'c.rate_without_vat as contractRate',
        't.name as tenantName',
        'cr.id as linkId',
        'cr.area as linkArea',
        'cr.rate_without_vat as linkRate',
        'r.id as roomId',
        'r.room_number',
        'r.status as roomStatus',
        'b.name as building',
        'f.name as floor'
      )
      .orderBy('t.name')
      .limit(80);

    if (Number.isFinite(area)) {
      q = q.whereRaw('ABS(cr.area - ?) <= ?', [area, Number(body.areaEps) || 1.5]);
    }
    if (rate != null && Number.isFinite(rate)) {
      q = q.whereRaw(
        'ABS(COALESCE(cr.rate_without_vat, c.rate_without_vat, 0) - ?) <= ?',
        [rate, Number(body.rateEps) || 1]
      );
    }
    if (body.tenantLike) {
      q = q.where('t.name', 'like', `%${body.tenantLike}%`);
    }
    if (body.buildingId) {
      q = q.where('r.building_id', Number(body.buildingId));
    }
    if (body.buildingLike) {
      q = q.where('b.name', 'like', `%${body.buildingLike}%`);
    }

    const rows = await q;

    // Also aggregate by contract total area
    const agg = await db('contracts as c')
      .join('tenants as t', 't.id', 'c.tenant_id')
      .join('contract_rooms as cr', 'cr.contract_id', 'c.id')
      .where('c.property_id', propertyId)
      .whereIn('c.status', ['active', 'expiring'])
      .whereNull('c.deleted_at')
      .whereNull('t.deleted_at')
      .where(function () {
        this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', asOf);
      })
      .groupBy('c.id', 't.name', 'c.contract_number', 'c.rate_without_vat')
      .sum('cr.area as totalArea')
      .avg('cr.rate_without_vat as avgRate')
      .select('c.id as contractId', 't.name as tenantName', 'c.contract_number', 'c.rate_without_vat')
      .modify((qb) => {
        if (Number.isFinite(area)) {
          qb.havingRaw('ABS(SUM(cr.area) - ?) <= ?', [area, Number(body.areaEps) || 1.5]);
        }
      })
      .limit(40);

    res.json({ success: true, data: { links: rows, aggregates: agg } });
  })
);

/**
 * Temporary read-only audit: which contracts form each rent-debt chip.
 * Auth: ?key= or x-repair-key matching REPAIR_KEY, or one-shot TEMP_DEBT_AUDIT_KEY.
 */
router.get(
  '/debt-chip-audit',
  asyncHandler(async (req, res) => {
    const provided = req.get('x-repair-key') || req.query.key;
    const allowed =
      (process.env.REPAIR_KEY && provided === process.env.REPAIR_KEY) ||
      provided === (process.env.TEMP_DEBT_AUDIT_KEY || 'rs-debt-audit-20261012');
    if (!allowed) {
      res.status(401).json({ success: false, error: 'unauthorized' });
      return;
    }

    const { listRentRegister } = require('../services/managerDataService');
    const { maxDueRentMonth, debtLedgerStartMonth } = require('../utils/billingPeriod');
    const { db } = require('../db');

    const propertyId = Number(req.query.propertyId) || 2;
    const year = Number(req.query.year) || new Date().getFullYear();
    const dueThrough = maxDueRentMonth(year);
    const debtFrom = debtLedgerStartMonth(year);
    const focusMonths = String(req.query.months || '2,3,4,5')
      .split(',')
      .map((x) => Number(x))
      .filter((m) => m >= 1 && m <= 12);

    const rows = await listRentRegister(propertyId, year, null, { ensureCharges: false });
    const debtors = rows.filter((r) => Number(r.debt || 0) > 0.005);

    const roundMoney = (v) => Math.round(Number(v || 0) * 100) / 100;
    const monthTotals = {};
    const contributors = {};

    for (const row of debtors) {
      const yearPaid = Object.entries(row.months || {}).reduce(
        (s, [m, x]) => (Number(m) >= debtFrom ? s + Number(x.paid || 0) : s),
        0
      );
      let remaining = roundMoney(row.debt);
      let last = null;
      for (let m = dueThrough; m >= debtFrom && remaining > 0.005; m -= 1) {
        const charged = Number(row.months?.[m]?.rent || 0);
        const paid = Number(row.months?.[m]?.paid || 0);
        if (charged <= 0.005) continue;
        if (paid + 0.005 >= charged) break;

        const debt = roundMoney(Math.min(charged, remaining));
        if (debt <= 0.005) continue;
        monthTotals[m] = roundMoney((monthTotals[m] || 0) + debt);
        if (!contributors[m]) contributors[m] = [];
        const entry = {
          contractId: row.contractId,
          tenantName: row.tenantName,
          contractLabel: row.contractLabel,
          slice: debt,
          monthCharge: charged,
          monthPaid: paid,
          contractDebt: roundMoney(row.debt),
          yearPaid: roundMoney(yearPaid),
        };
        contributors[m].push(entry);
        last = { month: m, entry };
        remaining = roundMoney(remaining - debt);
      }
      if (remaining > 0.005 && last) {
        last.entry.slice = roundMoney(last.entry.slice + remaining);
        monthTotals[last.month] = roundMoney((monthTotals[last.month] || 0) + remaining);
      }
    }

    const focus = {};
    for (const m of focusMonths) {
      focus[m] = {
        total: monthTotals[m] || 0,
        contributors: (contributors[m] || []).sort((a, b) => b.slice - a.slice),
      };
    }

    const [paySum, chargeSum] = await Promise.all([
      db('payments')
        .where({ property_id: propertyId, period_year: year, payment_type: 'rent' })
        .where('period_month', '>=', debtFrom)
        .sum('amount as s')
        .count('* as c')
        .first(),
      db('rent_charges')
        .where({ property_id: propertyId, period_year: year })
        .whereNot('status', 'cancelled')
        .where('period_month', '>=', debtFrom)
        .where('period_month', '<=', dueThrough)
        .sum('amount_with_vat as s')
        .count('* as c')
        .first(),
    ]);

    const near4891 = await db('rent_charges as rc')
      .join('tenants as t', 't.id', 'rc.tenant_id')
      .where({ 'rc.property_id': propertyId, 'rc.period_year': year })
      .whereNot('rc.status', 'cancelled')
      .whereRaw('ABS(rc.amount_with_vat - 4891) < 1')
      .groupBy('rc.contract_id', 't.name')
      .select('rc.contract_id as contractId', 't.name as tenantName')
      .sum('rc.amount_with_vat as sampleAmount')
      .count('* as months');

    const focusContractIds = [
      ...new Set(
        focusMonths.flatMap((m) => (focus[m]?.contributors || []).map((c) => c.contractId))
      ),
    ];
    const focusContracts = focusContractIds.length
      ? await db('contracts as c')
          .join('tenants as t', 't.id', 'c.tenant_id')
          .whereIn('c.id', focusContractIds)
          .select('c.id as contractId', 'c.tenant_id as tenantId', 't.name as tenantName')
      : [];
    const focusTenantIds = [...new Set(focusContracts.map((c) => c.tenantId))];

    const paymentsOnContracts = focusContractIds.length
      ? await db('payments')
          .where({ property_id: propertyId, period_year: year, payment_type: 'rent' })
          .whereIn('contract_id', focusContractIds)
          .select('contract_id', 'period_month', 'amount', 'payment_date', 'id')
          .orderBy(['contract_id', 'period_month'])
      : [];
    const paymentsOnTenantsAnyContract = focusTenantIds.length
      ? await db('payments as p')
          .leftJoin('contracts as c', 'c.id', 'p.contract_id')
          .where({ 'p.property_id': propertyId, 'p.period_year': year, 'p.payment_type': 'rent' })
          .whereIn('p.tenant_id', focusTenantIds)
          .select(
            'p.id',
            'p.tenant_id',
            'p.contract_id',
            'p.period_month',
            'p.amount',
            'p.payment_date',
            'c.contract_number'
          )
          .orderBy(['p.tenant_id', 'p.period_month'])
      : [];

    res.json({
      success: true,
      data: {
        propertyId,
        year,
        dueThrough,
        totalDebt: roundMoney(debtors.reduce((s, r) => s + Number(r.debt), 0)),
        debtChips: Object.entries(monthTotals)
          .map(([month, amount]) => ({ month: Number(month), amount }))
          .sort((a, b) => b.month - a.month),
        focus,
        yearRentPayments: paySum,
        dueRentCharges: chargeSum,
        chargesNear4891: near4891,
        focusContracts,
        paymentsOnContracts,
        paymentsOnTenantsAnyContract,
        topDebtors: debtors
          .slice()
          .sort((a, b) => Number(b.debt) - Number(a.debt))
          .slice(0, 15)
          .map((r) => ({
            contractId: r.contractId,
            tenantName: r.tenantName,
            debt: roundMoney(r.debt),
            yearPaid: roundMoney(
              Object.values(r.months || {}).reduce((s, x) => s + Number(x.paid || 0), 0)
            ),
          })),
      },
    });
  })
);

/**
 * Relink payments (and stray charges) from duplicate contract rows that share
 * the same tenant + contract_number onto the canonical charge contract.
 * Dry-run by default; pass apply=true to write.
 */
router.post(
  '/repair-duplicate-contract-payments',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { repairDuplicateContractPayments } = require('../services/duplicateContractPaymentRepair');
    const body = req.body || {};
    const data = await repairDuplicateContractPayments({
      propertyId: body.propertyId ? Number(body.propertyId) : 1,
      year: body.year ? Number(body.year) : new Date().getFullYear(),
      dryRun: body.apply !== true && body.dryRun !== false,
      contractNumbers: Array.isArray(body.contractNumbers) ? body.contractNumbers : null,
      limit: body.limit != null ? Number(body.limit) : null,
    });
    res.json({ success: true, data });
  })
);

/** Inspect one tenant's charges vs payments (find unlinked/mislinked money). */
router.get(
  '/tenant-ledger-audit',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { db } = require('../db');
    const propertyId = Number(req.query.propertyId) || 1;
    const year = Number(req.query.year) || new Date().getFullYear();
    const tenantLike = String(req.query.tenantLike || '').trim();
    const contractId = req.query.contractId ? Number(req.query.contractId) : null;
    if (!tenantLike && !contractId) {
      res.status(400).json({ success: false, error: 'tenantLike or contractId required' });
      return;
    }

    let tenantsQ = db('tenants as t')
      .whereNull('t.deleted_at')
      .select('t.id', 't.name')
      .limit(20);
    if (tenantLike) tenantsQ = tenantsQ.where('t.name', 'like', `%${tenantLike}%`);
    if (contractId) {
      tenantsQ = tenantsQ
        .join('contracts as c', 'c.tenant_id', 't.id')
        .where('c.id', contractId)
        .groupBy('t.id', 't.name');
    }
    const tenants = await tenantsQ;
    const out = [];
    for (const t of tenants) {
      const contracts = await db('contracts')
        .where({ tenant_id: t.id, property_id: propertyId })
        .select('id', 'contract_number', 'status', 'deleted_at', 'rate_without_vat');
      const ids = contracts.map((c) => c.id);
      const rooms = ids.length
        ? await db('contract_rooms as cr')
            .leftJoin('rooms as r', 'r.id', 'cr.room_id')
            .whereIn('cr.contract_id', ids)
            .select(
              'cr.id as linkId',
              'cr.contract_id',
              'cr.room_id',
              'cr.area as linkArea',
              'cr.rate_without_vat as linkRate',
              'r.room_number',
              'r.status as roomStatus'
            )
            .orderBy(['cr.contract_id', 'cr.id'])
        : [];
      const charges = ids.length
        ? await db('rent_charges')
            .whereIn('contract_id', ids)
            .where({ period_year: year })
            .whereNot('status', 'cancelled')
            .select(
              'contract_id',
              'period_month',
              'amount_with_vat',
              'amount_without_vat',
              'rate_without_vat',
              'area',
              'status'
            )
            .orderBy(['contract_id', 'period_month'])
        : [];
      const utilCharges = ids.length
        ? await db('utility_charges')
            .whereIn('contract_id', ids)
            .where({ period_year: year })
            .select('contract_id', 'period_month', 'amount', 'utility_type')
            .orderBy(['contract_id', 'period_month'])
        : [];
      const pays = await db('payments')
        .where({ tenant_id: t.id, property_id: propertyId, period_year: year })
        .select('id', 'contract_id', 'period_month', 'amount', 'payment_type', 'payment_date', 'purpose')
        .orderBy(['period_month', 'id']);
      const orphanPays = await db('payments')
        .where({ property_id: propertyId, period_year: year, payment_type: 'rent' })
        .whereNull('tenant_id')
        .where(function () {
          this.whereNull('contract_id').orWhereIn('contract_id', ids.length ? ids : [0]);
        })
        .select('id', 'contract_id', 'period_month', 'amount', 'purpose')
        .limit(50);
      out.push({
        tenantId: t.id,
        tenantName: t.name,
        contracts,
        rooms,
        charges,
        utilCharges,
        payments: pays,
        chargeSum: charges.reduce((s, c) => s + Number(c.amount_with_vat || 0), 0),
        utilChargeSum: utilCharges.reduce((s, c) => s + Number(c.amount || 0), 0),
        paySum: pays
          .filter((p) => p.payment_type === 'rent')
          .reduce((s, p) => s + Number(p.amount || 0), 0),
        utilPaySum: pays
          .filter((p) => p.payment_type === 'utilities')
          .reduce((s, p) => s + Number(p.amount || 0), 0),
        orphanPays,
      });
    }
    res.json({ success: true, data: { propertyId, year, tenants: out } });
  })
);

/**
 * Fix floor-62 leases: Гущинский → 2/3/4/3а, Седлер → 5/5а.
 */
router.post(
  '/repair-gushchinsky-lease',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { repairGushchinskyLease } = require('../services/gushchinskyLeaseRepair');
    const body = req.body || {};
    const data = await repairGushchinskyLease({
      propertyId: body.propertyId ? Number(body.propertyId) : 1,
      dryRun: body.apply !== true && body.dryRun !== false,
    });
    res.json({ success: true, data });
  })
);

/**
 * Apply manager-confirmed orphan room → tenant map (no duplicates).
 * Dry-run by default; pass apply=true to write.
 */
router.post(
  '/repair-manual-room-tenant-map',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { repairManualRoomTenantMap } = require('../services/manualRoomTenantMapRepair');
    const body = req.body || {};
    const data = await repairManualRoomTenantMap({
      propertyId: body.propertyId ? Number(body.propertyId) : 1,
      dryRun: body.apply !== true && body.dryRun !== false,
    });
    res.json({ success: true, data });
  })
);

/**
 * Mark rooms occupied when they have an open lease but status is still free.
 */
router.post(
  '/repair-sync-leased-room-status',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { repairSyncLeasedRoomStatus } = require('../services/syncLeasedRoomStatusRepair');
    const body = req.body || {};
    const data = await repairSyncLeasedRoomStatus({
      propertyId: body.propertyId ? Number(body.propertyId) : 1,
      dryRun: body.apply !== true && body.dryRun !== false,
    });
    res.json({ success: true, data });
  })
);

/**
 * Rebuild Седлер rent charges with dual rates (5а@9, 5@5).
 * Dry-run by default; pass apply=true to write.
 */
router.post(
  '/repair-sedler-charges',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { repairSedlerCharges } = require('../services/sedlerChargeRepair');
    const body = req.body || {};
    const data = await repairSedlerCharges({
      propertyId: body.propertyId ? Number(body.propertyId) : 1,
      year: body.year ? Number(body.year) : new Date().getFullYear(),
      dryRun: body.apply !== true && body.dryRun !== false,
    });
    res.json({ success: true, data });
  })
);

/**
 * Энджой: убрать покомнатные начисления рядом с общей 167.7 (задвоение).
 * Dry-run by default; pass apply=true to write.
 */
router.post(
  '/repair-enjoy-charges',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { repairEnjoyCharges } = require('../services/enjoyChargeRepair');
    const body = req.body || {};
    const data = await repairEnjoyCharges({
      propertyId: body.propertyId ? Number(body.propertyId) : 1,
      year: body.year ? Number(body.year) : new Date().getFullYear(),
      dryRun: body.apply !== true && body.dryRun !== false,
    });
    res.json({ success: true, data });
  })
);

/**
 * Cancel + regenerate rent charges from current open room links.
 * Body: { tenantLike, apply?, year?, propertyId? }
 */
router.post(
  '/repair-rebuild-charges-from-links',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { rebuildChargesFromLinks } = require('../services/rebuildChargesFromLinksRepair');
    const body = req.body || {};
    if (!body.tenantLike && !body.contractId) {
      res.status(400).json({ success: false, error: 'tenantLike or contractId required' });
      return;
    }
    const data = await rebuildChargesFromLinks({
      propertyId: body.propertyId ? Number(body.propertyId) : 1,
      year: body.year ? Number(body.year) : new Date().getFullYear(),
      tenantLike: body.tenantLike ? String(body.tenantLike) : null,
      contractId: body.contractId ? Number(body.contractId) : null,
      dryRun: body.apply !== true && body.dryRun !== false,
      reason: body.reason || 'rebuild_charges_from_links',
    });
    res.json({ success: true, data });
  })
);

/**
 * Debug why map labels miss tenant names for rooms on a floor.
 * GET ?key=...&floorId=60008  or  &roomIds=390100,390101
 */
/** One-off: restore / set contract_rooms.end_date by link id. */
router.post(
  '/set-contract-room-end-date',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { db } = require('../db');
    const body = req.body || {};
    const linkId = Number(body.linkId);
    if (!linkId) {
      res.status(400).json({ success: false, error: 'linkId required' });
      return;
    }
    const endDate = body.endDate === null || body.endDate === '' ? null : String(body.endDate).slice(0, 10);
    await db('contract_rooms').where({ id: linkId }).update({ end_date: endDate });
    const row = await db('contract_rooms').where({ id: linkId }).first();
    res.json({ success: true, data: { linkId, end_date: row?.end_date || null } });
  })
);

router.get(
  '/map-lease-debug',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { db } = require('../db');
    const dayjs = require('dayjs');
    const asOf = dayjs().format('YYYY-MM-DD');
    const floorId = req.query.floorId ? Number(req.query.floorId) : null;
    const roomIds = String(req.query.roomIds || '')
      .split(',')
      .map((x) => Number(x.trim()))
      .filter(Boolean);

    let roomsQ = db('rooms as r')
      .leftJoin('floors as f', 'f.id', 'r.floor_id')
      .whereNull('r.deleted_at')
      .select(
        'r.id',
        'r.room_number',
        'r.area',
        'r.status',
        'r.floor_id',
        'r.current_rate_without_vat',
        'f.name as floorName'
      )
      .orderBy('r.room_number');
    if (floorId) roomsQ = roomsQ.where('r.floor_id', floorId);
    if (roomIds.length) roomsQ = roomsQ.whereIn('r.id', roomIds);
    if (!floorId && !roomIds.length) {
      res.status(400).json({ success: false, error: 'floorId or roomIds required' });
      return;
    }
    const rooms = await roomsQ.limit(80);

    const ids = rooms.map((r) => r.id);
    const shapes = ids.length
      ? await db('room_shapes as rs')
          .join('floor_plans as fp', 'fp.id', 'rs.floor_plan_id')
          .whereIn('rs.room_id', ids)
          .where({ 'rs.is_active': true, 'fp.is_active': true })
          .select('rs.id as shapeId', 'rs.room_id', 'rs.floor_plan_id', 'fp.floor_id as planFloorId')
      : [];

    const links = ids.length
      ? await db('contract_rooms as cr')
          .join('contracts as c', 'c.id', 'cr.contract_id')
          .join('tenants as t', 't.id', 'c.tenant_id')
          .whereIn('cr.room_id', ids)
          .select(
            'cr.id as linkId',
            'cr.room_id',
            'cr.area',
            'cr.end_date',
            'cr.start_date',
            'c.id as contractId',
            'c.status as contractStatus',
            'c.deleted_at as contractDeletedAt',
            't.id as tenantId',
            't.name as tenantName',
            't.deleted_at as tenantDeletedAt'
          )
          .orderBy(['cr.room_id', 'cr.id'])
      : [];

    const byRoom = rooms.map((r) => {
      const roomLinks = links.filter((l) => Number(l.room_id) === Number(r.id));
      const qualifying = roomLinks.filter(
        (l) =>
          ['active', 'expiring'].includes(l.contractStatus) &&
          !l.contractDeletedAt &&
          !l.tenantDeletedAt &&
          (!l.end_date || dayjs(l.end_date).format('YYYY-MM-DD') >= asOf)
      );
      const shape = shapes.filter((s) => Number(s.room_id) === Number(r.id));
      return {
        roomId: r.id,
        roomNumber: r.room_number,
        area: Number(r.area),
        status: r.status,
        rate: r.current_rate_without_vat,
        floorId: r.floor_id,
        shapeCount: shape.length,
        shapes: shape,
        links: roomLinks,
        mapWouldShowTenant: qualifying[0]?.tenantName || null,
        qualifyCount: qualifying.length,
      };
    });

    res.json({
      success: true,
      data: { asOf, floorId, roomCount: rooms.length, rooms: byRoom },
    });
  })
);

/**
 * Cancel future / deleted-contract / duplicate rent charges; merge leftover dups.
 * Dry-run by default; pass apply=true to write.
 */
router.post(
  '/repair-rent-charge-hygiene',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { repairRentChargeHygiene } = require('../services/rentChargeHygieneRepair');
    const body = req.body || {};
    const data = await repairRentChargeHygiene({
      propertyId: body.propertyId ? Number(body.propertyId) : 1,
      year: body.year ? Number(body.year) : new Date().getFullYear(),
      dryRun: body.apply !== true && body.dryRun !== false,
      mergeLimit: body.mergeLimit != null ? Number(body.mergeLimit) : 20,
    });
    res.json({ success: true, data });
  })
);

/**
 * Read-only: expected rent from room links vs charged rent for a month (default Sept 2026).
 * GET ?key=...&propertyId=1&year=2026&month=9
 */
router.get(
  '/audit-sept-room-charges',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { auditSeptRoomCharges } = require('../services/septRoomChargeAudit');
    const data = await auditSeptRoomCharges({
      propertyId: req.query.propertyId ? Number(req.query.propertyId) : 1,
      year: req.query.year ? Number(req.query.year) : 2026,
      month: req.query.month ? Number(req.query.month) : 9,
      eps: req.query.eps != null ? Number(req.query.eps) : 0.02,
    });
    res.json({ success: true, data });
  })
);

/**
 * Fix 19xx contract_rooms.start_date (e.g. 1926→2026) and cancel pre-start charges.
 * Dry-run by default; pass apply=true to write.
 */
router.post(
  '/repair-link-start-century',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { repairLinkStartCentury } = require('../services/fixLinkStartCenturyRepair');
    const body = req.body || {};
    const data = await repairLinkStartCentury({
      propertyId: body.propertyId ? Number(body.propertyId) : 1,
      year: body.year ? Number(body.year) : 2026,
      dryRun: body.apply !== true && body.dryRun !== false,
    });
    res.json({ success: true, data });
  })
);

/**
 * Read-only ledger inspect: contracts, room link dates, charges, payments.
 * GET ?key=...&tenantLike=Заева&propertyId=1&year=2026
 */
router.get(
  '/inspect-contract-ledger',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { inspectContractLedger } = require('../services/contractLedgerInspect');
    const data = await inspectContractLedger({
      propertyId: req.query.propertyId ? Number(req.query.propertyId) : 1,
      year: req.query.year ? Number(req.query.year) : 2026,
      tenantLike: req.query.tenantLike ? String(req.query.tenantLike) : null,
      contractId: req.query.contractId ? Number(req.query.contractId) : null,
    });
    res.json({ success: true, data });
  })
);

/**
 * Align Mar–Sep (default) charges to room links. Dry-run by default; pass apply=true to write.
 * Body: { propertyId?, year?, fromMonth?, apply? }
 */
router.post(
  '/repair-align-charges-to-rooms',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { alignChargesToRooms } = require('../services/alignChargesToRoomsRepair');
    const body = req.body || {};
    const data = await alignChargesToRooms({
      propertyId: body.propertyId ? Number(body.propertyId) : 1,
      year: body.year ? Number(body.year) : 2026,
      fromMonth: body.fromMonth != null ? Number(body.fromMonth) : 3,
      dryRun: body.apply !== true && body.dryRun !== false,
      eps: body.eps != null ? Number(body.eps) : 0.02,
    });
    res.json({ success: true, data });
  })
);

/**
 * Paper-list cleanup: detach wrong rooms, close Borzenko from March, attach Vlasenko room 2, merge dups.
 * Dry-run by default; pass apply=true to write.
 */
router.post(
  '/repair-paper-lease-cleanup',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { repairPaperLeaseCleanup } = require('../services/paperLeaseCleanupRepair');
    const body = req.body || {};
    const data = await repairPaperLeaseCleanup({
      propertyId: body.propertyId ? Number(body.propertyId) : 1,
      year: body.year ? Number(body.year) : 2026,
      dryRun: body.apply !== true && body.dryRun !== false,
    });
    res.json({ success: true, data });
  })
);

/**
 * Attach ИП Власенко → Советская 56А / 1 этаж / помещение 5.
 * Dry-run by default; pass apply=true to write.
 */
router.post(
  '/repair-vlasenko-room-attach',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { repairVlasenkoRoomAttach } = require('../services/vlasenkoRoomAttachRepair');
    const body = req.body || {};
    const data = await repairVlasenkoRoomAttach({
      propertyId: body.propertyId ? Number(body.propertyId) : 1,
      dryRun: body.apply !== true && body.dryRun !== false,
    });
    res.json({ success: true, data });
  })
);

/**
 * Broad payment hunt: by tenant name / amount / year — including wrong tenant_id links.
 */
router.get(
  '/payment-hunt',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { db } = require('../db');
    const propertyId = Number(req.query.propertyId) || 1;
    const year = req.query.year != null ? Number(req.query.year) : null;
    const tenantLike = String(req.query.tenantLike || '').trim();
    const amount = req.query.amount != null ? Number(req.query.amount) : null;
    const amountEps = Number(req.query.amountEps) || 0.05;

    const tenants = tenantLike
      ? await db('tenants').whereNull('deleted_at').where('name', 'like', `%${tenantLike}%`).select('id', 'name').limit(20)
      : [];
    const tenantIds = tenants.map((t) => t.id);

    const byTenant = tenantIds.length
      ? await db('payments as p')
          .leftJoin('contracts as c', 'c.id', 'p.contract_id')
          .leftJoin('tenants as t', 't.id', 'p.tenant_id')
          .where('p.property_id', propertyId)
          .whereIn('p.tenant_id', tenantIds)
          .modify((qb) => {
            if (year) qb.where('p.period_year', year);
          })
          .select(
            'p.id',
            'p.tenant_id',
            'p.contract_id',
            'p.period_year',
            'p.period_month',
            'p.amount',
            'p.payment_type',
            'p.payment_date',
            'p.purpose',
            'p.property_id',
            't.name as tenant_name',
            'c.contract_number',
            'c.deleted_at as contract_deleted_at',
            'c.status as contract_status'
          )
          .orderBy(['p.period_year', 'p.period_month', 'p.id'])
          .limit(300)
      : [];

    const byPurpose = tenantLike
      ? await db('payments as p')
          .leftJoin('contracts as c', 'c.id', 'p.contract_id')
          .leftJoin('tenants as t', 't.id', 'p.tenant_id')
          .where('p.property_id', propertyId)
          .where('p.purpose', 'like', `%${tenantLike}%`)
          .modify((qb) => {
            if (year) qb.where('p.period_year', year);
          })
          .select(
            'p.id',
            'p.tenant_id',
            'p.contract_id',
            'p.period_year',
            'p.period_month',
            'p.amount',
            'p.payment_type',
            'p.purpose',
            't.name as tenant_name',
            'c.contract_number'
          )
          .limit(100)
      : [];

    const byAmount = amount != null && Number.isFinite(amount)
      ? await db('payments as p')
          .leftJoin('contracts as c', 'c.id', 'p.contract_id')
          .leftJoin('tenants as t', 't.id', 'p.tenant_id')
          .where('p.property_id', propertyId)
          .whereRaw('ABS(p.amount - ?) <= ?', [amount, amountEps])
          .modify((qb) => {
            if (year) qb.where('p.period_year', year);
          })
          .select(
            'p.id',
            'p.tenant_id',
            'p.contract_id',
            'p.period_year',
            'p.period_month',
            'p.amount',
            'p.payment_type',
            'p.purpose',
            't.name as tenant_name',
            'c.contract_number',
            'c.deleted_at as contract_deleted_at'
          )
          .orderBy(['p.period_year', 'p.period_month', 'p.id'])
          .limit(200)
      : [];

    // Payments on contracts that share number with this tenant but wrong tenant_id
    let onSiblingContracts = [];
    if (tenantIds.length) {
      const nums = await db('contracts')
        .where({ property_id: propertyId })
        .whereIn('tenant_id', tenantIds)
        .whereNotNull('contract_number')
        .distinct('contract_number')
        .pluck('contract_number');
      if (nums.length) {
        const siblingIds = await db('contracts')
          .where({ property_id: propertyId })
          .whereIn('contract_number', nums)
          .pluck('id');
        if (siblingIds.length) {
          onSiblingContracts = await db('payments as p')
            .leftJoin('tenants as t', 't.id', 'p.tenant_id')
            .leftJoin('contracts as c', 'c.id', 'p.contract_id')
            .where('p.property_id', propertyId)
            .whereIn('p.contract_id', siblingIds)
            .modify((qb) => {
              if (year) qb.where('p.period_year', year);
            })
            .select(
              'p.id',
              'p.tenant_id',
              'p.contract_id',
              'p.period_year',
              'p.period_month',
              'p.amount',
              'p.payment_type',
              'p.purpose',
              't.name as tenant_name',
              'c.contract_number',
              'c.tenant_id as contract_tenant_id'
            )
            .orderBy(['p.period_year', 'p.period_month', 'p.id'])
            .limit(300);
        }
      }
    }

    // Any-year totals for this tenant name
    const anyYear = tenantIds.length
      ? await db('payments')
          .where({ property_id: propertyId })
          .whereIn('tenant_id', tenantIds)
          .groupBy('period_year', 'payment_type')
          .select('period_year', 'payment_type')
          .sum('amount as s')
          .count('* as c')
          .orderBy('period_year', 'desc')
      : [];

    res.json({
      success: true,
      data: {
        propertyId,
        year,
        tenantLike,
        amount,
        tenants,
        byTenant,
        byPurpose,
        byAmount,
        onSiblingContracts,
        anyYear,
      },
    });
  })
);

/**
 * Property-wide utilities audit: charges/payments by month, live vs orphan contracts.
 */
router.get(
  '/utility-month-audit',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { db } = require('../db');
    const { maxDueUtilityMonth } = require('../utils/billingPeriod');

    const propertyId = Number(req.query.propertyId) || 1;
    const year = Number(req.query.year) || new Date().getFullYear();
    const focusMonth = req.query.month ? Number(req.query.month) : null;
    const roundMoney = (v) => Math.round(Number(v || 0) * 100) / 100;
    const utilDueThrough = maxDueUtilityMonth(year);

    const [chargeMonths, payMonths, purposeLikeUtil] = await Promise.all([
      db('utility_charges')
        .where({ property_id: propertyId, period_year: year })
        .modify((qb) => {
          if (focusMonth) qb.where('period_month', focusMonth);
        })
        .groupBy('period_month')
        .select('period_month')
        .sum('amount as s')
        .count('* as c')
        .orderBy('period_month'),
      db('payments')
        .where({ property_id: propertyId, period_year: year, payment_type: 'utilities' })
        .modify((qb) => {
          if (focusMonth) qb.where('period_month', focusMonth);
        })
        .groupBy('period_month')
        .select('period_month')
        .sum('amount as s')
        .count('* as c')
        .orderBy('period_month'),
      db('payments')
        .where({ property_id: propertyId, period_year: year })
        .whereNot('payment_type', 'utilities')
        .where(function () {
          this.where('purpose', 'like', '%коммун%')
            .orWhere('purpose', 'like', '%возмещ%')
            .orWhere('purpose', 'like', '%utilities%');
        })
        .select('id', 'contract_id', 'tenant_id', 'period_month', 'amount', 'payment_type', 'purpose')
        .limit(100),
    ]);

    const liveContractIds = (
      await db('contracts')
        .where({ property_id: propertyId })
        .whereNull('deleted_at')
        .whereIn('status', ['active', 'expiring'])
        .select('id')
    ).map((r) => r.id);

    const liveIdSet = new Set(liveContractIds);
    const month = focusMonth || utilDueThrough || 8;

    const chargesFocus = await db('utility_charges as u')
      .leftJoin('contracts as c', 'c.id', 'u.contract_id')
      .leftJoin('tenants as t', 't.id', 'u.tenant_id')
      .where({ 'u.property_id': propertyId, 'u.period_year': year, 'u.period_month': month })
      .select(
        'u.id',
        'u.contract_id',
        'u.tenant_id',
        'u.amount',
        'u.utility_type',
        'c.contract_number',
        'c.status as contract_status',
        'c.deleted_at',
        't.name as tenant_name'
      )
      .orderBy('u.amount', 'desc')
      .limit(200);

    const paysFocus = await db('payments as p')
      .leftJoin('contracts as c', 'c.id', 'p.contract_id')
      .leftJoin('tenants as t', 't.id', 'p.tenant_id')
      .where({
        'p.property_id': propertyId,
        'p.period_year': year,
        'p.period_month': month,
        'p.payment_type': 'utilities',
      })
      .select(
        'p.id',
        'p.contract_id',
        'p.tenant_id',
        'p.amount',
        'p.purpose',
        'c.contract_number',
        'c.status as contract_status',
        'c.deleted_at',
        't.name as tenant_name'
      )
      .orderBy('p.amount', 'desc')
      .limit(200);

    const splitLive = (rows) => {
      const live = [];
      const orphan = [];
      for (const row of rows) {
        const onLive = row.contract_id && liveIdSet.has(row.contract_id) && !row.deleted_at;
        (onLive ? live : orphan).push(row);
      }
      return {
        liveCount: live.length,
        liveSum: roundMoney(live.reduce((s, r) => s + Number(r.amount || 0), 0)),
        orphanCount: orphan.length,
        orphanSum: roundMoney(orphan.reduce((s, r) => s + Number(r.amount || 0), 0)),
        orphanSample: orphan.slice(0, 30),
        liveSample: live.slice(0, 20),
      };
    };

    const totals = {
      chargeRows: chargeMonths.reduce((s, r) => s + Number(r.c || 0), 0),
      chargeSum: roundMoney(chargeMonths.reduce((s, r) => s + Number(r.s || 0), 0)),
      payRows: payMonths.reduce((s, r) => s + Number(r.c || 0), 0),
      paySum: roundMoney(payMonths.reduce((s, r) => s + Number(r.s || 0), 0)),
    };

    res.json({
      success: true,
      data: {
        propertyId,
        year,
        utilDueThrough,
        focusMonth: month,
        totals,
        chargeMonths: chargeMonths.map((r) => ({
          month: Number(r.period_month),
          count: Number(r.c),
          sum: roundMoney(r.s),
        })),
        payMonths: payMonths.map((r) => ({
          month: Number(r.period_month),
          count: Number(r.c),
          sum: roundMoney(r.s),
        })),
        purposeLikeUtilitiesButWrongType: purposeLikeUtil,
        chargesFocus: splitLive(chargesFocus),
        paysFocus: splitLive(paysFocus),
      },
    });
  })
);

module.exports = router;
