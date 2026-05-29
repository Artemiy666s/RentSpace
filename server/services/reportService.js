const ExcelJS = require('exceljs');
const { db } = require('../db');
const dayjs = require('dayjs');
const {
  listRentRegister,
  getPlanFactMatrix,
  listTenantContractOverview,
  MONTH_NAMES,
} = require('./managerDataService');

async function buildRentRegisterWorkbook(propertyId, year, month) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Аренда по счетам');
  ws.addRow(['RentSpace.by', 'Реестр аренды']);
  ws.addRow(['Период', `${month}.${year}`]);
  ws.addRow([]);
  ws.addRow(['№', 'Арендатор', 'Договор', 'Площадь', 'Ставка', 'Начислено с НДС', 'Статус']);

  const charges = await db('rent_charges as rc')
    .join('tenants as t', 't.id', 'rc.tenant_id')
    .join('contracts as c', 'c.id', 'rc.contract_id')
    .where({ 'rc.property_id': propertyId, 'rc.period_year': year, 'rc.period_month': month })
    .whereNot('rc.status', 'cancelled')
    .select('t.name as tenant_name', 'c.contract_number', 'rc.*');

  let i = 1;
  let total = 0;
  for (const ch of charges) {
    ws.addRow([
      i++,
      ch.tenant_name,
      ch.contract_number,
      ch.area,
      ch.rate_without_vat,
      ch.amount_with_vat,
      ch.status,
    ]);
    total += Number(ch.amount_with_vat);
  }
  ws.addRow([]);
  ws.addRow(['', '', '', '', 'ИТОГО:', total]);
  return wb;
}

const MAIN_REGISTER_COLS = 5;
const TOTAL_REGISTER_COLS = 4;

const EXCEL_HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9D9D9' },
};

const EXCEL_MAIN_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE8F2FC' },
};

const EXCEL_TOTAL_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE8F4E8' },
};


function parseExportMonths(monthsParam) {
  if (monthsParam == null || monthsParam === '') {
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }
  const raw = Array.isArray(monthsParam) ? monthsParam : String(monthsParam).split(',');
  const parsed = [...new Set(raw.map((v) => Number(v)).filter((m) => m >= 1 && m <= 12))].sort(
    (a, b) => a - b
  );
  return parsed.length ? parsed : [new Date().getMonth() + 1];
}

function styleRentRegisterSheet(ws, rowCount, monthCount) {
  const monthColEnd = MAIN_REGISTER_COLS + monthCount * 2;
  const totalColStart = monthColEnd + 1;
  const lastCol = monthColEnd + TOTAL_REGISTER_COLS;

  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.fill = EXCEL_HEADER_FILL;
    cell.font = { bold: true, size: 11 };
    cell.alignment = {
      vertical: 'middle',
      horizontal: col <= MAIN_REGISTER_COLS || col === lastCol ? 'left' : 'right',
      wrapText: true,
    };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
    };
  });

  for (let r = 2; r <= rowCount; r++) {
    const dataRow = ws.getRow(r);
    dataRow.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col <= MAIN_REGISTER_COLS) {
        cell.fill = EXCEL_MAIN_FILL;
        cell.alignment = { vertical: 'middle', horizontal: col <= 3 ? 'left' : 'right' };
      } else if (col >= totalColStart && col <= lastCol) {
        cell.fill = EXCEL_TOTAL_FILL;
        if (col < lastCol) {
          cell.numFmt = '#,##0.00';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      } else if (col <= monthColEnd) {
        cell.numFmt = '#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      }
    });
  }

  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.columns = [
    { width: 6 },
    { width: 36 },
    { width: 28 },
    { width: 12 },
    { width: 16 },
    ...Array.from({ length: monthCount * 2 }, () => ({ width: 14 })),
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
  ];
}

const EXCEL_ZEBRA_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF5F9FF' },
};

function formatExcelDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) return dayjs(value).format('DD.MM.YYYY');
  const s = String(value).slice(0, 10);
  const d = dayjs(s);
  return d.isValid() ? d.format('DD.MM.YYYY') : s;
}

