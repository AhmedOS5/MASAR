// E-mail verification by 6-digit code (replaces the signed link): the keyed hash of the CURRENT code, its expiry, the
// number of wrong attempts made against it, and when it was sent. One active code per user — issuing a new one overwrites
// (= invalidates) the previous one and resets the attempts.
export async function up(knex) {
  await knex.schema.alterTable("users", (t) => {
    t.string("email_otp_hash", 64);
    t.timestamp("email_otp_expires_at");
    t.integer("email_otp_attempts").notNullable().defaultTo(0);
    t.timestamp("email_otp_sent_at");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("users", (t) => {
    t.dropColumn("email_otp_hash");
    t.dropColumn("email_otp_expires_at");
    t.dropColumn("email_otp_attempts");
    t.dropColumn("email_otp_sent_at");
  });
}
