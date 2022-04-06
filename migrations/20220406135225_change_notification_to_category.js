exports.up = function up(knex) {
  return knex.schema.alterTable("notification", (table) => {
    table.dropColumn("subject");
    table.dropColumn("content");
    table.dropColumn("reply_to");

    table.integer("organization_id");
    table.integer("campaign_id");
    table.string("category").notNullable().default("");

    table.foreign("organization_id").references("organization.id");
    table.foreign("campaign_id").references("campaign.id");

    table.index(["user_id", "organization_id"]);
    table.index("category");
  });
};

exports.down = function down(knex) {
  return knex.schema.alterTable("notification", (table) => {
    table.dropIndex(["user_id", "organization_id"]);

    table.dropColumn("organization_id");
    table.dropColumn("campaign_id");
    table.dropColumn("category");

    table.text("subject").notNullable().default("");
    table.text("content").notNullable().default("");
    table.string("reply_to");
  });
};
