exports.up = async function (knex) {
  await knex.schema.createTable('buildings', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('property_id').unsigned().notNullable()
      .references('id').inTable('properties').onDelete('CASCADE');
    t.string('name', 255).notNullable();
    t.string('code', 64).nullable();
    t.string('address', 512).nullable();
    t.text('description').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('floors', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('building_id').unsigned().notNullable()
      .references('id').inTable('buildings').onDelete('CASCADE');
    t.string('name', 128).notNullable();
    t.integer('level_number').notNullable().defaultTo(1);
    t.text('description').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('floor_plans', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('floor_id').unsigned().notNullable()
      .references('id').inTable('floors').onDelete('CASCADE');
    t.string('image_path', 512).nullable();
    t.string('original_file_name', 255).nullable();
    t.integer('width').unsigned().nullable();
    t.integer('height').unsigned().nullable();
    t.integer('version').unsigned().notNullable().defaultTo(1);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('rooms', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('property_id').unsigned().notNullable()
      .references('id').inTable('properties').onDelete('CASCADE');
    t.bigInteger('building_id').unsigned().notNullable()
      .references('id').inTable('buildings').onDelete('CASCADE');
    t.bigInteger('floor_id').unsigned().notNullable()
      .references('id').inTable('floors').onDelete('CASCADE');
    t.string('room_number', 64).notNullable();
    t.string('name', 255).nullable();
    t.decimal('area', 10, 2).notNullable().defaultTo(0);
    t.decimal('rentable_area', 10, 2).nullable();
    t.enum('room_type', [
      'retail', 'office', 'warehouse', 'food', 'service', 'island', 'technical', 'other',
    ]).notNullable().defaultTo('retail');
    t.enum('status', [
      'free', 'occupied', 'negotiation', 'reserved', 'debt', 'repair', 'technical', 'not_available',
    ]).notNullable().defaultTo('free');
    t.decimal('recommended_rate_without_vat', 12, 2).nullable();
    t.decimal('current_rate_without_vat', 12, 2).nullable();
    t.text('description').nullable();
    t.timestamp('deleted_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.unique(['floor_id', 'room_number']);
  });

  await knex.schema.createTable('room_shapes', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('room_id').unsigned().notNullable()
      .references('id').inTable('rooms').onDelete('CASCADE');
    t.bigInteger('floor_plan_id').unsigned().notNullable()
      .references('id').inTable('floor_plans').onDelete('CASCADE');
    t.enum('shape_type', ['polygon', 'rect']).notNullable().defaultTo('polygon');
    t.json('points_json').notNullable();
    t.string('fill_color', 32).nullable();
    t.string('stroke_color', 32).nullable();
    t.integer('z_index').notNullable().defaultTo(1);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('tenants', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('organization_id').unsigned().notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    t.string('name', 512).notNullable();
    t.enum('legal_type', ['ip', 'ooo', 'chp', 'zao', 'oao', 'physical', 'other']).defaultTo('other');
    t.string('unp', 32).nullable();
    t.string('contact_person', 255).nullable();
    t.string('phone', 64).nullable();
    t.string('email', 255).nullable();
    t.string('legal_address', 512).nullable();
    t.string('activity_type', 255).nullable();
    t.enum('status', ['active', 'debtor', 'archived']).notNullable().defaultTo('active');
    t.text('comment').nullable();
    t.timestamp('deleted_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('contracts', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('organization_id').unsigned().notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    t.bigInteger('property_id').unsigned().notNullable()
      .references('id').inTable('properties').onDelete('CASCADE');
    t.bigInteger('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.string('contract_number', 128).notNullable();
    t.date('contract_date').nullable();
    t.date('start_date').notNullable();
    t.date('end_date').nullable();
    t.date('actual_start_date').nullable();
    t.date('actual_end_date').nullable();
    t.decimal('rate_without_vat', 12, 2).notNullable();
    t.decimal('vat_rate', 5, 2).notNullable().defaultTo(20);
    t.integer('payment_day').nullable();
    t.decimal('security_deposit', 12, 2).nullable();
    t.enum('status', ['draft', 'active', 'expiring', 'terminated', 'completed', 'archived'])
      .notNullable().defaultTo('draft');
    t.text('comment').nullable();
    t.timestamp('deleted_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('contract_rooms', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('contract_id').unsigned().notNullable()
      .references('id').inTable('contracts').onDelete('CASCADE');
    t.bigInteger('room_id').unsigned().notNullable()
      .references('id').inTable('rooms').onDelete('CASCADE');
    t.decimal('area', 10, 2).notNullable();
    t.decimal('rate_without_vat', 12, 2).notNullable();
    t.date('start_date').nullable();
    t.date('end_date').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('rent_charges', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('organization_id').unsigned().notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    t.bigInteger('property_id').unsigned().notNullable()
      .references('id').inTable('properties').onDelete('CASCADE');
    t.bigInteger('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.bigInteger('contract_id').unsigned().notNullable()
      .references('id').inTable('contracts').onDelete('CASCADE');
    t.bigInteger('room_id').unsigned().nullable()
      .references('id').inTable('rooms').onDelete('SET NULL');
    t.integer('period_year').notNullable();
    t.integer('period_month').notNullable();
    t.decimal('area', 10, 2).notNullable();
    t.decimal('rate_without_vat', 12, 2).notNullable();
    t.decimal('vat_rate', 5, 2).notNullable().defaultTo(20);
    t.decimal('amount_without_vat', 12, 2).notNullable();
    t.decimal('vat_amount', 12, 2).notNullable();
    t.decimal('amount_with_vat', 12, 2).notNullable();
    t.enum('status', ['draft', 'charged', 'paid', 'partially_paid', 'overdue', 'cancelled'])
      .notNullable().defaultTo('charged');
    t.boolean('manual_adjustment').notNullable().defaultTo(false);
    t.text('adjustment_reason').nullable();
    t.bigInteger('created_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('utility_charges', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('organization_id').unsigned().notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    t.bigInteger('property_id').unsigned().notNullable()
      .references('id').inTable('properties').onDelete('CASCADE');
    t.bigInteger('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.bigInteger('contract_id').unsigned().notNullable()
      .references('id').inTable('contracts').onDelete('CASCADE');
    t.bigInteger('room_id').unsigned().nullable()
      .references('id').inTable('rooms').onDelete('SET NULL');
    t.integer('period_year').notNullable();
    t.integer('period_month').notNullable();
    t.enum('utility_type', [
      'electricity', 'water', 'heating', 'waste', 'maintenance', 'security', 'cleaning', 'other',
    ]).notNullable().defaultTo('other');
    t.enum('calculation_method', ['area', 'meter', 'fixed', 'manual']).notNullable().defaultTo('manual');
    t.decimal('amount', 12, 2).notNullable();
    t.text('comment').nullable();
    t.bigInteger('created_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('payments', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('organization_id').unsigned().notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    t.bigInteger('property_id').unsigned().notNullable()
      .references('id').inTable('properties').onDelete('CASCADE');
    t.bigInteger('tenant_id').unsigned().notNullable()
      .references('id').inTable('tenants').onDelete('CASCADE');
    t.bigInteger('contract_id').unsigned().nullable()
      .references('id').inTable('contracts').onDelete('SET NULL');
    t.date('payment_date').notNullable();
    t.decimal('amount', 12, 2).notNullable();
    t.enum('payment_type', ['rent', 'utilities', 'deposit', 'penalty', 'other']).notNullable().defaultTo('rent');
    t.integer('period_year').nullable();
    t.integer('period_month').nullable();
    t.text('purpose').nullable();
    t.text('comment').nullable();
    t.string('file_path', 512).nullable();
    t.bigInteger('created_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('expenses', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('organization_id').unsigned().notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    t.bigInteger('property_id').unsigned().notNullable()
      .references('id').inTable('properties').onDelete('CASCADE');
    t.bigInteger('building_id').unsigned().nullable()
      .references('id').inTable('buildings').onDelete('SET NULL');
    t.date('expense_date').notNullable();
    t.integer('period_year').notNullable();
    t.integer('period_month').notNullable();
    t.enum('category', [
      'heating', 'wood', 'salary', 'taxes', 'cutting', 'utilities', 'repair',
      'maintenance', 'security', 'cleaning', 'marketing', 'other',
    ]).notNullable().defaultTo('other');
    t.decimal('amount', 12, 2).notNullable();
    t.string('supplier', 255).nullable();
    t.text('description').nullable();
    t.string('file_path', 512).nullable();
    t.bigInteger('created_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('plan_fact_items', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('organization_id').unsigned().notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    t.bigInteger('property_id').unsigned().notNullable()
      .references('id').inTable('properties').onDelete('CASCADE');
    t.integer('period_year').notNullable();
    t.integer('period_month').notNullable();
    t.string('metric_code', 64).notNullable();
    t.string('metric_name', 255).notNullable();
    t.decimal('plan_value', 14, 2).nullable();
    t.decimal('fact_value', 14, 2).nullable();
    t.string('unit', 32).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.unique(['property_id', 'period_year', 'period_month', 'metric_code'], 'pf_prop_period_metric_uq');
  });

  await knex.schema.createTable('files', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('organization_id').unsigned().notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    t.string('entity_type', 64).notNullable();
    t.bigInteger('entity_id').unsigned().notNullable();
    t.string('file_name', 255).notNullable();
    t.string('file_path', 512).notNullable();
    t.string('mime_type', 128).nullable();
    t.bigInteger('size').unsigned().nullable();
    t.bigInteger('uploaded_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('audit_logs', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('organization_id').unsigned().nullable()
      .references('id').inTable('organizations').onDelete('SET NULL');
    t.bigInteger('user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.string('entity_type', 64).notNullable();
    t.bigInteger('entity_id').unsigned().notNullable();
    t.string('action', 64).notNullable();
    t.json('old_value_json').nullable();
    t.json('new_value_json').nullable();
    t.string('ip_address', 64).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('activity_events', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('organization_id').unsigned().notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    t.bigInteger('property_id').unsigned().nullable()
      .references('id').inTable('properties').onDelete('CASCADE');
    t.bigInteger('user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.string('event_type', 64).notNullable();
    t.string('title', 255).notNullable();
    t.text('description').nullable();
    t.string('entity_type', 64).nullable();
    t.bigInteger('entity_id').unsigned().nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('service_requests', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('organization_id').unsigned().notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    t.bigInteger('property_id').unsigned().notNullable()
      .references('id').inTable('properties').onDelete('CASCADE');
    t.bigInteger('room_id').unsigned().nullable()
      .references('id').inTable('rooms').onDelete('SET NULL');
    t.bigInteger('tenant_id').unsigned().nullable()
      .references('id').inTable('tenants').onDelete('SET NULL');
    t.string('title', 255).notNullable();
    t.text('description').nullable();
    t.enum('status', ['new', 'in_progress', 'waiting', 'closed']).notNullable().defaultTo('new');
    t.enum('priority', ['low', 'medium', 'high', 'urgent']).notNullable().defaultTo('medium');
    t.bigInteger('created_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.bigInteger('assigned_to').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('import_batches', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('organization_id').unsigned().notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    t.bigInteger('property_id').unsigned().nullable()
      .references('id').inTable('properties').onDelete('SET NULL');
    t.string('file_name', 255).notNullable();
    t.enum('status', ['pending', 'processing', 'completed', 'failed']).notNullable().defaultTo('pending');
    t.json('summary_json').nullable();
    t.bigInteger('created_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('completed_at').nullable();
  });

  await knex.schema.createTable('import_errors', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('import_batch_id').unsigned().notNullable()
      .references('id').inTable('import_batches').onDelete('CASCADE');
    t.string('sheet_name', 128).nullable();
    t.integer('row_number').nullable();
    t.string('column_name', 128).nullable();
    t.text('error_message').notNullable();
    t.text('raw_value').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  const tables = [
    'import_errors', 'import_batches', 'service_requests', 'activity_events', 'audit_logs',
    'files', 'plan_fact_items', 'expenses', 'payments', 'utility_charges', 'rent_charges',
    'contract_rooms', 'contracts', 'tenants', 'room_shapes', 'rooms', 'floor_plans',
    'floors', 'buildings',
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
};
