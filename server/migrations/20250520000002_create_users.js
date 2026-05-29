exports.up = async function (knex) {
  await knex.schema.createTable('users', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('organization_id').unsigned().nullable()
      .references('id').inTable('organizations').onDelete('SET NULL');
    t.string('name', 255).notNullable();
    t.string('email', 255).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.enum('role', [
      'super_admin',
      'org_admin',
      'owner',
      'director',
      'manager',
      'accountant',
      'viewer',
    ]).notNullable().defaultTo('viewer');
    t.enum('status', ['active', 'blocked', 'archived']).notNullable().defaultTo('active');
    t.timestamp('last_login_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('users');
};
