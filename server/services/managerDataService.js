const dayjs = require('dayjs');
const { db } = require('../db');

const MONTH_NAMES = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

function applyRoomFilters(q, query) {
  if (query.propertyId) q = q.where('r.property_id', query.propertyId);
  // Этаж однозначно задаёт место; buildingId не фильтруем вместе с floorId —
  // иначе при рассинхроне store (другое здание + старый этаж) таблица пустая.
  if (query.floorId) {
    q = q.where('r.floor_id', query.floorId);
  } else if (query.buildingId) {
    q = q.where('r.building_id', query.buildingId);
  }
  if (query.status) q = q.where('r.status', query.status);
  if (query.hasDebt === 'true') q = q.where('r.status', 'debt');
  if (query.freeOnly === 'true') q = q.whereIn('r.status', ['free', 'ready_for_rent']);
  if (query.readyForRent === 'true') q = q.where('r.status', 'ready_for_rent');
  if (query.repair === 'true') q = q.where('r.status', 'repair');
  if (query.negotiation === 'true') q = q.where('r.status', 'negotiation');
  if (query.tenantId) q = q.where('t.id', query.tenantId);
  if (query.search) {
    const s = `%${query.search}%`;
    q = q.where(function () {
      this.where('r.room_number', 'like', s)
        .orWhere('r.name', 'like', s)
        .orWhere('lease.tenant_name', 'like', s)
        .orWhere('lease.contract_number', 'like', s)
        .orWhere('lease.unp', 'like', s)
        .orWhere('r.comment', 'like', s);
    });
  }
  if (query.contractEnding === 'true') {
    const in60 = dayjs().add(60, 'day').format('YYYY-MM-DD');
    q = q
      .where('lease.end_date', '<=', in60)
      .where('lease.end_date', '>=', dayjs().format('YYYY-MM-DD'));
  }
  return q;
}

async function listRoomsTable(query, orgId) {
  const year = Number(query.year) || dayjs().year();
  const month = Number(query.month) || dayjs().month() + 1;

  let q = db('rooms as r')
    .join('properties as p', 'p.id', 'r.property_id')
    .join('buildings as b', 'b.id', 'r.building_id')
    .join('floors as f', 'f.id', 'r.floor_id')
    .leftJoin(
      db('contract_rooms as cr')
        .join('contracts as c', 'c.id', 'cr.contract_id')
        .join('tenants as t', 't.id', 'c.tenant_id')
        .where('c.status', 'active')
        .where(function () {
          this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', dayjs().format('YYYY-MM-DD'));
        })
        .select(
          'cr.room_id',
          't.id as tenant_id',
          't.name as tenant_name',
          't.unp',
          'c.contract_number',
          'c.contract_date',
          'c.start_date',
          'c.end_date',
          'c.vat_rate',
          'cr.rate_without_vat as cr_rate'
        )
        .as('lease'),
      'lease.room_id',
      'r.id'
    )
    .leftJoin(
      db('rent_charges')
        .where({ period_year: year, period_month: month })
        .whereNot('status', 'cancelled')
        .select('room_id')
        .sum('amount_with_vat as rent_charged')
        .groupBy('room_id')
        .as('rc'),
      'rc.room_id',
      'r.id'
    )
    .leftJoin(
      db('utility_charges')
        .where({ period_year: year, period_month: month })
        .select('room_id')
        .sum('amount as util_charged')
        .groupBy('room_id')
        .as('uc'),
      'uc.room_id',
      'r.id'
    )
    .leftJoin(
      db('payments')
        .where({ period_year: year, period_month: month })
        .select('tenant_id')
        .sum('amount as paid_month')
        .groupBy('tenant_id')
        .as('pay'),
      'pay.tenant_id',
      'lease.tenant_id'
    )
    .whereNull('r.deleted_at')
    .select(
      'r.*',
      'p.name as property_name',
      'b.name as building_name',
      'f.name as floor_name',
      'lease.tenant_id',
      'lease.tenant_name',
      'lease.unp',
      'lease.contract_number',
      'lease.contract_date',
      'lease.start_date',
      'lease.end_date',
      'lease.vat_rate',
      'lease.cr_rate',
      'rc.rent_charged',
      'uc.util_charged',
      'pay.paid_month'
    );

  if (orgId) q = q.where('p.organization_id', orgId);
  q = applyRoomFilters(q, query);

  const rows = await q.orderBy(['b.name', 'f.level_number', 'r.room_number']);

  return rows.map((r) => {
    const rate = Number(r.cr_rate || r.current_rate_without_vat || r.recommended_rate_without_vat || 0);
    const vat = Number(r.vat_rate || 20);
    const rentCharged = Number(r.rent_charged || 0);
    const utilCharged = Number(r.util_charged || 0);
    const paidMonth = Number(r.paid_month || 0);
    const chargedMonth = rentCharged + utilCharged;
    const debt = Math.max(0, chargedMonth - paidMonth);
    return {
      id: r.id,
      roomNumber: r.room_number,
      propertyName: r.property_name,
      buildingName: r.building_name,
      floorName: r.floor_name,
      area: Number(r.area),
      rentableArea: Number(r.rentable_area || r.area),
      status: r.status,
      roomType: r.room_type,
      tenantName: r.tenant_name,
      tenantUnp: r.unp,
      contractNumber: r.contract_number,
      contractDate: r.contract_date,
      rentStartDate: r.start_date,
      rentEndDate: r.end_date,
      rateWithoutVat: rate,
      vatRate: vat,
      rateWithVat: rate * (1 + vat / 100),
      rentChargedMonth: rentCharged,
      utilitiesChargedMonth: utilCharged,
      chargedMonth,
      paidMonth,
      debt,
      comment: r.comment || r.description,
      updatedAt: r.updated_at,
    };
  });
}

