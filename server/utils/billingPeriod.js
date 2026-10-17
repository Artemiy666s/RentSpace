/**
 * Правила начисления (таймзона Europe/Minsk):
 * - аренда за месяц M — после 15-го числа месяца M;
 * - коммуналка за месяц M — после 15-го числа месяца M+1.
 */

const CHARGE_DAY = 15;

/** Электронный учёт долга: месяцы до этой даты не входят в задолженность (вели вручную). */
const DEBT_LEDGER_START_YEAR = 2026;
/** Darkwood Soft — единственный должник июня–августа 2026 (бумажный период у остальных). */
const DEBT_LEDGER_START_MONTH = 6;
/** Остальные арендаторы: электронный долг с сентября 2026. */
const DEBT_LEDGER_GENERAL_START_MONTH = 9;

const EARLY_DEBT_TENANT_RE = /дарквуд|darkwood/i;

function isEarlyDebtTenant(tenantName) {
  return EARLY_DEBT_TENANT_RE.test(String(tenantName || ''));
}

/**
 * С какого месяца года (1–12) считать долг.
 * 13 — ни одного месяца (год раньше старта учёта).
 */
function debtLedgerStartMonth(year) {
  const y = Number(year);
  if (y > DEBT_LEDGER_START_YEAR) return 1;
  if (y < DEBT_LEDGER_START_YEAR) return 13;
  return DEBT_LEDGER_START_MONTH;
}

/**
 * Старт долга по арендатору: в 2026 у всех, кроме Darkwood Soft, — с сентября.
 */
function debtLedgerStartMonthForTenant(year, tenantName) {
  const base = debtLedgerStartMonth(year);
  if (Number(year) !== DEBT_LEDGER_START_YEAR) return base;
  if (isEarlyDebtTenant(tenantName)) return DEBT_LEDGER_START_MONTH;
  return DEBT_LEDGER_GENERAL_START_MONTH;
}

function nowInMinsk(asOf = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Minsk',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = {};
  for (const p of fmt.formatToParts(asOf)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return { year: parts.year, month: parts.month, day: parts.day };
}

/**
 * До какого месяца года аренда уже начислена (включительно).
 * 0 — ещё ни одного месяца этого года.
 */
function maxDueRentMonth(year, asOf = new Date()) {
  const now = nowInMinsk(asOf);
  const y = Number(year);
  if (now.year > y) return 12;
  if (now.year < y) return 0;
  if (now.day >= CHARGE_DAY) return now.month;
  return now.month - 1;
}

/**
 * До какого месяца года коммуналка уже показывается (включительно).
 */
function maxDueUtilityMonth(year, asOf = new Date()) {
  const now = nowInMinsk(asOf);
  // После 15-го видны месяцы до (текущий − 1), до 15-го — до (текущий − 2).
  let dueYear = now.year;
  let dueMonth = now.day >= CHARGE_DAY ? now.month - 1 : now.month - 2;
  if (dueMonth <= 0) {
    dueMonth += 12;
    dueYear -= 1;
  }
  if (dueYear > Number(year)) return 12;
  if (dueYear < Number(year)) return 0;
  return dueMonth;
}

module.exports = {
  CHARGE_DAY,
  DEBT_LEDGER_START_YEAR,
  DEBT_LEDGER_START_MONTH,
  DEBT_LEDGER_GENERAL_START_MONTH,
  isEarlyDebtTenant,
  debtLedgerStartMonth,
  debtLedgerStartMonthForTenant,
  nowInMinsk,
  maxDueRentMonth,
  maxDueUtilityMonth,
};
