import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('068 preserves financial history and isolates password account throttles', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE TABLE shops (id text PRIMARY KEY);
      CREATE TABLE customers (id text PRIMARY KEY, shop_id text REFERENCES shops ON DELETE CASCADE);
      CREATE TABLE settlements (id text PRIMARY KEY, payment_status text, customer_id text REFERENCES customers ON DELETE CASCADE);
      CREATE TABLE payments (id text PRIMARY KEY, settlement_id text REFERENCES settlements ON DELETE CASCADE);
      CREATE TABLE stored_value_transactions (id text PRIMARY KEY, customer_id text REFERENCES customers ON DELETE CASCADE);
      CREATE TABLE reviews (id text PRIMARY KEY);
      INSERT INTO shops VALUES ('shop1');
      INSERT INTO customers VALUES ('customer1', 'shop1');
      INSERT INTO settlements VALUES
        ('completed', 'completed', 'customer1'), ('paid', 'paid', 'customer1'), ('draft', 'pending', 'customer1');
      INSERT INTO payments VALUES ('payment1', 'paid');
      INSERT INTO stored_value_transactions VALUES ('wallet1', 'customer1');
      INSERT INTO reviews VALUES ('existing');
      CREATE TABLE customer_auth_limits (
        ip_hash text PRIMARY KEY, failed_attempts integer NOT NULL DEFAULT 0,
        locked_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const readMigration = (name: string) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
    await db.exec(await readMigration('043_customer_auth_failure_limits.sql'));
    const migration = await readMigration('068_protect_customer_records.sql');
    await db.exec(migration);
    await db.exec(migration);
    for (const statement of [
      "DELETE FROM shops WHERE id = 'shop1'",
      "DELETE FROM customers WHERE id = 'customer1'",
      "DELETE FROM settlements WHERE id = 'completed'",
      "DELETE FROM settlements WHERE id = 'paid'",
      "DELETE FROM payments WHERE id = 'payment1'",
      "DELETE FROM stored_value_transactions WHERE id = 'wallet1'",
      'TRUNCATE shops CASCADE',
    ]) {
      await assert.rejects(db.exec(statement), /BUSINESS_RECORD_DELETE_BLOCKED/);
    }
    assert.equal((await db.query("DELETE FROM settlements WHERE id='draft' RETURNING id")).rows.length, 1);
    assert.deepEqual((await db.query('SELECT id, moderation_pending FROM reviews')).rows, [{ id: 'existing', moderation_pending: false }]);

    const account = 'a'.repeat(64);
    const begin = (key: string) => db.query<{ allowed: boolean; attempt_id: string; reason: string }>(
      'SELECT * FROM begin_customer_password_account_attempt($1)', [key],
    );
    for (let attempt = 0; attempt < 5; attempt++) {
      const { rows: [reservation] } = await begin(account);
      assert.equal(reservation.allowed, true);
      await db.query("SELECT finish_customer_auth_attempt_v2($1, $2, 'failure')", [account, reservation.attempt_id]);
    }
    assert.equal((await begin(account)).rows[0].reason, 'temporary_lock');
    assert.equal((await begin('b'.repeat(64))).rows[0].allowed, true);
    const { rows } = await db.query(`SELECT
      has_function_privilege('anon', 'public.begin_customer_password_account_attempt(text)', 'EXECUTE') AS anonymous,
      has_function_privilege('service_role', 'public.begin_customer_password_account_attempt(text)', 'EXECUTE') AS backend`);
    assert.deepEqual(rows, [{ anonymous: false, backend: true }]);
  } finally {
    await db.close();
  }
});
