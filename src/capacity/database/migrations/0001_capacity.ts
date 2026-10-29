import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('programs')
    .addColumn('program_id', 'varchar(255)', (column) => column.primaryKey())
    .addColumn('currency', 'char(3)', (column) => column.notNull())
    .addColumn('credit_limit', 'bigint', (column) => column.notNull().check(sql`credit_limit >= 0`))
    .addColumn('reserved', 'bigint', (column) => column.notNull().defaultTo(0).check(sql`reserved >= 0`))
    .addColumn('version', 'bigint', (column) => column.notNull().check(sql`version >= 0`))
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('reservations')
    .addColumn('program_id', 'varchar(255)', (column) => column.notNull().references('programs.program_id'))
    .addColumn('invoice_id', 'varchar(255)', (column) => column.notNull())
    .addColumn('amount', 'bigint', (column) => column.notNull().check(sql`amount > 0`))
    .addColumn('currency', 'char(3)', (column) => column.notNull())
    .addColumn('program_amount', 'bigint', (column) => column.notNull().check(sql`program_amount > 0`))
    .addColumn('fx_rate', 'numeric(30, 10)')
    .addColumn('status', 'varchar(16)', (column) => column.notNull().check(sql`status IN ('RESERVED', 'RELEASED')`))
    .addColumn('reserved_at', 'timestamptz', (column) => column.notNull())
    .addColumn('released_at', 'timestamptz')
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull())
    .addPrimaryKeyConstraint('reservations_pkey', ['program_id', 'invoice_id'])
    .addCheckConstraint('reservations_released_at_check', sql`(status = 'RELEASED') = (released_at IS NOT NULL)`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('reservations').execute();
  await db.schema.dropTable('programs').execute();
}
