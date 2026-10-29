import { Inject, Injectable } from '@nestjs/common';
import { Kysely, Selectable, sql, Transaction } from 'kysely';
import { DATABASE } from '../../infrastructure/database/database';
import {
  CurrencyMismatchError,
  InsufficientCapacityError,
  ProgramNotFoundError,
  ReservationConflictError,
  ReservationNotFoundError,
} from '../errors';
import {
  Capacity,
  LimitUpdate,
  NewReservation,
  Reconciliation,
  ReleaseResult,
  Reservation,
  ReservationStatus,
  ReserveResult,
} from '../types';
import { Database, ProgramsTable } from './schema';

const RESERVATION_COLUMNS = [
  'programId',
  'invoiceId',
  'amount',
  'currency',
  'programAmount',
  'fxRate',
  'status',
  'reservedAt',
  'releasedAt',
] as const;
const UPSERT_CHUNK_SIZE = 1_000;

type Program = Selectable<ProgramsTable>;

@Injectable()
export class CapacityRepository {
  public constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  public async findCapacity(programId: string): Promise<Capacity | undefined> {
    const program = await this.db
      .selectFrom('programs')
      .selectAll()
      .where('programId', '=', programId)
      .executeTakeFirst();
    return program && toCapacity(program);
  }

  public async findReservation(programId: string, invoiceId: string): Promise<Reservation | undefined> {
    return selectReservation(this.db, programId, invoiceId);
  }

  public async reserve(request: NewReservation): Promise<ReserveResult> {
    return this.db.transaction().execute(async (trx) => {
      const program = await lockProgram(trx, request.programId);
      if (program === undefined) {
        throw new ProgramNotFoundError(request.programId);
      }

      const existing = await selectReservation(trx, request.programId, request.invoiceId);
      if (existing !== undefined) {
        if (existing.amount !== request.amount || existing.currency !== request.currency) {
          throw new ReservationConflictError(request.programId, request.invoiceId);
        }
        return { reservation: existing, created: false };
      }

      const { available } = toCapacity(program);
      if (request.programAmount > available) {
        throw new InsufficientCapacityError(request.programId, request.programAmount, available);
      }
      await trx
        .updateTable('programs')
        .set((eb) => ({ reserved: eb('reserved', '+', request.programAmount), updatedAt: sql`now()` }))
        .where('programId', '=', request.programId)
        .execute();
      const reservation = await trx
        .insertInto('reservations')
        .values({
          ...request,
          status: ReservationStatus.RESERVED,
          reservedAt: sql`now()`,
          releasedAt: null,
          updatedAt: sql`now()`,
        })
        .returning(RESERVATION_COLUMNS)
        .executeTakeFirstOrThrow();
      return { reservation, created: true };
    });
  }

  public async release(programId: string, invoiceId: string): Promise<ReleaseResult> {
    return this.db.transaction().execute(async (trx) => {
      if ((await lockProgram(trx, programId)) === undefined) {
        throw new ProgramNotFoundError(programId);
      }
      const existing = await selectReservation(trx, programId, invoiceId);
      if (existing === undefined) {
        throw new ReservationNotFoundError(programId, invoiceId);
      }
      if (existing.status === ReservationStatus.RELEASED) {
        return { reservation: existing, released: false };
      }

      const reservation = await trx
        .updateTable('reservations')
        .set({ status: ReservationStatus.RELEASED, releasedAt: sql`now()`, updatedAt: sql`now()` })
        .where('programId', '=', programId)
        .where('invoiceId', '=', invoiceId)
        .returning(RESERVATION_COLUMNS)
        .executeTakeFirstOrThrow();
      await trx
        .updateTable('programs')
        .set((eb) => ({ reserved: eb('reserved', '-', existing.programAmount), updatedAt: sql`now()` }))
        .where('programId', '=', programId)
        .execute();
      return { reservation, released: true };
    });
  }

