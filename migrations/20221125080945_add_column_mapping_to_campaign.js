/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.schema
    .createTable("campaign_contact_upload", (table) => {
      table.integer("campaign_id").primary();
      table.json("column_mapping").nullable();
      table.timestamp("created_at").notNull().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNull().defaultTo(knex.fn.now());

      table.unique("campaign_id");
      table.index("campaign_id");
      table.foreign("campaign_id").references("all_campaign.id");
    })
    .then(() =>
      knex.schema.raw(`
        create trigger _500_campaign_contact_upload_updated_at
        before update
        on public.campaign_contact_upload
        for each row
        execute procedure universal_updated_at();
      `)
    );
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema
    .raw(
      `
      drop trigger _500_campaign_contact_upload_updated_at on public.campaign_contact_upload;
    `
    )
    .then(() => knex.schema.dropTable("campaign_contact_upload"));
};