async function listTenantsTable(query, orgId) {
  let q = db('tenants as t').whereNull('t.deleted_at');
  if (orgId) q = q.where('t.organization_id', orgId);
  if (query.search) {
    const s = `%${query.search}%`;
    q = q.where(function () {
      this.where('t.name', 'like', s).orWhere('t.unp', 'like', s).orWhere('t.phone', 'like', s);
    });
  }
  const rows = await q.orderBy('t.name');
  return Promise.all(
    rows.map(async (t) => {
      const cnt = await db('contracts').where({ tenant_id: t.id, status: 'active' }).count('id as c').first();
      return {
        id: t.id,
        name: t.name,
        legalType: t.legal_type,
        unp: t.unp,
        contactPerson: t.contact_person,
        phone: t.phone,
        email: t.email,
        status: t.status,
        activeContracts: Number(cnt?.c || 0),
        comment: t.comment,
        updatedAt: t.updated_at,
      };
    })
  );
}

async function computeContractsDebt(propertyId, year, contractIds) {
  if (!contractIds.length) return {};
  const rentRows = await db('rent_charges')
    .where({ property_id: propertyId, period_year: year })
    .whereNot('status', 'cancelled')
    .whereIn('contract_id', contractIds)
    .groupBy('contract_id')
    .sum('amount_with_vat as total')
    .select('contract_id');
  const utilRows = await db('utility_charges')
    .where({ property_id: propertyId, period_year: year })
    .whereIn('contract_id', contractIds)
    .groupBy('contract_id')
    .sum('amount as total')
    .select('contract_id');
  const payRows = await db('payments')
    .where({ property_id: propertyId, period_year: year })
    .whereIn('contract_id', contractIds)
    .groupBy('contract_id')
    .sum('amount as total')
    .select('contract_id');

  const rentMap = Object.fromEntries(rentRows.map((r) => [r.contract_id, Number(r.total)]));
  const utilMap = Object.fromEntries(utilRows.map((r) => [r.contract_id, Number(r.total)]));
  const paidMap = Object.fromEntries(payRows.map((r) => [r.contract_id, Number(r.total)]));

  const debtMap = {};
  for (const id of contractIds) {
    const charged = (rentMap[id] || 0) + (utilMap[id] || 0);
    debtMap[id] = Math.max(0, charged - (paidMap[id] || 0));
  }
  return debtMap;
}

function monthPeriodStart(year, month) {
  return dayjs(`${year}-${String(month).padStart(2, '0')}-01`).format('YYYY-MM-DD');
}

function monthPeriodEnd(year, month) {
  return dayjs(`${year}-${String(month).padStart(2, '0')}-01`).endOf('month').format('YYYY-MM-DD');
}

