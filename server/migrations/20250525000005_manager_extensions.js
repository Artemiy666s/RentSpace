/**
 * Расширения для личного кабинета заведующей:
 * переговоры, история статусов, закрытие месяца, ready_for_rent.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('rooms', (t) => {
    t.text('comment').nullable();
  });

  const client = knex.client.config.client;
  if (client === 'mysql' || client === 'mysql2') {
    await knex.raw(`
      ALTER TABLE rooms MODIFY COLUMN status ENUM(
        'free','occupied','negotiation','reserved','debt','repair',
        'technical','not_available','ready_for_rent'
      ) NOT NULL DEFAULT 'free'
    `);
  }

  await knex.schema.createTable('room_negotiations', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('room_id').unsigned().notNullable()
      .references('id').inTable('rooms').onDelete('CASCADE');
    t.bigInteger('organization_id').unsigned().notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    t.string('tenant_name', 512).notNullable();
    t.string('contact_person', 255).nullable();
    t.string('phone', 64).nullable();
    t.date('planned_start_date').nullable();
    t.decimal('expected_rate_without_vat', 12, 2).nullable();
    t.enum('status', [
      'initial_interest',
      'viewed',
      'rate_negotiation',
      'awaiting_documents',
      'preparing_contract',
      'declined',
      'converted',
    ]).notNullable().defaultTo('initial_interest');
    t.date('next_contact_date').nullable();
    t.string('next_step', 255).nullable();
    t.text('comment').nullable();
    t.bigInteger('created_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('room_status_history', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('room_id').unsigned().notNullable()
      .references('id').inTable('rooms').onDelete('CASCADE');
    t.string('old_status', 32).nullable();
    t.string('new_status', 32).notNullable();
    t.string('reason', 128).nullable();
    t.text('comment').nullable();
    t.bigInteger('changed_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('month_closings', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('organization_id').unsigned().notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    t.bigInteger('property_id').unsigned().notNullable()
      .references('id').inTable('properties').onDelete('CASCADE');
    t.integer('period_year').notNullable();
    t.integer('period_month').notNullable();
    t.enum('status', ['draft', 'checked', 'closed', 'reopened']).notNullable().defaultTo('draft');
    t.json('checklist_json').nullable();
    t.json('errors_json').nullable();
    t.bigInteger('closed_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('closed_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.unique(['property_id', 'period_year', 'period_month'], 'month_close_prop_period_uq');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('month_closings');
  await knex.schema.dropTableIfExists('room_status_history');
  await knex.schema.dropTableIfExists('room_negotiations');
  await knex.schema.alterTable('rooms', (t) => {
    t.dropColumn('comment');
  });
};
