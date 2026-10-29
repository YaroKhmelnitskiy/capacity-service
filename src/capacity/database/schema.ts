import { Generated, Migration } from 'kysely';
import { ReservationStatus } from '../types';
import * as capacity from './migrations/0001_capacity';

export interface ProgramsTable {
  programId: string;
  currency: string;
  creditLimit: number;
  reserved: Generated<number>;
  version: number;
  updatedAt: Generated<Date>;
}

export interface ReservationsTable {
  programId: string;
  invoiceId: string;
  amount: number;
  currency: string;
  programAmount: number;
  fxRate: string | null;
  status: ReservationStatus;
  reservedAt: Date;
  releasedAt: Date | null;
  updatedAt: Date;
}

export interface Database {
  programs: ProgramsTable;
  reservations: ReservationsTable;
}

export const CAPACITY_MIGRATIONS: Record<string, Migration> = {
  '0001_capacity': capacity,
};
