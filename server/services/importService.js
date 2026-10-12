const path = require('path');
const ExcelJS = require('exceljs');
const { db } = require('../db');

const MONTH_MAP = {
  январь: 1, февраль: 2, март: 3, апрель: 4, май: 5, июнь: 6,
  июль: 7, август: 8, сентябрь: 9, октябрь: 10, ноябрь: 11, декабрь: 12,
};

const COL = {
  rent: { num: 4, tenant: 5, contract: 6, area: 7, rate: 8, monthsStart: 9 },
  planFact: { indicator: 3, rowType: 4, monthStart: 5 },
  heating: { category: 3, monthsStart: 4, headerRow: 3, dataStart: 4 },
};

const BUILDING_SHEETS = [
  { code: '56', name: 'Здание 56' },
  { code: '56а', name: 'Здание 56а' },
  { code: '56е', name: 'Здание 56е' },
  { code: '62', name: 'Здание 62' },
];

function parseNumber(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && val.result != null) return parseNumber(val.result);
  const s = String(val).replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeSheetName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function detectLegalType(name) {
  const s = String(name).toUpperCase();
  if (s.includes('ИП ') || s.startsWith('ИП')) return 'ip';
  if (s.includes('ЧП') || s.includes('ЧУП')) return 'chp';
  if (s.includes('ОАО')) return 'oao';
  if (s.includes('ООО') || s.includes('«')) return 'ooo';
  if (s.includes('ЗАО')) return 'zao';
  return 'other';
}

function parseContractDate(contractStr) {
  if (!contractStr) return null;
  const m = String(contractStr).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function metricCode(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60) || 'metric';
}

async function addError(batchId, sheet, row, msg, raw) {
  await db('import_errors').insert({
    import_batch_id: batchId,
    sheet_name: sheet,
    row_number: row,
    error_message: msg,
    raw_value: raw != null ? String(raw).slice(0, 500) : null,
  });
}

async function upsertPlanFact(ctx, month, code, name, plan, fact) {
  const { organizationId, propertyId, year, summary } = ctx;
  const existing = await db('plan_fact_items')
    .where({
      property_id: propertyId,
      period_year: year,
      period_month: month,
      metric_code: code,
    })
    .first();

  if (existing) {
    await db('plan_fact_items').where({ id: existing.id }).update({
      metric_name: name,
      plan_value: plan != null ? plan : existing.plan_value,
      fact_value: fact != null ? fact : existing.fact_value,
      updated_at: db.fn.now(),
    });
  } else {
    await db('plan_fact_items').insert({
      organization_id: organizationId,
      property_id: propertyId,
      period_year: year,
      period_month: month,
      metric_code: code,
      metric_name: name,
      plan_value: plan,
      fact_value: fact,
      unit: 'BYN',
    });
  }
  summary.planFact++;
}

async function ensureBuildings(propertyId, summary) {
  const ids = {};
  for (const b of BUILDING_SHEETS) {
    let row = await db('buildings').where({ property_id: propertyId, code: b.code }).first();
    if (!row) {
      const [id] = await db('buildings').insert({
        property_id: propertyId,
        name: b.name,
        code: b.code,
      });
      row = { id };
      summary.buildings = (summary.buildings || 0) + 1;
    }
    ids[b.code] = row.id;
    const hasFloor = await db('floors').where({ building_id: row.id }).first();
    if (!hasFloor) {
      await db('floors').insert({ building_id: row.id, name: '1 этаж', level_number: 1 });
      summary.floors = (summary.floors || 0) + 1;
    }
  }
  return ids;
}

