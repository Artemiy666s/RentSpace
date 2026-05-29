exports.up = async function (knex) {
  await knex.schema.createTable('plan_fact_hidden_metrics', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('property_id').unsigned().notNullable()
      .references('id').inTable('properties').onDelete('CASCADE');
    t.integer('period_year').notNullable();
    t.string('metric_code', 64).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['property_id', 'period_year', 'metric_code'], 'pf_hidden_prop_year_metric_uq');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('plan_fact_hidden_metrics');
};
