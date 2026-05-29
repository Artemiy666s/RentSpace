exports.up = async function (knex) {
  await knex.schema.createTable('properties', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('organization_id').unsigned().notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    t.string('name', 255).notNullable();
    t.string('city', 128).nullable();
    t.string('address', 512).nullable();
    t.text('description').nullable();
    t.enum('status', ['active', 'archived']).notNullable().defaultTo('active');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('properties');
};
