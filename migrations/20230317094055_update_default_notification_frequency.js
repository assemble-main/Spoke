/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.raw(`
      alter table public.user
      alter column notification_frequency
      set default 'DAILY';

      update public.user
      set notification_frequency = 'DAILY'
      where notification_frequency = 'ALL';
    `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.raw(`
      alter table public.user
      alter column notification_frequency
      set default 'ALL';
    `);
};