  public async applyLimitUpdate(update: LimitUpdate): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      if (!(await lockProgramIfNewer(trx, update))) {
        return false;
      }
      await updateLimit(trx, update);
      return true;
    });
  }

  public async applyReconciliation(snapshot: Reconciliation): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      if (!(await lockProgramIfNewer(trx, snapshot))) {
        return false;
      }
      await updateLimit(trx, snapshot);

      for (let start = 0; start < snapshot.reservations.length; start += UPSERT_CHUNK_SIZE) {
        const chunk = snapshot.reservations.slice(start, start + UPSERT_CHUNK_SIZE);
        await trx
          .insertInto('reservations')
          .values(
            chunk.map((reservation) => ({
              ...reservation,
              programId: snapshot.programId,
              fxRate: null,
              status: ReservationStatus.RESERVED,
              reservedAt: snapshot.asOf,
              releasedAt: null,
              updatedAt: snapshot.asOf,
            })),
          )
          .onConflict((conflict) =>
            conflict
              .columns(['programId', 'invoiceId'])
              .doUpdateSet((eb) => ({
                amount: eb.ref('excluded.amount'),
                currency: eb.ref('excluded.currency'),
                programAmount: eb.ref('excluded.programAmount'),
                status: ReservationStatus.RESERVED,
                releasedAt: null,
                updatedAt: eb.ref('excluded.updatedAt'),
              }))
              .where('reservations.updatedAt', '<=', snapshot.asOf),
          )
          .execute();
      }

      const listedInvoiceIds = snapshot.reservations.map((reservation) => reservation.invoiceId);
      await trx
        .updateTable('reservations')
        .set({ status: ReservationStatus.RELEASED, releasedAt: snapshot.asOf, updatedAt: snapshot.asOf })
        .where('programId', '=', snapshot.programId)
        .where('status', '=', ReservationStatus.RESERVED)
        .where('updatedAt', '<=', snapshot.asOf)
        .where(sql<boolean>`invoice_id <> ALL(${listedInvoiceIds}::varchar[])`)
        .execute();

      await trx
        .updateTable('programs')
        .set((eb) => ({
          reserved: eb
            .selectFrom('reservations')
            .select(sql<number>`coalesce(sum(program_amount), 0)::bigint`.as('total'))
            .where('reservations.programId', '=', snapshot.programId)
            .where('reservations.status', '=', ReservationStatus.RESERVED),
        }))
        .where('programId', '=', snapshot.programId)
        .execute();
      return true;
    });
  }
}

function toCapacity(program: Program): Capacity {
  const { programId, currency, creditLimit, reserved } = program;
  return { programId, currency, limit: creditLimit, reserved, available: creditLimit - reserved };
}

async function selectReservation(
  db: Kysely<Database>,
  programId: string,
  invoiceId: string,
): Promise<Reservation | undefined> {
  return db
    .selectFrom('reservations')
    .select(RESERVATION_COLUMNS)
    .where('programId', '=', programId)
    .where('invoiceId', '=', invoiceId)
    .executeTakeFirst();
}

async function lockProgram(trx: Transaction<Database>, programId: string): Promise<Program | undefined> {
  return trx.selectFrom('programs').selectAll().where('programId', '=', programId).forUpdate().executeTakeFirst();
}

async function lockProgramIfNewer(
  trx: Transaction<Database>,
  update: Pick<LimitUpdate, 'programId' | 'currency' | 'version'>,
): Promise<boolean> {
  await trx
    .insertInto('programs')
    .values({ programId: update.programId, currency: update.currency, creditLimit: 0, version: 0 })
    .onConflict((conflict) => conflict.column('programId').doNothing())
    .execute();
  const program = await lockProgram(trx, update.programId);
  if (program === undefined || update.version <= program.version) {
    return false;
  }
  if (program.currency !== update.currency) {
    throw new CurrencyMismatchError(update.programId, program.currency, update.currency);
  }
  return true;
}

async function updateLimit(
  trx: Transaction<Database>,
  update: Pick<LimitUpdate, 'programId' | 'limit' | 'version'>,
): Promise<void> {
  await trx
    .updateTable('programs')
    .set({ creditLimit: update.limit, version: update.version, updatedAt: sql`now()` })
    .where('programId', '=', update.programId)
    .execute();
}
