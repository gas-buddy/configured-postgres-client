import tap from 'tap';
import PgClient from '../src/index';

const context = { logger: console };

tap.test('test_notifications', async (t) => {
  const config = {
    name: 'test-db',
    hostname: process.env.PGHOST,
    database: process.env.PGDATABASE || process.env.PGUSER || 'postgres',
    username: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
  };
  const pg = new PgClient(context, config);
  const db = await pg.start();

  let promiseCompleter;
  const payloads = [];
  const promise = new Promise((accept) => { promiseCompleter = accept; });

  await db.queryWithContext(context, 'notificationListener')
    .createNotificationListener('test_notifications', (payload) => {
      payloads.push(payload);
      if (payloads.length === 2) {
        promiseCompleter();
      }
    });

  await db.queryWithContext(context, 'notifier').notifyListeners('test_notifications', { test: 123 });
  await db.queryWithContext(context, 'notifier').notifyListeners('test_notifications', { test: 456 });
  await promise;

  t.strictEquals(payloads[0].test, 123, 'Should receive first notification payload');
  t.strictEquals(payloads[1].test, 456, 'Should receive second notification payload');

  await pg.stop();
  t.end();
});
