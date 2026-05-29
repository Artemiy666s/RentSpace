const dayjs = require('dayjs');

function daysInMonth(year, month) {
  return dayjs(`${year}-${month}-01`).daysInMonth();
}

function contractDaysInMonth(startDate, endDate, year, month) {
  const monthStart = dayjs(`${year}-${month}-01`);
  const monthEnd = monthStart.endOf('month');
  const start = dayjs(startDate).isAfter(monthStart) ? dayjs(startDate) : monthStart;
  const end = endDate && dayjs(endDate).isBefore(monthEnd) ? dayjs(endDate) : monthEnd;
  if (end.isBefore(start)) return 0;
  return end.diff(start, 'day') + 1;
}

function calcRentAmount({ area, rateWithoutVat, vatRate = 20, year, month, startDate, endDate }) {
  const monthly = Number(area) * Number(rateWithoutVat);
  const dim = daysInMonth(year, month);
  const activeDays = contractDaysInMonth(startDate, endDate, year, month);
  const ratio = activeDays / dim;
  const amountWithoutVat = Math.round(monthly * ratio * 100) / 100;
  const vatAmount = Math.round(amountWithoutVat * (Number(vatRate) / 100) * 100) / 100;
  const amountWithVat = Math.round((amountWithoutVat + vatAmount) * 100) / 100;
  return { amountWithoutVat, vatAmount, amountWithVat, activeDays, daysInMonth: dim };
}

module.exports = { calcRentAmount, contractDaysInMonth, daysInMonth };