async function importRentSheet(worksheet, ctx) {
  const { batchId, organizationId, propertyId, year, summary } = ctx;
  const headerRow = worksheet.getRow(3);
  const monthCols = [];

  headerRow.eachCell((cell, col) => {
    if (col < COL.rent.monthsStart) return;
    const v = String(cell.value || '').toLowerCase().replace(/\s+/g, ' ');
    for (const [name, m] of Object.entries(MONTH_MAP)) {
      if (v.includes('аренда') && v.includes(name)) {
        monthCols.push({ col, month: m, type: 'rent' });
      }
      if (v.includes('возмещ') && v.includes(name)) {
        monthCols.push({ col, month: m, type: 'utility' });
      }
    }
  });

  for (let rn = 4; rn <= worksheet.rowCount; rn++) {
    const row = worksheet.getRow(rn);
    const tenantName = row.getCell(COL.rent.tenant).value;
    if (!tenantName || String(tenantName).toLowerCase().includes('итого')) continue;

    try {
      const contractCell = row.getCell(COL.rent.contract).value;
      const area = parseNumber(row.getCell(COL.rent.area).value);
      const rate = parseNumber(row.getCell(COL.rent.rate).value);

      if (!area || area <= 0) {
        await addError(batchId, 'аренда по счетам', rn, 'Нет площади', tenantName);
        continue;
      }
      if (rate == null) {
        await addError(batchId, 'аренда по счетам', rn, 'Нет ставки', tenantName);
        continue;
      }

      const tenantKey = String(tenantName).trim();
      let tenant = await db('tenants')
        .where({ organization_id: organizationId, name: tenantKey })
        .first();

      if (!tenant) {
        const [tid] = await db('tenants').insert({
          organization_id: organizationId,
          name: tenantKey,
          legal_type: detectLegalType(tenantKey),
          status: 'active',
        });
        tenant = { id: tid };
        summary.tenants++;
      }

      const contractNumber = contractCell ? String(contractCell).trim() : `ROW-${rn}`;
      const startDate = parseContractDate(contractNumber) || `${year}-01-01`;

      let contract = await db('contracts')
        .where({ organization_id: organizationId, contract_number: contractNumber })
        .first();

      if (!contract) {
        const [cid] = await db('contracts').insert({
          organization_id: organizationId,
          property_id: propertyId,
          tenant_id: tenant.id,
          contract_number: contractNumber,
          contract_date: startDate,
          start_date: startDate,
          rate_without_vat: rate,
          vat_rate: 20,
          status: rate > 0 ? 'active' : 'archived',
        });
        contract = { id: cid };
        summary.contracts++;
      }

      for (const mc of monthCols) {
        const amount = parseNumber(row.getCell(mc.col).value);
        if (amount == null || amount === 0) continue;

        if (mc.type === 'rent') {
          const exists = await db('rent_charges').where({
            contract_id: contract.id,
            period_year: year,
            period_month: mc.month,
          }).first();

          if (!exists) {
            const net = Math.round((amount / 1.2) * 100) / 100;
            const vat = Math.round((amount - net) * 100) / 100;
            await db('rent_charges').insert({
              organization_id: organizationId,
              property_id: propertyId,
              tenant_id: tenant.id,
              contract_id: contract.id,
              period_year: year,
              period_month: mc.month,
              area,
              rate_without_vat: rate,
              vat_rate: 20,
              amount_without_vat: net,
              vat_amount: vat,
              amount_with_vat: amount,
              status: 'charged',
            });
            summary.rentCharges++;
          }
        } else {
          const exists = await db('utility_charges').where({
            contract_id: contract.id,
            period_year: year,
            period_month: mc.month,
            utility_type: 'heating',
          }).first();
          if (!exists) {
            await db('utility_charges').insert({
              organization_id: organizationId,
              property_id: propertyId,
              tenant_id: tenant.id,
              contract_id: contract.id,
              period_year: year,
              period_month: mc.month,
              utility_type: 'heating',
              calculation_method: 'manual',
              amount,
            });
            summary.utilityCharges++;
          }
        }
      }
    } catch (e) {
      await addError(batchId, 'аренда по счетам', rn, e.message, tenantName);
    }
  }
}

async function importPlanFactSheet(worksheet, ctx) {
  const { summary } = ctx;
  let year = ctx.year;
  const yCell = worksheet.getRow(2).getCell(9).value;
  if (yCell) year = parseInt(String(yCell), 10) || year;
  ctx.year = year;

  for (let rn = 4; rn <= worksheet.rowCount; rn++) {
    const row = worksheet.getRow(rn);
    const indicator = row.getCell(COL.planFact.indicator).value;
    if (!indicator || String(indicator).includes('показатели')) continue;

    const rowType = String(row.getCell(COL.planFact.rowType).value || '')
      .toLowerCase()
      .trim();
    const name = String(indicator).trim();
    const code = metricCode(name);

    for (let month = 1; month <= 12; month++) {
      const col = COL.planFact.monthStart + month - 1;
      const value = parseNumber(row.getCell(col).value);
      if (value == null) continue;

      if (rowType === 'план') {
        await upsertPlanFact(ctx, month, code, name, value, null);
      } else if (rowType === 'факт') {
        await upsertPlanFact(ctx, month, code, name, null, value);
      } else {
        await upsertPlanFact(ctx, month, code, name, null, value);
      }
    }
  }
  summary.planFactYear = year;
}