function toDateSortKey(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function sortOverviewRows(rows, sort) {
  const mode = sort || 'newest';
  const copy = [...rows];
  const dateKey = (r) => toDateSortKey(r.startDate || r.contractDate);

  if (mode === 'oldest') {
    copy.sort((a, b) => dateKey(a).localeCompare(dateKey(b)) || a.tenantName.localeCompare(b.tenantName, 'ru'));
  } else if (mode === 'name') {
    copy.sort((a, b) => a.tenantName.localeCompare(b.tenantName, 'ru'));
  } else if (mode === 'debt') {
    copy.sort((a, b) => b.debt - a.debt || a.tenantName.localeCompare(b.tenantName, 'ru'));
  } else {
    copy.sort((a, b) => dateKey(b).localeCompare(dateKey(a)) || a.tenantName.localeCompare(b.tenantName, 'ru'));
  }
  return copy;
}

async function listTenantContractOverview(query, orgId) {
  const propertyId = query.propertyId ? Number(query.propertyId) : null;
  const tab = query.tab || 'all';
  const year = Number(query.year) || dayjs().year();
  const fromMonth = query.fromMonth ? Number(query.fromMonth) : null;
  const fromYear = query.fromYear ? Number(query.fromYear) : null;
  const toMonth = query.toMonth ? Number(query.toMonth) : null;
  const toYear = query.toYear ? Number(query.toYear) : null;
  const hasDateFilter =
    fromMonth && fromYear && fromMonth >= 1 && fromMonth <= 12 && toMonth && toYear && toMonth >= 1 && toMonth <= 12;

  let q = db('contracts as c')
    .join('tenants as t', 't.id', 'c.tenant_id')
    .whereNull('t.deleted_at')
    .whereNull('c.deleted_at');

  if (orgId) q = q.where('t.organization_id', orgId);
  if (propertyId) q = q.where('c.property_id', propertyId);

  if (tab === 'active') {
    q = q.where('c.status', 'active');
  } else if (tab === 'expiring') {
    const in60 = dayjs().add(60, 'day').format('YYYY-MM-DD');
    const today = dayjs().format('YYYY-MM-DD');
    q = q
      .where('c.status', 'active')
      .where('c.end_date', '<=', in60)
      .where('c.end_date', '>=', today);
  } else {
    q = q.whereIn('c.status', ['active', 'expiring', 'draft', 'terminated', 'completed']);
  }

  if (hasDateFilter) {
    const dateFrom = monthPeriodStart(fromYear, fromMonth);
    const dateTo = monthPeriodEnd(toYear, toMonth);
    q = q.where('c.start_date', '>=', dateFrom).where('c.start_date', '<=', dateTo);
  }

  const contracts = await q.select(
    'c.id as contract_id',
    'c.contract_number',
    'c.contract_date',
    'c.start_date',
    'c.end_date',
    'c.status as contract_status',
    'c.property_id',
    'c.rate_without_vat',
    'c.vat_rate',
    't.id as tenant_id',
    't.name as tenant_name',
    't.status as tenant_status',
    't.unp',
    't.phone'
  );

  const debtByProperty = {};
  const byProp = {};
  for (const c of contracts) {
    if (!byProp[c.property_id]) byProp[c.property_id] = [];
    byProp[c.property_id].push(c.contract_id);
  }
  for (const [pid, ids] of Object.entries(byProp)) {
    const debts = await computeContractsDebt(Number(pid), year, ids);
    Object.assign(debtByProperty, debts);
  }

  const rows = contracts.map((c) => {
    const rooms = [];
    return {
      rowKey: `c-${c.contract_id}`,
      tenantId: c.tenant_id,
      tenantName: c.tenant_name,
      tenantStatus: c.tenant_status,
      tenantUnp: c.unp,
      tenantPhone: c.phone,
      contractId: c.contract_id,
      contractNumber: c.contract_number,
      contractDate: c.contract_date,
      startDate: c.start_date,
      endDate: c.end_date,
      contractStatus: c.contract_status,
      rateWithoutVat: Number(c.rate_without_vat),
      vatRate: Number(c.vat_rate),
      debt: debtByProperty[c.contract_id] || 0,
      rooms,
    };
  });

  if (tab === 'all') {
    let tq = db('tenants as t').whereNull('t.deleted_at');
    if (orgId) tq = tq.where('t.organization_id', orgId);
    const tenants = await tq.select('t.id', 't.name', 't.status', 't.unp', 't.phone').orderBy('t.name');
    const withContract = new Set(contracts.map((c) => c.tenant_id));
    for (const t of tenants) {
      if (withContract.has(t.id)) continue;
      rows.push({
        rowKey: `t-${t.id}`,
        tenantId: t.id,
        tenantName: t.name,
        tenantStatus: t.status,
        tenantUnp: t.unp,
        tenantPhone: t.phone,
        contractId: null,
        contractNumber: null,
        contractDate: null,
        startDate: null,
        endDate: null,
        contractStatus: null,
        rateWithoutVat: null,
        vatRate: null,
        debt: 0,
        rooms: [],
      });
    }
  }

  const contractIds = contracts.map((c) => c.contract_id);
  if (contractIds.length) {
    const roomRows = await db('contract_rooms as cr')
      .join('rooms as r', 'r.id', 'cr.room_id')
      .whereIn('cr.contract_id', contractIds)
      .select('cr.contract_id', 'r.room_number');
    const roomMap = {};
    for (const r of roomRows) {
      if (!roomMap[r.contract_id]) roomMap[r.contract_id] = [];
      roomMap[r.contract_id].push(r.room_number);
    }
    const areaRows = await db('contract_rooms')
      .whereIn('contract_id', contractIds)
      .groupBy('contract_id')
      .sum('area as total_area')
      .select('contract_id');
    const areaMap = Object.fromEntries(areaRows.map((r) => [r.contract_id, Number(r.total_area)]));
    for (const row of rows) {
      if (row.contractId) {
        row.rooms = roomMap[row.contractId] || [];
        row.area = areaMap[row.contractId] || 0;
      }
    }
  }

  return sortOverviewRows(rows, query.sort);
}

async function listContractsTable(query, orgId) {
  let q = db('contracts as c')
    .join('tenants as t', 't.id', 'c.tenant_id')
    .join('properties as p', 'p.id', 'c.property_id')
    .select('c.*', 't.name as tenant_name', 't.unp', 'p.name as property_name');
  if (query.propertyId) q = q.where('c.property_id', query.propertyId);
  if (orgId) q = q.where('p.organization_id', orgId);
  if (query.status) q = q.where('c.status', query.status);
  if (query.search) {
    const s = `%${query.search}%`;
    q = q.where(function () {
      this.where('c.contract_number', 'like', s).orWhere('t.name', 'like', s);
    });
  }
  const rows = await q.orderBy('c.contract_number');
  const withRooms = await Promise.all(
    rows.map(async (c) => {
      const rooms = await db('contract_rooms as cr')
        .join('rooms as r', 'r.id', 'cr.room_id')
        .where('cr.contract_id', c.id)
        .select('r.room_number', 'cr.area');
      return {
        id: c.id,
        contractNumber: c.contract_number,
        contractDate: c.contract_date,
        tenantName: c.tenant_name,
        tenantUnp: c.unp,
        propertyName: c.property_name,
        startDate: c.start_date,
        endDate: c.end_date,
        actualEndDate: c.actual_end_date,
        rateWithoutVat: Number(c.rate_without_vat),
        vatRate: Number(c.vat_rate),
        status: c.status,
        rooms: rooms.map((r) => r.room_number).join(', '),
        totalArea: rooms.reduce((s, r) => s + Number(r.area), 0),
      };
    })
  );
  return withRooms;
}

async function listChargesTable(query, orgId) {
  const year = Number(query.year) || dayjs().year();
  const month = Number(query.month) || dayjs().month() + 1;
  let q = db('rent_charges as rc')
    .join('tenants as t', 't.id', 'rc.tenant_id')
    .join('contracts as c', 'c.id', 'rc.contract_id')
    .leftJoin('rooms as r', 'r.id', 'rc.room_id')
    .join('properties as p', 'p.id', 'rc.property_id')
    .where({ 'rc.period_year': year, 'rc.period_month': month })
    .whereNot('rc.status', 'cancelled')
    .select('rc.*', 't.name as tenant_name', 'c.contract_number', 'r.room_number', 'p.name as property_name');
  if (query.propertyId) q = q.where('rc.property_id', query.propertyId);
  if (orgId) q = q.where('p.organization_id', orgId);
  if (query.search) {
    const s = `%${query.search}%`;
    q = q.where(function () {
      this.where('t.name', 'like', s).orWhere('c.contract_number', 'like', s).orWhere('r.room_number', 'like', s);
    });
  }
  const rows = await q.orderBy('t.name');
  return rows.map((rc) => ({
    id: rc.id,
    tenantName: rc.tenant_name,
    contractNumber: rc.contract_number,
    roomNumber: rc.room_number,
    propertyName: rc.property_name,
    periodYear: rc.period_year,
    periodMonth: rc.period_month,
    area: Number(rc.area),
    rateWithoutVat: Number(rc.rate_without_vat),
    amountWithVat: Number(rc.amount_with_vat),
    status: rc.status,
  }));
}

async function listPaymentsTable(query, orgId) {
  const year = Number(query.year) || dayjs().year();
  const month = Number(query.month) || dayjs().month() + 1;
  let q = db('payments as pay')
    .join('tenants as t', 't.id', 'pay.tenant_id')
    .leftJoin('contracts as c', 'c.id', 'pay.contract_id')
    .join('properties as p', 'p.id', 'pay.property_id')
    .where({ 'pay.period_year': year, 'pay.period_month': month })
    .select('pay.*', 't.name as tenant_name', 'c.contract_number', 'p.name as property_name');
  if (query.propertyId) q = q.where('pay.property_id', query.propertyId);
  if (orgId) q = q.where('p.organization_id', orgId);
  if (query.search) {
    const s = `%${query.search}%`;
    q = q.where(function () {
      this.where('t.name', 'like', s).orWhere('c.contract_number', 'like', s);
    });
  }
  const rows = await q.orderBy('pay.payment_date', 'desc');
  return rows.map((p) => ({
    id: p.id,
    tenantName: p.tenant_name,
    contractNumber: p.contract_number,
    propertyName: p.property_name,
    amount: Number(p.amount),
    paymentDate: p.payment_date,
    paymentType: p.payment_type,
    periodYear: p.period_year,
    periodMonth: p.period_month,
    comment: p.comment,
  }));
}

async function listRentRegister(propertyId, year, buildingId) {
  const bid = buildingId ? Number(buildingId) : null;

  const roomAgg = db('contract_rooms as cr')
    .join('rooms as r', 'r.id', 'cr.room_id')
    .whereNull('r.deleted_at')
    .modify((qb) => {
      if (bid) qb.where('r.building_id', bid);
    })
    .select('cr.contract_id')
    .sum('cr.area as total_area')
    .avg('cr.rate_without_vat as rate_without_vat')
    .groupBy('cr.contract_id');

  const links = await db('contracts as c')
    .join('tenants as t', 't.id', 'c.tenant_id')
    .join(roomAgg.as('agg'), 'agg.contract_id', 'c.id')
    .where('c.property_id', propertyId)
    .whereNull('c.deleted_at')
    .whereNull('t.deleted_at')
    .whereIn('c.status', ['active', 'expiring', 'terminated', 'completed'])
    .select(
      'c.id as contract_id',
      't.name as tenant_name',
      'c.contract_number',
      'c.contract_date',
      'c.status as contract_status',
      'c.rate_without_vat as contract_rate',
      'agg.total_area',
      'agg.rate_without_vat'
    )
    .orderBy('t.name', 'asc');

  const rentByContractMonth = await db('rent_charges')
    .where({ property_id: propertyId, period_year: year })
    .whereNot('status', 'cancelled')
    .select('contract_id', 'period_month')
    .sum('amount_with_vat as total')
    .groupBy('contract_id', 'period_month');

  const utilByContractMonth = await db('utility_charges')
    .where({ property_id: propertyId, period_year: year })
    .select('contract_id', 'period_month')
    .sum('amount as total')
    .groupBy('contract_id', 'period_month');

  const rentMap = {};
  for (const row of rentByContractMonth) {
    const key = `${row.contract_id}-${row.period_month}`;
    rentMap[key] = Number(row.total);
  }
  const utilMap = {};
  for (const row of utilByContractMonth) {
    const key = `${row.contract_id}-${row.period_month}`;
    utilMap[key] = Number(row.total);
  }

  const paymentsByContract = await db('payments')
    .where({ property_id: propertyId, period_year: year })
    .groupBy('contract_id')
    .sum('amount as total')
    .select('contract_id');
  const paidMap = Object.fromEntries(
    paymentsByContract.map((p) => [p.contract_id, Number(p.total)])
  );

  return links.map((row, idx) => {
    const months = {};
    let totalRent = 0;
    let totalUtil = 0;
    for (let m = 1; m <= 12; m++) {
      const rk = `${row.contract_id}-${m}`;
      months[m] = {
        rent: rentMap[rk] || 0,
        utility: utilMap[rk] || 0,
      };
      totalRent += months[m].rent;
      totalUtil += months[m].utility;
    }
    const paid = paidMap[row.contract_id] || 0;
    const debt = Math.max(0, totalRent + totalUtil - paid);
    return {
      rowNum: idx + 1,
      contractId: row.contract_id,
      tenantName: row.tenant_name,
      contractLabel: `${row.contract_number}${row.contract_date ? ` от ${dayjs(row.contract_date).format('DD.MM.YYYY')}` : ''}`,
      area: Number(row.total_area) || 0,
      rateWithoutVat: Number(row.rate_without_vat) || Number(row.contract_rate) || 0,
      months,
      totalRent,
      totalUtil,
      total: totalRent + totalUtil,
      debt,
      status: row.contract_status,
    };
  });
}

const PLAN_FACT_METRICS = [
  { code: 'rent_current', name: 'Аренда текущая, руб. с НДС', unit: 'BYN', autoFact: true },
  { code: 'utilities_fact', name: 'Возмещение коммунальных услуг', unit: 'BYN', autoFact: true },
  { code: 'expenses_fact', name: 'Затраты по объекту', unit: 'BYN', autoFact: true },
  { code: 'new_tenants', name: 'Новые арендные места / арендаторы', unit: 'шт.', autoFact: true },
  { code: 'terminated_contracts', name: 'Расторгнутые договоры аренды', unit: 'шт.', autoFact: true },
  { code: 'new_rent_amount', name: 'Аренда от новых арендных мест, руб. с НДС', unit: 'BYN', autoFact: true },
  { code: 'free_area_start', name: 'Количество свободных площадей — начало месяца', unit: 'м²', autoFact: true },
  { code: 'free_area_end', name: 'Количество свободных площадей — конец месяца', unit: 'м²', autoFact: true },
];

const PLAN_FACT_METRIC_BY_CODE = Object.fromEntries(PLAN_FACT_METRICS.map((m) => [m.code, m]));

function toMetricCode(name) {
  return `custom_${String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || Date.now()}`;
}

function normalizeMetricName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Агрессивная нормализация для сопоставления дубликатов из импорта/ручного ввода. */
function normalizeMetricNameAggressive(name) {
  return normalizeMetricName(name)
    .replace(/[.,;:'"«»()—–\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BUILTIN_METRIC_NAMES_NORM = new Set(
  PLAN_FACT_METRICS.flatMap((m) => [normalizeMetricName(m.name), normalizeMetricNameAggressive(m.name)])
);

const BUILTIN_DUPLICATE_PATTERNS = [
  { test: (n) => /аренда.*текущ|текущ.*аренда/.test(n) },
  { test: (n) => /коммунал|возмещ.*ком|ком.*услуг/.test(n) },
  { test: (n) => /затрат.*объект|затраты.*понесен|налог.*з\s*п/.test(n) },
  { test: (n) => /новые.*аренд|новые.*места|новые.*арендатор/.test(n) },
  { test: (n) => /расторг/.test(n) },
  { test: (n) => /аренда.*новых|новых.*арендн/.test(n) },
  { test: (n) => /свободн.*начал|начал.*месяц/.test(n) && /площад/.test(n) },
  { test: (n) => /свободн.*конец|конец.*месяц/.test(n) && /площад/.test(n) },
];

function isDuplicateBuiltinMetricName(name) {
  const n = normalizeMetricNameAggressive(name);
  if (!n) return false;
  if (BUILTIN_METRIC_NAMES_NORM.has(n)) return true;
  for (const m of PLAN_FACT_METRICS) {
    const bn = normalizeMetricNameAggressive(m.name);
    if (n === bn) return true;
    if (n.length >= 12 && bn.length >= 12 && (n.includes(bn.slice(0, 14)) || bn.includes(n.slice(0, 14)))) {
      return true;
    }
  }
  return BUILTIN_DUPLICATE_PATTERNS.some((p) => p.test(n));
}

/** Устаревшие коды — не показывать отдельными строками (план/факт теперь в одной строке). */
const LEGACY_PLAN_FACT_CODES = new Set(['rent_plan', 'rent_fact']);

/** План из старых строк с отдельным кодом «план» подтягиваем в основную строку. */
const LEGACY_PLAN_BY_METRIC = {
  rent_current: ['rent_plan'],
};

function isMissingTableError(e) {
  return e?.code === 'ER_NO_SUCH_TABLE' || e?.errno === 1146;
}

async function loadHiddenMetricCodes(propertyId, year) {
  try {
    const hiddenRows = await db('plan_fact_hidden_metrics').where({
      property_id: propertyId,
      period_year: year,
    });
    return new Set(hiddenRows.map((r) => r.metric_code));
  } catch (e) {
    if (isMissingTableError(e)) return new Set();
    throw e;
  }
}

function coercePlanValue(val) {
  if (val == null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function duplicateNameMatchesMetricCode(metricCode, name) {
  const n = normalizeMetricNameAggressive(name);
  const rules = {
    rent_current: (x) => /аренда.*текущ|текущ.*аренда/.test(x),
    utilities_fact: (x) => /коммунал|возмещ.*ком|ком.*услуг/.test(x),
    expenses_fact: (x) => /затрат.*объект|затраты.*понесен|налог.*з\s*п/.test(x),
    new_tenants: (x) => /новые.*аренд|новые.*места|новые.*арендатор/.test(x),
    terminated_contracts: (x) => /расторг/.test(x),
    new_rent_amount: (x) => /аренда.*новых|новых.*арендн/.test(x),
    free_area_start: (x) => /свободн.*начал|начал.*месяц/.test(x) && /площад/.test(x),
    free_area_end: (x) => /свободн.*конец|конец.*месяц/.test(x) && /площад/.test(x),
  };
  return rules[metricCode]?.(n) ?? false;
}

function resolvePlanValue(metricCode, month, storedMap, stored) {
  const fromDirect = coercePlanValue(storedMap[`${metricCode}-${month}`]?.plan_value);
  if (fromDirect != null) return fromDirect;

  for (const leg of LEGACY_PLAN_BY_METRIC[metricCode] || []) {
    const legacy = coercePlanValue(storedMap[`${leg}-${month}`]?.plan_value);
    if (legacy != null) return legacy;
  }

  if (!PLAN_FACT_METRIC_BY_CODE[metricCode]) return null;

  for (const s of stored) {
    if (s.period_month !== month) continue;
    const v = coercePlanValue(s.plan_value);
    if (v == null) continue;
    if (PLAN_FACT_METRIC_BY_CODE[s.metric_code] || LEGACY_PLAN_FACT_CODES.has(s.metric_code)) continue;
    if (duplicateNameMatchesMetricCode(metricCode, s.metric_name)) return v;
  }
  return null;
}

function resolveAutoFact(metricCode, month, ctx) {
  switch (metricCode) {
    case 'rent_fact':
    case 'rent_current':
      return ctx.rentByMonth[month] || 0;
    case 'utilities_fact':
      return ctx.utilByMonth[month] || 0;
    case 'expenses_fact':
      return ctx.expByMonth[month] || 0;
    case 'new_tenants':
      return ctx.newContractsByMonth[month] || 0;
    case 'terminated_contracts':
      return ctx.terminatedByMonth[month] || 0;
    case 'new_rent_amount':
      return ctx.newRentByMonth[month] || 0;
    case 'free_area_start':
    case 'free_area_end':
      return ctx.freeArea;
    default:
      return null;
  }
}

async function upsertPlanFactCell(organizationId, propertyId, year, month, metricCode, { planValue, factValue }) {
  const builtin = PLAN_FACT_METRIC_BY_CODE[metricCode];
  const existingRow = await db('plan_fact_items')
    .where({
      property_id: propertyId,
      period_year: year,
      period_month: month,
      metric_code: metricCode,
    })
    .first();

  let metricName = builtin?.name;
  let unit = builtin?.unit || 'BYN';
  if (!builtin) {
    const anyRow = await db('plan_fact_items')
      .where({ property_id: propertyId, period_year: year, metric_code: metricCode })
      .first();
    if (!anyRow) {
      const err = new Error('Неизвестный показатель');
      err.status = 400;
      throw err;
    }
    metricName = anyRow.metric_name;
    unit = anyRow.unit || 'BYN';
  }

  const patch = { updated_at: db.fn.now() };
  if (planValue !== undefined) patch.plan_value = planValue;
  if (factValue !== undefined) patch.fact_value = factValue;

  if (existingRow) {
    await db('plan_fact_items').where({ id: existingRow.id }).update(patch);
  } else {
    await db('plan_fact_items').insert({
      organization_id: organizationId,
      property_id: propertyId,
      period_year: year,
      period_month: month,
      metric_code: metricCode,
      metric_name: metricName,
      unit,
      plan_value: planValue !== undefined ? planValue : null,
      fact_value: factValue !== undefined ? factValue : null,
    });
  }

  return { saved: true };
}

async function createPlanFactMetric(organizationId, propertyId, year, { name, unit }) {
  const metricName = String(name || '').trim();
  const metricUnit = String(unit || 'BYN').trim();
  if (!metricName) {
    const err = new Error('Укажите название показателя');
    err.status = 400;
    throw err;
  }

  const metricCode = toMetricCode(metricName);
  const exists = await db('plan_fact_items')
    .where({
      property_id: propertyId,
      period_year: year,
      metric_code: metricCode,
    })
    .first();

  if (exists) {
    const err = new Error('Показатель с таким названием уже существует');
    err.status = 400;
    throw err;
  }

  const rows = Array.from({ length: 12 }, (_, idx) => ({
    organization_id: organizationId,
    property_id: propertyId,
    period_year: year,
    period_month: idx + 1,
    metric_code: metricCode,
    metric_name: metricName,
    unit: metricUnit,
    plan_value: null,
    fact_value: null,
  }));

  await db('plan_fact_items').insert(rows);
  return { created: true, metricCode };
}

async function deletePlanFactMetric(propertyId, year, metricCode) {
  if (!metricCode || LEGACY_PLAN_FACT_CODES.has(metricCode)) {
    const err = new Error('Неизвестный показатель');
    err.status = 400;
    throw err;
  }

  const isBuiltin = !!PLAN_FACT_METRIC_BY_CODE[metricCode];

  await db('plan_fact_items')
    .where({
      property_id: propertyId,
      period_year: year,
      metric_code: metricCode,
    })
    .del();

  if (isBuiltin) {
    try {
      const exists = await db('plan_fact_hidden_metrics')
        .where({ property_id: propertyId, period_year: year, metric_code: metricCode })
        .first();
      if (!exists) {
        await db('plan_fact_hidden_metrics').insert({
          property_id: propertyId,
          period_year: year,
          metric_code: metricCode,
        });
      }
    } catch (e) {
      if (!isMissingTableError(e)) throw e;
    }
    return { deleted: true, hidden: true };
  }

  return { deleted: true, hidden: false };
}

async function updatePlanFactMetric(propertyId, year, metricCode, { name, unit }) {
  if (!metricCode || LEGACY_PLAN_FACT_CODES.has(metricCode)) {
    const err = new Error('Неизвестный показатель');
    err.status = 400;
    throw err;
  }
  const builtin = PLAN_FACT_METRIC_BY_CODE[metricCode];
  const patch = { updated_at: db.fn.now() };
  if (name != null && String(name).trim()) patch.metric_name = String(name).trim();
  if (!builtin && unit != null && String(unit).trim()) patch.unit = String(unit).trim();
  if (Object.keys(patch).length === 1) {
    const err = new Error('Укажите название или единицу измерения');
    err.status = 400;
    throw err;
  }
  const existing = await db('plan_fact_items')
    .where({ property_id: propertyId, period_year: year, metric_code: metricCode })
    .first();
  if (!existing && builtin && patch.metric_name) {
    const orgRow = await db('properties').where({ id: propertyId }).select('organization_id').first();
    const rows = Array.from({ length: 12 }, (_, idx) => ({
      organization_id: orgRow.organization_id,
      property_id: propertyId,
      period_year: year,
      period_month: idx + 1,
      metric_code: metricCode,
      metric_name: patch.metric_name,
      unit: builtin.unit,
      plan_value: null,
      fact_value: null,
    }));
    await db('plan_fact_items').insert(rows);
    return { updated: true };
  }
  if (!existing) {
    const err = new Error('Показатель не найден');
    err.status = 400;
    throw err;
  }
  await db('plan_fact_items')
    .where({ property_id: propertyId, period_year: year, metric_code: metricCode })
    .update(patch);
  return { updated: true };
}

function parsePfNumber(val) {
  if (val === '' || val == null) return null;
  const n = Number(String(val).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

async function updatePlanFactRow(organizationId, propertyId, year, metricCode, monthValues) {
  for (const [monthKey, vals] of Object.entries(monthValues || {})) {
    const month = Number(monthKey);
    if (!month || month < 1 || month > 12) continue;
    const patch = {};
    if (vals && Object.prototype.hasOwnProperty.call(vals, 'plan')) {
      patch.planValue = parsePfNumber(vals.plan);
    }
    if (vals && Object.prototype.hasOwnProperty.call(vals, 'fact')) {
      patch.factValue = parsePfNumber(vals.fact);
    }
    if (Object.keys(patch).length) {
      await upsertPlanFactCell(organizationId, propertyId, year, month, metricCode, patch);
    }
  }
  return { saved: true };
}

async function getPlanFactMatrix(propertyId, year) {
  const hiddenCodes = await loadHiddenMetricCodes(propertyId, year);

  const stored = await db('plan_fact_items').where({ property_id: propertyId, period_year: year });
  const customMetrics = Object.values(
    stored
      .filter((row) => !PLAN_FACT_METRIC_BY_CODE[row.metric_code] && !LEGACY_PLAN_FACT_CODES.has(row.metric_code))
      .reduce((acc, row) => {
        if (!acc[row.metric_code]) {
          acc[row.metric_code] = {
            code: row.metric_code,
            name: row.metric_name,
            unit: row.unit || 'BYN',
            autoFact: false,
            custom: true,
          };
        }
        return acc;
      }, {})
  ).filter((m) => !isDuplicateBuiltinMetricName(m.name));

  const nameOverrides = {};
  for (const row of stored) {
    if (PLAN_FACT_METRIC_BY_CODE[row.metric_code] && row.metric_name?.trim()) {
      nameOverrides[row.metric_code] = row.metric_name.trim();
    }
  }

  const metrics = PLAN_FACT_METRICS.filter((m) => !hiddenCodes.has(m.code))
    .map((m) => ({
      ...m,
      name: nameOverrides[m.code] || m.name,
      deletable: true,
    }))
    .concat(
      customMetrics.map((m) => ({
        ...m,
        deletable: true,
      }))
    );
  const storedMap = {};
  for (const s of stored) {
    storedMap[`${s.metric_code}-${s.period_month}`] = s;
  }

  const rentFacts = await db('rent_charges')
    .where({ property_id: propertyId, period_year: year })
    .whereNot('status', 'cancelled')
    .groupBy('period_month')
    .sum('amount_with_vat as total')
    .select('period_month');

  const utilFacts = await db('utility_charges')
    .where({ property_id: propertyId, period_year: year })
    .groupBy('period_month')
    .sum('amount as total')
    .select('period_month');

  const expenseFacts = await db('expenses')
    .where({ property_id: propertyId, period_year: year })
    .groupBy('period_month')
    .sum('amount as total')
    .select('period_month');

  const rentByMonth = Object.fromEntries(rentFacts.map((r) => [r.period_month, Number(r.total)]));
  const utilByMonth = Object.fromEntries(utilFacts.map((r) => [r.period_month, Number(r.total)]));
  const expByMonth = Object.fromEntries(expenseFacts.map((r) => [r.period_month, Number(r.total)]));

  const freeStatuses = ['free', 'ready_for_rent', 'repair', 'not_available'];
  const freeAreaTotal = await db('rooms')
    .where({ property_id: propertyId })
    .whereIn('status', freeStatuses)
    .whereNull('deleted_at')
    .sum('area as total')
    .first();
  const freeArea = Number(freeAreaTotal?.total || 0);

  const newContractsByMonth = {};
  const terminatedByMonth = {};
  const newRentByMonth = {};
  for (let m = 1; m <= 12; m++) {
    const start = dayjs(`${year}-${m}-01`).format('YYYY-MM-DD');
    const end = dayjs(`${year}-${m}-01`).endOf('month').format('YYYY-MM-DD');
    const newCnt = await db('contracts')
      .where({ property_id: propertyId })
      .where('start_date', '>=', start)
      .where('start_date', '<=', end)
      .count('id as c')
      .first();
    const termCnt = await db('contracts')
      .where({ property_id: propertyId })
      .where('actual_end_date', '>=', start)
      .where('actual_end_date', '<=', end)
      .count('id as c')
      .first();
    newContractsByMonth[m] = Number(newCnt?.c || 0);
    terminatedByMonth[m] = Number(termCnt?.c || 0);
    const newContractIds = await db('contracts')
      .where({ property_id: propertyId })
      .where('start_date', '>=', start)
      .where('start_date', '<=', end)
      .pluck('id');
    let newRentSum = 0;
    if (newContractIds.length) {
      const newRent = await db('rent_charges')
        .where({ property_id: propertyId, period_year: year, period_month: m })
        .whereNot('status', 'cancelled')
        .whereIn('contract_id', newContractIds)
        .sum('amount_with_vat as total')
        .first();
      newRentSum = Number(newRent?.total || 0);
    }
    newRentByMonth[m] = newRentSum;
  }

  const autoCtx = {
    rentByMonth,
    utilByMonth,
    expByMonth,
    newContractsByMonth,
    terminatedByMonth,
    newRentByMonth,
    freeArea,
  };

  const rows = metrics.map((metric) => {
    const values = {};
    for (let m = 1; m <= 12; m++) {
      const key = `${metric.code}-${m}`;
      const storedRow = storedMap[key];
      const plan = resolvePlanValue(metric.code, m, storedMap, stored);
      const hasManualFact = storedRow?.fact_value != null;
      const autoFact = resolveAutoFact(metric.code, m, autoCtx);
      const fact = hasManualFact ? Number(storedRow.fact_value) : autoFact;

      values[m] = {
        plan,
        fact,
        planEditable: true,
        factEditable: true,
        factAuto: metric.autoFact && !hasManualFact,
      };
    }
    return {
      ...metric,
      values,
      custom: !!metric.custom,
      deletable: metric.deletable !== false,
    };
  });

  return { year, months: MONTH_NAMES, rows };
}

async function getExpensesSummary(propertyId, year) {
  const rows = await db('expenses')
    .where({ property_id: propertyId, period_year: year });

  const categories = [
    { code: 'wood', label: 'Дрова' },
    { code: 'heating', label: 'Отопление' },
    { code: 'salary', label: 'Зарплата' },
    { code: 'taxes', label: 'Налоги' },
    { code: 'cutting', label: 'Пиление / распил' },
    { code: 'utilities', label: 'Коммунальные расходы' },
    { code: 'repair', label: 'Ремонт' },
    { code: 'maintenance', label: 'Обслуживание' },
    { code: 'security', label: 'Охрана' },
    { code: 'cleaning', label: 'Уборка' },
    { code: 'other', label: 'Прочее' },
  ];

  const matrix = categories.map((cat) => {
    const months = {};
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      const sum = rows
        .filter((r) => r.category === cat.code && r.period_month === m)
        .reduce((s, r) => s + Number(r.amount), 0);
      months[m] = sum;
      total += sum;
    }
    return { ...cat, months, total };
  });

  return { categories: matrix, operations: rows };
}

module.exports = {
  listRoomsTable,
  listTenantsTable,
  listTenantContractOverview,
  listContractsTable,
  listChargesTable,
  listPaymentsTable,
  listRentRegister,
  getPlanFactMatrix,
  upsertPlanFactCell,
  createPlanFactMetric,
  deletePlanFactMetric,
  updatePlanFactMetric,
  updatePlanFactRow,
  PLAN_FACT_METRICS,
  getExpensesSummary,
  MONTH_NAMES,
};
