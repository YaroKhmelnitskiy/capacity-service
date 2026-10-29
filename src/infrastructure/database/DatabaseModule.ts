import { DynamicModule, Inject, Injectable, Module, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Kysely, Migration } from 'kysely';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { createDatabase, DATABASE } from './database';
import { migrateToLatest } from './migrateToLatest';

const MIGRATIONS = Symbol('MIGRATIONS');

@Injectable()
class DatabaseLifecycle implements OnModuleInit, OnApplicationShutdown {
  public constructor(
    @Inject(DATABASE) private readonly db: Kysely<unknown>,
    @Inject(MIGRATIONS) private readonly migrations: Record<string, Migration>,
    @InjectPinoLogger(DatabaseLifecycle.name) private readonly logger: PinoLogger,
  ) {}

  public async onModuleInit(): Promise<void> {
    const applied = await migrateToLatest(this.db, this.migrations);
    this.logger.info({ applied }, 'Database migrations are up to date');
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}

@Module({})
export class DatabaseModule {
  public static forRoot(databaseUrl: string, migrations: Record<string, Migration>): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: [
        {
          provide: DATABASE,
          inject: [PinoLogger],
          useFactory: (logger: PinoLogger): Kysely<unknown> => {
            const databaseLogger = logger.logger.child({ context: 'Database' });
            return createDatabase(databaseUrl, (error) =>
              databaseLogger.warn({ err: error }, 'Database connection failed and was dropped from the pool'),
            );
          },
        },
        { provide: MIGRATIONS, useValue: migrations },
        DatabaseLifecycle,
      ],
      exports: [DATABASE],
    };
  }
}
