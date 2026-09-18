const dayjs = require('dayjs');
const { db } = require('../db');
const { roomRentableArea, isOccupiedForArea } = require('../utils/rentableArea');

async function checkMonth(propertyId, year, month) {
  const errors = [];
  const warnings = [];

  const rooms = await db('rooms').where({ property_id: propertyId }).whereNull('deleted_at');

  const occupiedIds = rooms.filter((r) => ['occupied', 'debt'].includes(r.status)).map((r) => r.id);
  const linksByRoom = new Map();
  if (occupiedIds.length) {
    const links = await db('contract_rooms as cr')
      .join('contracts as c', 'c.id', 'cr.contract_id')
      .whereIn('cr.room_id', occupiedIds)
      .where('c.status', 'active')
      .select(
        'cr.room_id',
        'cr.rate_without_vat',
        'cr.start_date',
        'c.id as contract_id'
      );
    for (const link of links) {
      if (!linksByRoom.has(link.room_id)) linksByRoom.set(link.room_id, link);
    }
  }

  for (const r of rooms) {
    if (!r.area || Number(r.area) <= 0) {
      errors.push({ code: 'room_area', message: `Помещение ${r.room_number}: не указана площадь`, roomId: r.id });
    }
    if (!r.status) {
      errors.push({ code: 'room_status', message: `Помещение ${r.room_number}: нет статуса`, roomId: r.id });
    }
    if (['occupied', 'debt'].includes(r.status)) {
      const link = linksByRoom.get(r.id);
      if (!link) {
        errors.push({
          code: 'occupied_no_contract',
          message: `Помещение ${r.room_number} сдано, но нет активного договора`,
          roomId: r.id,
        });
      } else if (!link.rate_without_vat && !r.current_rate_without_vat) {
        errors.push({
          code: 'no_rate',
          message: `Помещение ${r.room_number}: нет ставки аренды`,
          roomId: r.id,
        });
      }
      if (link && !link.start_date) {
        errors.push({
          code: 'no_start_date',
          message: `Договор по помещению ${r.room_number}: нет даты начала`,
          roomId: r.id,
        });
      }
    }
  }

  const charges = await db('rent_charges')
    .where({ property_id: propertyId, period_year: year, period_month: month })
    .whereNot('status', 'cancelled');
  if (charges.length === 0) {
    warnings.push({ code: 'no_charges', message: 'Не сформированы начисления аренды за месяц' });
  }

  const utilities = await db('utility_charges')
    .where({ property_id: propertyId, period_year: year, period_month: month });
  if (utilities.length === 0) {
    warnings.push({ code: 'no_utilities', message: 'Не внесены коммунальные начисления за месяц' });
  }

  const payments = await db('payments')
    .where({ property_id: propertyId, period_year: year, period_month: month });
  if (payments.length === 0) {
    warnings.push({ code: 'no_payments', message: 'Не внесены платежи за месяц' });
  }

  const expenses = await db('expenses')
    .where({ property_id: propertyId, period_year: year, period_month: month });
  if (expenses.length === 0) {
    warnings.push({ code: 'no_expenses', message: 'Не внесены расходы за месяц' });
  }

  const overdue = await db('contracts as c')
    .join('tenants as t', 't.id', 'c.tenant_id')
    .where('c.property_id', propertyId)
    .where('c.status', 'active')
    .where('c.payment_day', '<', dayjs().date())
    .limit(5);
  if (overdue.length) {
    warnings.push({
      code: 'overdue_payments',
      message: `Возможны просроченные платежи (${overdue.length} договоров)`,
    });
  }

  const expiredOpen = await db('contracts')
    .where({ property_id: propertyId, status: 'active' })
    .where('end_date', '<', dayjs(`${year}-${month}-01`).endOf('month').format('YYYY-MM-DD'));
  for (const c of expiredOpen) {
    errors.push({
      code: 'contract_expired',
      message: `Договор ${c.contract_number} истёк, но не закрыт`,
      contractId: c.id,
    });
  }

  const freeStatuses = ['free', 'ready_for_rent', 'repair', 'not_available'];
  const freeArea = rooms
    .filter((r) => freeStatuses.includes(r.status))
    .reduce((s, r) => s + roomRentableArea(r), 0);
  const totalArea = rooms.reduce((s, r) => s + roomRentableArea(r), 0);
  const occupiedArea = rooms
    .filter((r) => isOccupiedForArea(r.status))
    .reduce((s, r) => s + roomRentableArea(r), 0);
  const inProgressArea = rooms
    .filter((r) => ['negotiation', 'reserved'].includes(r.status))
    .reduce((s, r) => s + roomRentableArea(r), 0);
  if (Math.abs(totalArea - freeArea - occupiedArea - inProgressArea) > 0.5) {
    warnings.push({
      code: 'area_mismatch',
      message: 'Свободная площадь не сходится с общей (проверьте статусы помещений)',
    });
  }

  const checklist = {
    roomsChecked: rooms.length === rooms.filter((r) => r.area && r.status).length,
    roomsTotal: rooms.length,
    chargesGenerated: charges.length > 0,
    chargesCount: charges.length,
    utilitiesEntered: utilities.length > 0,
    utilitiesCount: utilities.length,
    paymentsEntered: payments.length > 0,
    paymentsCount: payments.length,
    expensesEntered: expenses.length > 0,
    expensesCount: expenses.length,
    errorsCount: errors.length,
    warningsCount: warnings.length,
    hasErrors: errors.length > 0,
  };

  return { ok: errors.length === 0, errors, warnings, checklist };
}

