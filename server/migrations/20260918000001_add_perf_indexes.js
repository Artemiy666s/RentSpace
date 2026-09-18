/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('rent_charges', (t) => {
    t.index(['property_id', 'period_year', 'period_month'], 'idx_rent_charges_property_period');
    t.index(['contract_id', 'period_year'], 'idx_rent_charges_contract_year');
    t.index(['room_id', 'period_year', 'period_month'], 'idx_rent_charges_room_period');
  });

  await knex.schema.alterTable('payments', (t) => {
    t.index(['property_id', 'period_year', 'payment_type'], 'idx_payments_property_period_type');
    t.index(['tenant_id', 'period_year', 'period_month'], 'idx_payments_tenant_period');
    t.index(['contract_id', 'period_year'], 'idx_payments_contract_year');
  });

  await knex.schema.alterTable('utility_charges', (t) => {
    t.index(['property_id', 'period_year', 'period_month'], 'idx_utility_charges_property_period');
    t.index(['contract_id', 'period_year'], 'idx_utility_charges_contract_year');
    t.index(['room_id', 'period_year', 'period_month'], 'idx_utility_charges_room_period');
  });

  await knex.schema.alterTable('rooms', (t) => {
    t.index(['property_id', 'deleted_at'], 'idx_rooms_property_deleted');
    t.index(['floor_id', 'deleted_at'], 'idx_rooms_floor_deleted');
    t.index(['status'], 'idx_rooms_status');
  });

  await knex.schema.alterTable('contracts', (t) => {
    t.index(['property_id', 'status'], 'idx_contracts_property_status');
    t.index(['tenant_id', 'status'], 'idx_contracts_tenant_status');
  });

  await knex.schema.alterTable('contract_rooms', (t) => {
    t.index(['room_id'], 'idx_contract_rooms_room');
    t.index(['contract_id'], 'idx_contract_rooms_contract');
  });

  await knex.schema.alterTable('expenses', (t) => {
    t.index(['property_id', 'period_year'], 'idx_expenses_property_year');
  });

  await knex.schema.alterTable('activity_events', (t) => {
    t.index(['property_id', 'created_at'], 'idx_activity_events_property_created');
  });

  await knex.schema.alterTable('room_shapes', (t) => {
    t.index(['floor_plan_id', 'is_active'], 'idx_room_shapes_plan_active');
  });

  await knex.schema.alterTable('floor_plans', (t) => {
    t.index(['floor_id', 'is_active'], 'idx_floor_plans_floor_active');
  });
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable('floor_plans', (t) => {
    t.dropIndex([], 'idx_floor_plans_floor_active');
  });
  await knex.schema.alterTable('room_shapes', (t) => {
    t.dropIndex([], 'idx_room_shapes_plan_active');
  });
  await knex.schema.alterTable('activity_events', (t) => {
    t.dropIndex([], 'idx_activity_events_property_created');
  });
  await knex.schema.alterTable('expenses', (t) => {
    t.dropIndex([], 'idx_expenses_property_year');
  });
  await knex.schema.alterTable('contract_rooms', (t) => {
    t.dropIndex([], 'idx_contract_rooms_room');
    t.dropIndex([], 'idx_contract_rooms_contract');
  });
  await knex.schema.alterTable('contracts', (t) => {
    t.dropIndex([], 'idx_contracts_property_status');
    t.dropIndex([], 'idx_contracts_tenant_status');
  });
  await knex.schema.alterTable('rooms', (t) => {
    t.dropIndex([], 'idx_rooms_property_deleted');
    t.dropIndex([], 'idx_rooms_floor_deleted');
    t.dropIndex([], 'idx_rooms_status');
  });
  await knex.schema.alterTable('utility_charges', (t) => {
    t.dropIndex([], 'idx_utility_charges_property_period');
    t.dropIndex([], 'idx_utility_charges_contract_year');
    t.dropIndex([], 'idx_utility_charges_room_period');
  });
  await knex.schema.alterTable('payments', (t) => {
    t.dropIndex([], 'idx_payments_property_period_type');
    t.dropIndex([], 'idx_payments_tenant_period');
    t.dropIndex([], 'idx_payments_contract_year');
  });
  await knex.schema.alterTable('rent_charges', (t) => {
    t.dropIndex([], 'idx_rent_charges_property_period');
    t.dropIndex([], 'idx_rent_charges_contract_year');
    t.dropIndex([], 'idx_rent_charges_room_period');
  });
};