async function importHeatingSheet(worksheet, ctx) {
  const { organizationId, propertyId, summary } = ctx;
  const header = worksheet.getRow(COL.heating.headerRow);
  const monthCols = [];

  header.eachCell((cell, col) => {
    if (col < COL.heating.monthsStart) return;
    const v = String(cell.value || '').toLowerCase();
    for (const [name, m] of Object.entries(MONTH_MAP)) {
      if (v.includes(name)) monthCols.push({ col, month: m });
    }
  });

  let expenseYear = 2026;
  const octCol = monthCols.find((m) => m.month === 10);
  if (octCol) expenseYear = 2025;

  for (let rn = COL.heating.dataStart; rn <= worksheet.rowCount; rn++) {
    const row = worksheet.getRow(rn);
    const label = String(row.getCell(COL.heating.category).value || '');
    if (!label || label.toLowerCase().includes('итого')) continue;

    let category = 'other';
    const l = label.toLowerCase();
    if (l.includes('дров')) category = 'wood';
    else if (l.includes('з/п')) category = 'salary';
    else if (l.includes('пилен')) category = 'cutting';

    for (const mc of monthCols) {
      const amount = parseNumber(row.getCell(mc.col).value);
      if (amount == null) continue;

      let periodYear = expenseYear;
      if (mc.month >= 1 && mc.month <= 4) periodYear = 2026;

      const exists = await db('expenses').where({
        property_id: propertyId,
        period_year: periodYear,
        period_month: mc.month,
        category,
        amount,
      }).first();

      if (!exists) {
        await db('expenses').insert({
          organization_id: organizationId,
          property_id: propertyId,
          expense_date: `${periodYear}-${String(mc.month).padStart(2, '0')}-15`,
          period_year: periodYear,
          period_month: mc.month,
          category,
          amount,
          description: label,
        });
        summary.expenses++;
      }
    }
  }
}

function findSheet(workbook, ...candidates) {
  for (const c of candidates) {
    const ws = workbook.getWorksheet(c);
    if (ws) return ws;
  }
  return workbook.worksheets.find((w) =>
    candidates.some((c) => normalizeSheetName(w.name).includes(normalizeSheetName(c)))
  );
}

async function processExcelImport(filePath, fileName, organizationId, propertyId, userId) {
  const [batchId] = await db('import_batches').insert({
    organization_id: organizationId,
    property_id: propertyId,
    file_name: fileName,
    status: 'processing',
    created_by: userId,
  });

  const summary = {
    tenants: 0,
    contracts: 0,
    rentCharges: 0,
    utilityCharges: 0,
    planFact: 0,
    expenses: 0,
    buildings: 0,
    floors: 0,
    errors: 0,
  };

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const pfSheet = findSheet(workbook, 'показ.план  и факт', 'показ.план и факт');
    let year = 2026;
    if (pfSheet) {
      const y = pfSheet.getRow(2).getCell(9).value;
      if (y) year = parseInt(String(y), 10) || year;
    }

    const ctx = { batchId, organizationId, propertyId, year, summary };
    await ensureBuildings(propertyId, summary);

    const rentSheet = findSheet(workbook, 'аренда по счетам');
    if (rentSheet) await importRentSheet(rentSheet, ctx);
    else await addError(batchId, 'аренда по счетам', null, 'Лист не найден', null);

    if (pfSheet) await importPlanFactSheet(pfSheet, ctx);

    const heatSheet = findSheet(workbook, 'отопление');
    if (heatSheet) await importHeatingSheet(heatSheet, ctx);

    const errCount = await db('import_errors').where({ import_batch_id: batchId }).count('* as c').first();
    summary.errors = Number(errCount?.c || 0);
    summary.totalArea = await db('contracts as c')
      .join('contract_rooms as cr', 'cr.contract_id', 'c.id')
      .where('c.property_id', propertyId)
      .where('c.status', 'active')
      .sum('cr.area as s')
      .first()
      .then((r) => Number(r?.s || 0));

    await db('import_batches').where({ id: batchId }).update({
      status: 'completed',
      summary_json: JSON.stringify(summary),
      completed_at: db.fn.now(),
    });

    return { batchId, summary };
  } catch (e) {
    await db('import_batches').where({ id: batchId }).update({
      status: 'failed',
      summary_json: JSON.stringify({ error: e.message }),
      completed_at: db.fn.now(),
    });
    await addError(batchId, null, null, e.message, null);
    throw e;
  }
}

function resolveDefaultExcelPath() {
  const root = path.join(process.cwd());
  const candidates = [
    process.env.EXCEL_IMPORT_PATH,
    path.join(root, 'КВАРТАЛ_1АвтоматическиВосстановлено.xlsx'),
    path.join(root, 'data', 'kvartal.xlsx'),
    path.join(root, 'data', 'КВАРТАЛ_1АвтоматическиВосстановлено.xlsx'),
  ].filter(Boolean);
  const fs = require('fs');
  return candidates.find((p) => fs.existsSync(p));
}

module.exports = { processExcelImport, resolveDefaultExcelPath };
