/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.schema
    .alterTable("canned_response", (table) => {
      table.integer("display_order").nullable();

      table.unique(["campaign_id", "display_order"]);
    })
    .then(() => {
      return knex.raw(`
        DO $$
        DECLARE campaign_ids integer;
        BEGIN
          FOR campaign_ids IN select distinct campaign_id from canned_response
        LOOP
          update canned_response
          set display_order = c2.display_order
          from (SELECT id, row_number() over () as display_order
          from canned_response
          where campaign_id = campaign_ids 
          order by text asc) c2
          where c2.id = canned_response.id;
          END LOOP;
        END$$;
      `);
    })
    .then(() => {
      return knex.schema.alterTable("canned_response", (table) => {
        table.integer("display_order").notNullable().defaultTo(1).alter();
      });
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.alterTable("canned_response", (table) => {
    table.dropUnique(["campaign_id", "display_order"]);

    table.dropColumn("display_order");
  });
};
