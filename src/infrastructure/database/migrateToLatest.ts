import { Kysely, Migration, MigrationResultSet, Migrator } from 'kysely';

export async function migrateToLatest(db: Kysely<unknown>, migrations: Record<string, Migration>): Promise<string[]> {
  const migrator = new Migrator({ db, provider: { getMigrations: async () => migrations } });
  const { error, results }: MigrationResultSet = await migrator.migrateToLatest();
  if (error !== undefined) {
    throw error;
  }
  return (results ?? []).map((result) => result.migrationName);
}
