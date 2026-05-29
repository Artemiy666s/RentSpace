exports.up = async function up(knex) {
  await knex.schema.alterTable('floor_plans', (t) => {
    t.string('image_mime', 64).nullable();
    t.specificType('image_blob', 'LONGBLOB').nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('floor_plans', (t) => {
    t.dropColumn('image_blob');
    t.dropColumn('image_mime');
  });
};

