const bcrypt = require('bcryptjs');

const TENANTS = [
  'GreenCity', 'Galileo Group', 'Coffee Hub', 'Golden Coffee', 'Sport Life',
  'Модный Дом', 'Kids Planet', 'Аптека №1', 'TechStore', 'Beauty Room', 'Burger Street',
];

function rect(x, y, w, h) {
  return {
    type: 'polygon',
    points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
  };
}

exports.seed = async function (knex) {
  const tables = [
    'import_errors', 'import_batches', 'service_requests', 'activity_events', 'audit_logs',
    'files', 'plan_fact_items', 'expenses', 'payments', 'utility_charges', 'rent_charges',
    'contract_rooms', 'contracts', 'tenants', 'room_shapes', 'rooms', 'floor_plans',
    'floors', 'buildings', 'users', 'properties', 'organizations',
  ];
  for (const t of tables) {
    await knex(t).del();
  }

  const [orgId] = await knex('organizations').insert({
    name: 'RentSpace.by Demo',
    legal_name: 'ООО «Демо УК»',
    status: 'active',
  });

  const [propertyId] = await knex('properties').insert({
    organization_id: orgId,
    name: 'ТРК «Квартал»',
    city: 'Речица',
    address: 'г. Речица',
    status: 'active',
  });

  const buildings = [
    { code: '56', name: 'Здание 56' },
    { code: '56а', name: 'Здание 56а' },
    { code: '56е', name: 'Здание 56е' },
    { code: '62', name: 'Здание 62' },
  ];
  const buildingIds = {};
  for (const b of buildings) {
    const [id] = await knex('buildings').insert({
      property_id: propertyId,
      name: b.name,
      code: b.code,
    });
    buildingIds[b.code] = id;
  }

  const passwordHash = await bcrypt.hash('demo1234', 10);
  const users = [
    { name: 'Администратор', email: 'admin@rentspace.by', role: 'super_admin', organization_id: null },
    { name: 'Директор', email: 'director@rentspace.by', role: 'director', organization_id: orgId },
    { name: 'Заведующая', email: 'manager@rentspace.by', role: 'manager', organization_id: orgId },
    { name: 'Бухгалтер', email: 'accountant@rentspace.by', role: 'accountant', organization_id: orgId },
  ];
  for (const u of users) {
    await knex('users').insert({ ...u, password_hash: passwordHash, status: 'active' });
  }

  const b56 = buildingIds['56'];
  const [floor1Id] = await knex('floors').insert({
    building_id: b56,
    name: '1 этаж',
    level_number: 1,
  });
  await knex('floors').insert([
    { building_id: b56, name: '2 этаж', level_number: 2 },
    { building_id: b56, name: '3 этаж', level_number: 3 },
    { building_id: buildingIds['56а'], name: '1 этаж', level_number: 1 },
    { building_id: buildingIds['62'], name: '1 этаж', level_number: 1 },
  ]);

  const [planId] = await knex('floor_plans').insert({
    floor_id: floor1Id,
    image_path: null,
    width: 1200,
    height: 400,
    version: 1,
    is_active: true,
  });

  const tenantIds = {};
  for (const name of TENANTS) {
    const [tid] = await knex('tenants').insert({
      organization_id: orgId,
      name,
      legal_type: name.includes('№') ? 'ooo' : 'ip',
      status: 'active',
    });
    tenantIds[name] = tid;
  }

  const statuses = ['occupied', 'occupied', 'free', 'occupied', 'debt', 'free', 'occupied', 'occupied', 'free', 'negotiation', 'occupied', 'free', 'occupied', 'free', 'occupied', 'free'];
  const roomIds = [];
  for (let i = 0; i < 16; i++) {
    const num = 101 + i;
    const col = i % 8;
    const row = Math.floor(i / 8);
    const area = 18 + (i % 5) * 4.5;
    const status = statuses[i] || 'free';
    const [rid] = await knex('rooms').insert({
      property_id: propertyId,
      building_id: b56,
      floor_id: floor1Id,
      room_number: String(num),
      name: `Помещение ${num}`,
      area,
      rentable_area: area,
      room_type: i % 3 === 0 ? 'food' : 'retail',
      status,
      recommended_rate_without_vat: 21,
      current_rate_without_vat: status === 'occupied' || status === 'debt' ? 21 : null,
    });
    roomIds.push(rid);

    const x = 40 + col * 140;
    const y = 40 + row * 180;
    await knex('room_shapes').insert({
      room_id: rid,
      floor_plan_id: planId,
      shape_type: 'polygon',
      points_json: JSON.stringify(rect(x, y, 120, 150)),
      z_index: i + 1,
      is_active: true,
    });
  }

  for (let i = 0; i < 8; i++) {
    const tenantName = TENANTS[i];
    const room = roomIds[i];
    const roomRow = await knex('rooms').where({ id: room }).first();
    if (roomRow.status !== 'occupied' && roomRow.status !== 'debt') continue;

    const [cid] = await knex('contracts').insert({
      organization_id: orgId,
      property_id: propertyId,
      tenant_id: tenantIds[tenantName],
      contract_number: `01/${numContract(i)}-24`,
      start_date: '2024-01-01',
      end_date: '2026-12-31',
      rate_without_vat: 21,
      vat_rate: 20,
      status: 'active',
    });
    await knex('contract_rooms').insert({
      contract_id: cid,
      room_id: room,
      area: roomRow.area,
      rate_without_vat: 21,
      start_date: '2024-01-01',
    });
  }

  function numContract(i) {
    return String(i + 1).padStart(2, '0');
  }

  const year = 2026;
  for (let month = 1; month <= 4; month++) {
    const contracts = await knex('contracts').where({ property_id: propertyId, status: 'active' });
    for (const c of contracts) {
      const cr = await knex('contract_rooms').where({ contract_id: c.id }).first();
      const amount = Number(cr.area) * Number(cr.rate_without_vat) * 1.2;
      await knex('rent_charges').insert({
        organization_id: orgId,
        property_id: propertyId,
        tenant_id: c.tenant_id,
        contract_id: c.id,
        room_id: cr.room_id,
        period_year: year,
        period_month: month,
        area: cr.area,
        rate_without_vat: cr.rate_without_vat,
        vat_rate: 20,
        amount_without_vat: Number(cr.area) * Number(cr.rate_without_vat),
        vat_amount: Number(cr.area) * Number(cr.rate_without_vat) * 0.2,
        amount_with_vat: amount,
        status: month < 4 ? 'charged' : 'charged',
      });
      if (month >= 2) {
        await knex('payments').insert({
          organization_id: orgId,
          property_id: propertyId,
          tenant_id: c.tenant_id,
          contract_id: c.id,
          payment_date: `${year}-${String(month).padStart(2, '0')}-10`,
          amount: amount * 0.9,
          payment_type: 'rent',
          period_year: year,
          period_month: month,
        });
      }
    }
  }

  await knex('expenses').insert([
    { organization_id: orgId, property_id: propertyId, expense_date: '2026-01-15', period_year: 2026, period_month: 1, category: 'wood', amount: 4000, description: 'дрова' },
    { organization_id: orgId, property_id: propertyId, expense_date: '2026-02-15', period_year: 2026, period_month: 2, category: 'salary', amount: 5300, description: 'з/п с учетом налогов' },
  ]);

  await knex('plan_fact_items').insert([
    { organization_id: orgId, property_id: propertyId, period_year: 2026, period_month: 1, metric_code: 'rent_current', metric_name: 'аренда текущая руб. с НДС', plan_value: 25944.69, fact_value: 28214.26, unit: 'BYN' },
    { organization_id: orgId, property_id: propertyId, period_year: 2026, period_month: 2, metric_code: 'rent_current', metric_name: 'аренда текущая руб. с НДС', plan_value: 77436.06, fact_value: 76187.37, unit: 'BYN' },
    { organization_id: orgId, property_id: propertyId, period_year: 2026, period_month: 5, metric_code: 'vacant_area', metric_name: 'кол-во площадей свободных', plan_value: null, fact_value: 1716.8, unit: 'm2' },
  ]);

  await knex('activity_events').insert([
    { organization_id: orgId, property_id: propertyId, event_type: 'rent_out', title: 'Сдано помещение 101', entity_type: 'room', entity_id: roomIds[0] },
    { organization_id: orgId, property_id: propertyId, event_type: 'payment', title: 'Поступление арендной платы', entity_type: 'payment', entity_id: 1 },
  ]);
};
