/**
 * Optional labels for expense categories per property (production Expenses UI rename).
 */
exports.up = async function up(knex) {
  const has = await knex.schema.hasTable('expense_category_labels');
  if (has) return;
  await knex.schema.createTable('expense_category_labels', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('organization_id').unsigned().notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    t.bigInteger('property_id').unsigned().notNullable()
      .references('id').inTable('properties').onDelete('CASCADE');
    t.string('category_code', 64).notNullable();
    t.string('label', 255).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.unique(['property_id', 'category_code'], 'expense_cat_labels_prop_code_uq');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('expense_category_labels');
};
