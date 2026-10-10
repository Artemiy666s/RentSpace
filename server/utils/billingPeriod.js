/**
 * Правила начисления (таймзона Europe/Minsk):
 * - аренда за месяц M — с 10-го числа месяца M (счета выставляются после 10-го);
 * - коммуналка за месяц M — после 15-го числа месяца M+1.
 */

const RENT_CHARGE_DAY = 10;
const UTILITY_CHARGE_DAY = 15;

/** @deprecated use RENT_CHARGE_DAY; kept for chargeService import compatibility */
const CHARGE_DAY = RENT_CHARGE_DAY;

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
 * Будущие месяцы никогда не входят.
 */
function maxDueRentMonth(year, asOf = new Date()) {
  const now = nowInMinsk(asOf);
  const y = Number(year);
  if (now.year > y) return 12;
  if (now.year < y) return 0;
  if (now.day >= RENT_CHARGE_DAY) return now.month;
  return now.month - 1;
}

/**
 * До какого месяца года коммуналка уже показывается (включительно).
 */
function maxDueUtilityMonth(year, asOf = new Date()) {
  const now = nowInMinsk(asOf);
  // После 15-го видны месяцы до (текущий − 1), до 15-го — до (текущий − 2).
  let dueYear = now.year;
  let dueMonth = now.day >= UTILITY_CHARGE_DAY ? now.month - 1 : now.month - 2;
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
  RENT_CHARGE_DAY,
  UTILITY_CHARGE_DAY,
  nowInMinsk,
  maxDueRentMonth,
  maxDueUtilityMonth,
};