async function getMonthReadiness(propertyId, year, month) {
  const check = await checkMonth(propertyId, year, month);
  const closing = await db('month_closings')
    .where({ property_id: propertyId, period_year: year, period_month: month })
    .first();
  return {
    ...check.checklist,
    monthClosed: closing?.status === 'closed',
    closingStatus: closing?.status || null,
  };
}

/** Лёгкая проверка для дашборда — без обхода всех помещений. */
async function getMonthReadinessLite(propertyId, year, month) {
  const [charges, utilities, payments, expenses, closing] = await Promise.all([
    db('rent_charges')
      .where({ property_id: propertyId, period_year: year, period_month: month })
      .whereNot('status', 'cancelled')
      .count('id as c')
      .first(),
    db('utility_charges')
      .where({ property_id: propertyId, period_year: year, period_month: month })
      .count('id as c')
      .first(),
    db('payments')
      .where({ property_id: propertyId, period_year: year, period_month: month })
      .count('id as c')
      .first(),
    db('expenses')
      .where({ property_id: propertyId, period_year: year, period_month: month })
      .count('id as c')
      .first(),
    db('month_closings')
      .where({ property_id: propertyId, period_year: year, period_month: month })
      .first(),
  ]);

  const chargesCount = Number(charges?.c || 0);
  const utilitiesCount = Number(utilities?.c || 0);
  const paymentsCount = Number(payments?.c || 0);
  const expensesCount = Number(expenses?.c || 0);

  return {
    roomsChecked: true,
    roomsTotal: 0,
    chargesGenerated: chargesCount > 0,
    chargesCount,
    utilitiesEntered: utilitiesCount > 0,
    utilitiesCount,
    paymentsEntered: paymentsCount > 0,
    paymentsCount,
    expensesEntered: expensesCount > 0,
    expensesCount,
    errorsCount: 0,
    warningsCount: 0,
    hasErrors: false,
    monthClosed: closing?.status === 'closed',
    closingStatus: closing?.status || null,
  };
}

async function closeMonth({ propertyId, organizationId, year, month, userId }) {
  const check = await checkMonth(propertyId, year, month);
  if (!check.ok) {
    const err = new Error('Месяц нельзя закрыть: есть ошибки');
    err.status = 400;
    err.details = check;
    throw err;
  }

  const existing = await db('month_closings')
    .where({ property_id: propertyId, period_year: year, period_month: month })
    .first();

  const payload = {
    organization_id: organizationId,
    property_id: propertyId,
    period_year: year,
    period_month: month,
    status: 'closed',
    checklist_json: JSON.stringify(check.checklist),
    errors_json: JSON.stringify([]),
    closed_by: userId,
    closed_at: db.fn.now(),
    updated_at: db.fn.now(),
  };

  if (existing) {
    await db('month_closings').where({ id: existing.id }).update(payload);
    return existing.id;
  }
  const [id] = await db('month_closings').insert(payload);
  return id;
}

module.exports = { checkMonth, closeMonth, getMonthReadiness, getMonthReadinessLite };
