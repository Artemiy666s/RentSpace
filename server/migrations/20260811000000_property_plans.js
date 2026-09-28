/**
 * Restored migration stub — already applied in production/local DBs.
 * Creates property_plans + building_shapes if somehow missing.
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('property_plans'))) {
    await knex.schema.createTable('property_plans', (t) => {
      t.bigIncrements('id').primary();
      t.bigInteger('property_id').unsigned().notNullable();
      t.string('image_path', 512).nullable();
      t.string('original_file_name', 255).nullable();
      t.string('image_mime', 64).nullable();
      t.specificType('image_blob', 'LONGBLOB').nullable();
      t.integer('width').unsigned().nullable();
      t.integer('height').unsigned().nullable();
      t.integer('version').unsigned().notNullable().defaultTo(1);
      t.boolean('is_active').notNullable().defaultTo(true);
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }
  if (!(await knex.schema.hasTable('building_shapes'))) {
    await knex.schema.createTable('building_shapes', (t) => {
      t.bigIncrements('id').primary();
      t.bigInteger('building_id').unsigned().notNullable();
      t.bigInteger('property_plan_id').unsigned().notNullable();
      t.enum('shape_type', ['polygon', 'rect']).notNullable().defaultTo('polygon');
      t.json('points_json').notNullable();
      t.string('fill_color', 32).nullable();
      t.string('stroke_color', 32).nullable();
      t.integer('z_index').notNullable().defaultTo(1);
      t.boolean('is_active').notNullable().defaultTo(true);
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function down() {
  // no-op: data-preserving
};
