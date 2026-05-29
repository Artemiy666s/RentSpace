exports.up = async function (knex) {
  await knex.schema.createTable('organizations', (t) => {
    t.bigIncrements('id').primary();
    t.string('name', 255).notNullable();
    t.string('legal_name', 255).nullable();
    t.string('unp', 32).nullable();
    t.string('phone', 64).nullable();
    t.string('email', 255).nullable();
    t.enum('status', ['active', 'blocked', 'archived']).notNullable().defaultTo('active');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('organizations');
};
