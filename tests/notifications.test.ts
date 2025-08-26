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

interface TestPayload {
  test: number;
}

describe('PostgreSQL Notifications', () => {
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

  test('should handle LISTEN/NOTIFY correctly', async () => {
    let promiseResolver: (() => void) | undefined;
    const payloads: TestPayload[] = [];
    const promise = new Promise<void>((resolve) => {
      promiseResolver = resolve;
    });

    await db.queryWithContext(context, 'notificationListener')
      .createNotificationListener('test_notifications', (payload: TestPayload) => {
        payloads.push(payload);
        if (payloads.length === 2) {
          promiseResolver!();
        }
      });

    await db.queryWithContext(context, 'notifier')
      .notifyListeners('test_notifications', { test: 123 });
    await db.queryWithContext(context, 'notifier')
      .notifyListeners('test_notifications', { test: 456 });

    await promise;

    expect(payloads[0].test).toBe(123); // Should receive first notification payload
    expect(payloads[1].test).toBe(456); // Should receive second notification payload
  });
});