function styleOverviewSheet(ws, rowCount, colCount) {
  const headerRow = ws.getRow(1);
  headerRow.height = 24;
  headerRow.font = { bold: true, size: 11, name: 'Times New Roman' };
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.fill = EXCEL_HEADER_FILL;
    cell.alignment = {
      vertical: 'middle',
      horizontal: col <= 3 ? 'left' : 'center',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  for (let r = 2; r <= rowCount; r++) {
    const dataRow = ws.getRow(r);
    const zebra = r % 2 === 0 ? EXCEL_ZEBRA_FILL : null;
    dataRow.font = { size: 11, name: 'Times New Roman' };
    dataRow.eachCell({ includeEmpty: true }, (cell, col) => {
      if (zebra) cell.fill = zebra;
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
      if (col === 8 || col === 9) {
        cell.numFmt = '#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (col === 7) {
        cell.numFmt = '#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: col <= 3 ? 'left' : 'center' };
      }
    });
  }

  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.columns = [
    { width: 6 },
    { width: 34 },
    { width: 14 },
    { width: 28 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 22 },
  ].slice(0, colCount);
}

const TENANT_STATUS_RU = {
  active: 'Активный',
  debtor: 'Должник',
  archived: 'В архиве',
};

const CONTRACT_STATUS_RU = {
  active: 'Активный',
  expiring: 'На продление',
  draft: 'Черновик',
  terminated: 'Расторгнут',
  completed: 'Завершён',
};

async function buildTenantContractsWorkbook(query, orgId) {
  const rows = await listTenantContractOverview(query, orgId);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Арендаторы и договоры');

  const header = [
    '№',
    'Арендатор',
    'УНП',
    'Договор',
    'Дата договора',
    'Начало',
    'Окончание',
    'Площадь',
    'Ставка без НДС',
    'Задолженность',
    'Статус арендатора',
    'Статус договора',
    'Помещения',
  ];
  ws.addRow(header);

  let num = 1;
  for (const r of rows) {
    const contractLabel = r.contractNumber
      ? r.contractDate
        ? `${r.contractNumber} от ${formatExcelDate(r.contractDate)}`
        : r.contractNumber
      : '';
    ws.addRow([
      num++,
      r.tenantName,
      r.tenantUnp || '',
      contractLabel,
      formatExcelDate(r.contractDate),
      formatExcelDate(r.startDate),
      formatExcelDate(r.endDate),
      r.area != null ? Number(r.area) : '',
      r.rateWithoutVat != null ? Number(r.rateWithoutVat) : '',
      r.contractId ? Number(r.debt) : '',
      TENANT_STATUS_RU[r.tenantStatus] || r.tenantStatus,
      r.contractStatus ? CONTRACT_STATUS_RU[r.contractStatus] || r.contractStatus : '',
      (r.rooms || []).join(', '),
    ]);
  }

  styleOverviewSheet(ws, rows.length + 1, header.length);
  return wb;
}

async function buildFullRentRegisterWorkbook(propertyId, year, buildingId, monthsParam) {
  const months = parseExportMonths(monthsParam);
  const rows = await listRentRegister(propertyId, year, buildingId);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Аренда по счетам');

  const header = ['№', 'Арендатор', 'Договор', 'Площадь', 'Ставка без НДС'];
  for (const m of months) {
    header.push(`Аренда ${MONTH_NAMES[m - 1]}`);
    header.push(`Возмещение ${MONTH_NAMES[m - 1]}`);
  }
  header.push('Итого аренда', 'Итого возмещение', 'Задолженность', 'Статус');
  ws.addRow(header);

  for (const r of rows) {
    const row = [r.rowNum, r.tenantName, r.contractLabel, r.area, r.rateWithoutVat];
    for (const m of months) {
      row.push(r.months[m]?.rent || 0);
      row.push(r.months[m]?.utility || 0);
    }
    row.push(r.totalRent, r.totalUtil, r.debt, r.status);
    ws.addRow(row);
  }

  styleRentRegisterSheet(ws, rows.length + 1, months.length);
  return wb;
}

async function buildPlanFactWorkbook(propertyId, year) {
  const matrix = await getPlanFactMatrix(propertyId, year);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('План-факт');

  const headerRow1 = ['Показатель'];
  const headerRow2 = [''];
  for (const name of MONTH_NAMES) {
    headerRow1.push(name, '');
    headerRow2.push('План', 'Факт');
  }
  headerRow1.push('Итого план', 'Итого факт');
  headerRow2.push('', '');

  ws.addRow(headerRow1);
  ws.addRow(headerRow2);

  let col = 2;
  for (let m = 0; m < 12; m++) {
    ws.mergeCells(1, col, 1, col + 1);
    col += 2;
  }

  for (const row of matrix.rows) {
    const line = [row.name];
    let sumPlan = 0;
    let sumFact = 0;
    for (let m = 1; m <= 12; m++) {
      const v = row.values[m];
      line.push(v?.plan != null ? v.plan : '', v?.fact != null ? v.fact : '');
      if (v?.plan != null) sumPlan += Number(v.plan);
      if (v?.fact != null) sumFact += Number(v.fact);
    }
    line.push(sumPlan, sumFact);
    ws.addRow(line);
  }
  return wb;
}

async function buildMonthCloseReportWorkbook(propertyId, year, month) {
  const wb = new ExcelJS.Workbook();
  const { rows } = { rows: await listRentRegister(propertyId, year) };
  const ws1 = wb.addWorksheet('Аренда по счетам');
  ws1.addRow(['Аренда по счетам', `${month}.${year}`]);
  ws1.addRow(['№', 'Арендатор', 'Договор', 'Аренда мес.', 'Возмещение мес.', 'Задолженность']);
  for (const r of rows) {
    ws1.addRow([
      r.rowNum,
      r.tenantName,
      r.contractLabel,
      r.months[month]?.rent || 0,
      r.months[month]?.utility || 0,
      r.debt,
    ]);
  }
  const matrix = await getPlanFactMatrix(propertyId, year);
  const ws2 = wb.addWorksheet('План-факт');
  ws2.addRow(['Показатель', 'План', 'Факт']);
  for (const row of matrix.rows) {
    ws2.addRow([row.name, row.values[month]?.plan ?? '', row.values[month]?.fact ?? '']);
  }
  const freeRooms = await db('rooms as r')
    .join('buildings as b', 'b.id', 'r.building_id')
    .where('r.property_id', propertyId)
    .whereIn('r.status', ['free', 'ready_for_rent'])
    .whereNull('r.deleted_at')
    .select('r.room_number', 'b.name as building_name', 'r.area', 'r.status');
  const ws3 = wb.addWorksheet('Свободные помещения');
  ws3.addRow(['№', 'Здание', 'Площадь', 'Статус']);
  freeRooms.forEach((r, i) => ws3.addRow([i + 1, r.room_number, r.building_name, r.area, r.status]));
  return wb;
}

function buildMonthCloseHtml(propertyName, year, month, checkResult) {
  const rows = (checkResult.errors || [])
    .map((e) => `<li style="color:#c00">${e.message}</li>`)
    .join('');
  const warnings = (checkResult.warnings || [])
    .map((w) => `<li style="color:#b45309">${w.message}</li>`)
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Отчёт ${month}.${year}</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;padding:32px;color:#10213f}h1{font-size:22px}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #dde7f0;padding:8px;font-size:13px}th{background:#eef6ff}</style></head>
<body><h1>RentSpace.by — отчёт за ${month}.${year}</h1><p>Объект: ${propertyName}</p>
<p>Статус: ${checkResult.ok ? 'Месяц закрыт без ошибок' : 'Есть замечания'}</p>
<h2>Чеклист</h2><ul>
<li>Помещений проверено: ${checkResult.checklist?.roomsChecked ?? '—'}</li>
<li>Начислений: ${checkResult.checklist?.chargesCount ?? '—'}</li>
<li>Коммунальных внесено: ${checkResult.checklist?.utilitiesCount ?? '—'}</li>
<li>Платежей: ${checkResult.checklist?.paymentsCount ?? '—'}</li>
<li>Расходов: ${checkResult.checklist?.expensesCount ?? '—'}</li>
</ul>
${rows ? `<h2>Ошибки</h2><ul>${rows}</ul>` : ''}
${warnings ? `<h2>Предупреждения</h2><ul>${warnings}</ul>` : ''}
<p style="margin-top:32px;color:#6b7a90;font-size:12px">Сформировано ${new Date().toLocaleString('ru')}</p></body></html>`;
}

async function buildFreeRoomsWorkbook(propertyId) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Свободные помещения');
  ws.addRow(['№', 'Помещение', 'Здание', 'Этаж', 'Площадь м²', 'Ставка', 'Статус']);

  const rooms = await db('rooms as r')
    .join('buildings as b', 'b.id', 'r.building_id')
    .join('floors as f', 'f.id', 'r.floor_id')
    .where('r.property_id', propertyId)
    .whereIn('r.status', ['free', 'negotiation', 'reserved', 'ready_for_rent'])
    .whereNull('r.deleted_at')
    .select('r.*', 'b.name as building_name', 'f.name as floor_name');

  rooms.forEach((r, idx) => {
    ws.addRow([
      idx + 1,
      r.room_number,
      r.building_name,
      r.floor_name,
      r.area,
      r.recommended_rate_without_vat || r.current_rate_without_vat,
      r.status,
    ]);
  });
  return wb;
}

const CHARGE_STATUS_RU = {
  charged: 'Начислено',
  cancelled: 'Отменено',
  draft: 'Черновик',
};

function styleFinanceListSheet(ws, rowCount, colCount, numericCols = []) {
  const headerRow = ws.getRow(1);
  headerRow.height = 24;
  headerRow.font = { bold: true, size: 11, name: 'Times New Roman' };
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.fill = EXCEL_HEADER_FILL;
    cell.alignment = {
      vertical: 'middle',
      horizontal: numericCols.includes(col) ? 'right' : col === 1 ? 'left' : 'center',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  for (let r = 2; r <= rowCount; r++) {
    const dataRow = ws.getRow(r);
    const zebra = r % 2 === 0 ? EXCEL_ZEBRA_FILL : null;
    dataRow.font = { size: 11, name: 'Times New Roman' };
    dataRow.eachCell({ includeEmpty: true }, (cell, col) => {
      if (zebra) cell.fill = zebra;
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
      if (numericCols.includes(col)) {
        cell.numFmt = '#,##0.00';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'left' : 'center' };
      }
    });
  }

  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

async function fetchRentChargesForExport(propertyId, year, month, orgId) {
  let q = db('rent_charges as rc')
    .join('tenants as t', 't.id', 'rc.tenant_id')
    .select('rc.*', 't.name as tenant_name');
  if (orgId) q = q.where('rc.organization_id', orgId);
  if (propertyId) q = q.where('rc.property_id', propertyId);
  if (year) q = q.where('rc.period_year', year);
  if (month) q = q.where('rc.period_month', month);
  return q.orderBy('t.name', 'asc');
}

async function buildRentChargesWorkbook(propertyId, year, month, orgId) {
  const rows = await fetchRentChargesForExport(propertyId, year, month, orgId);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Начисления');
  const header = ['№', 'Арендатор', 'Площадь', 'Без НДС', 'С НДС', 'Статус'];
  ws.addRow(header);
  let num = 1;
  for (const r of rows) {
    ws.addRow([
      num++,
      r.tenant_name,
      r.area != null ? Number(r.area) : '',
      r.amount_without_vat != null ? Number(r.amount_without_vat) : '',
      r.amount_with_vat != null ? Number(r.amount_with_vat) : '',
      CHARGE_STATUS_RU[r.status] || r.status,
    ]);
  }
  styleFinanceListSheet(ws, rows.length + 1, header.length, [3, 4, 5]);
  ws.columns = [{ width: 6 }, { width: 34 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 14 }];
  return wb;
}

async function buildPaymentsWorkbook(propertyId, year, month, orgId) {
  let q = db('payments as p')
    .join('tenants as t', 't.id', 'p.tenant_id')
    .select('p.*', 't.name as tenant_name');
  if (orgId) q = q.where('p.organization_id', orgId);
  if (propertyId) q = q.where('p.property_id', propertyId);
  if (year) q = q.where('p.period_year', year);
  if (month) q = q.where('p.period_month', month);
  const rows = await q.orderBy('p.payment_date', 'desc');

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Платежи');
  const header = ['№', 'Дата', 'Арендатор', 'Сумма', 'Тип', 'Период'];
  ws.addRow(header);
  let num = 1;
  for (const r of rows) {
    ws.addRow([
      num++,
      formatExcelDate(r.payment_date),
      r.tenant_name,
      r.amount != null ? Number(r.amount) : '',
      r.payment_type,
      `${r.period_month}.${r.period_year}`,
    ]);
  }
  styleFinanceListSheet(ws, rows.length + 1, header.length, [4]);
  ws.columns = [{ width: 6 }, { width: 14 }, { width: 34 }, { width: 14 }, { width: 14 }, { width: 12 }];
  return wb;
}

const EXPENSE_CATEGORY_RU = {
  wood: 'Дрова',
  heating: 'Отопление',
  salary: 'Зарплата',
  taxes: 'Налоги',
  cutting: 'Пиление / распил',
  utilities: 'Коммунальные расходы',
  repair: 'Ремонт',
  maintenance: 'Обслуживание',
  security: 'Охрана',
  cleaning: 'Уборка',
  other: 'Прочее',
};

async function buildExpensesWorkbook(propertyId, year, monthsParam, orgId) {
  const months = parseExportMonths(monthsParam);
  let q = db('expenses').where({ property_id: propertyId, period_year: year });
  if (orgId) q = q.where('organization_id', orgId);
  const rows = await q.orderBy('expense_date', 'desc');
  const filteredRows = rows.filter((r) => months.includes(Number(r.period_month)));

  const wb = new ExcelJS.Workbook();

  const wsSummary = wb.addWorksheet('Свод по месяцам');
  const summaryHeader = ['Категория', ...months.map((m) => MONTH_NAMES[m - 1]), 'Итого'];
  wsSummary.addRow(summaryHeader);
  const categories = Object.keys(EXPENSE_CATEGORY_RU);
  for (const code of categories) {
    const categoryRows = filteredRows.filter((r) => r.category === code);
    const monthValues = months.map((m) =>
      categoryRows
        .filter((r) => Number(r.period_month) === m)
        .reduce((sum, r) => sum + Number(r.amount), 0)
    );
    const total = monthValues.reduce((a, b) => a + b, 0);
    wsSummary.addRow([EXPENSE_CATEGORY_RU[code], ...monthValues, total]);
  }
  styleFinanceListSheet(
    wsSummary,
    categories.length + 1,
    summaryHeader.length,
    Array.from({ length: months.length + 1 }, (_, i) => i + 2)
  );
  wsSummary.columns = [
    { width: 28 },
    ...Array.from({ length: months.length }, () => ({ width: 13 })),
    { width: 14 },
  ];

  const wsOps = wb.addWorksheet('Операции');
  const opHeader = ['№', 'Дата', 'Категория', 'Сумма', 'Комментарий'];
  wsOps.addRow(opHeader);
  let num = 1;
  for (const r of filteredRows) {
    wsOps.addRow([
      num++,
      formatExcelDate(r.expense_date),
      EXPENSE_CATEGORY_RU[r.category] || r.category,
      Number(r.amount),
      r.description || '',
    ]);
  }
  styleFinanceListSheet(wsOps, filteredRows.length + 1, opHeader.length, [4]);
  wsOps.columns = [{ width: 6 }, { width: 14 }, { width: 30 }, { width: 14 }, { width: 42 }];

  return wb;
}

module.exports = {
  buildRentRegisterWorkbook,
  buildFullRentRegisterWorkbook,
  buildTenantContractsWorkbook,
  buildPlanFactWorkbook,
  buildMonthCloseReportWorkbook,
  buildMonthCloseHtml,
  buildFreeRoomsWorkbook,
  buildRentChargesWorkbook,
  buildPaymentsWorkbook,
  buildExpensesWorkbook,
};
