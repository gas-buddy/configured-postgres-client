import PgClient from '../src/index';

interface TestConfig {
  name: string;
  hostname: string;
  database: string;
  username: string;
  password: string;
}

interface TestContext {
  logger: typeof console;
}

interface AdvisoryLockOptions {
  retryCount?: number;
}

describe('Advisory Locking', () => {
  let pg: PgClient;
  let db: any;

  const context: TestContext = { logger: console };
  const config: TestConfig = {
    name: 'test-db',
    hostname: process.env.PGHOST || 'localhost',
    database: process.env.PGDATABASE || process.env.PGUSER || 'postgres',
    username: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
  };

  beforeEach(async () => {
    pg = new PgClient(context, config);
    db = await pg.start(context);
  });

  afterEach(async () => {
    if (pg) {
      await pg.stop();
    }
  });

  test('should handle advisory locks correctly', async () => {
    let doneWithFirst = false;

    const firstLockPromise = db.queryWithContext(context, 'first-lock')
      .withAdvisoryLock('test key', async () => {
        expect(true).toBe(true); // Should acquire first lock
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 1500);
        });
        doneWithFirst = true;
        return true;
      });

    let secondLockPromise: Promise<any>;
    let thirdLockPromise: Promise<any>;

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        // Should have tried second lock acquire before first was done
        expect(doneWithFirst).toBe(false);

        secondLockPromise = db.queryWithContext(context, 'second-lock')
          .withAdvisoryLock('test key', async () => {
            throw new Error('Should not have acquired second lock');
          }, { immediate: true })
          .catch((e: Error) => e);

        thirdLockPromise = db.queryWithContext(context, 'third-lock')
          .tryAdvisoryLock('test key', async (options: AdvisoryLockOptions = {}) => {
            expect(true).toBe(true); // Should have acquired third lock
            return options.retryCount;
          }, [2000]);

        resolve();
      }, 50);
    });

    const [first, second, third] = await Promise.all([
      firstLockPromise,
      secondLockPromise!,
      thirdLockPromise!,
    ]);

    expect(first).toBe(true); // Should complete the first lock function
    expect((second as any)?.code).toBe('AdvisoryLockBusy'); // Should get an error for the second lock
    expect(third).toBe(1); // Third function should retry once
  });
});
