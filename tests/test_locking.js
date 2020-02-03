import tap from 'tap';
import PgClient from '../src/index';

const context = { logger: console };

tap.test('test_locking', async (t) => {
  const config = {
    name: 'test-db',
    hostname: process.env.PGHOST,
    database: process.env.PGDATABASE || process.env.PGUSER || 'postgres',
    username: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
  };
  const pg = new PgClient(context, config);
  const db = await pg.start();

  let doneWithFirst;
  const firstLockPromise = db.queryWithContext(context, 'first-lock')
    .withAdvisoryLock('test key', async () => {
      t.ok(true, 'Should acquire first lock');
      await new Promise(accept => setTimeout(accept, 1500));
      doneWithFirst = true;
      t.ok(true, 'Should complete first lock usage');
      return true;
    });

  let secondLockPromise;
  let thirdLockPromise;
  await new Promise((accept) => {
    setTimeout(() => {
      t.notOk(doneWithFirst, 'Should have tried second lock acquire before first was done');
      secondLockPromise = db.queryWithContext(context, 'second-lock')
        .withAdvisoryLock('test key', async () => {
          t.fail('Should not have acquired second lock');
          return false;
        }, { immediate: true })
        .catch(e => e);
      thirdLockPromise = db.queryWithContext(context, 'third-lock')
        .tryAdvisoryLock('test key', async ({ retryCount } = {}) => {
          t.ok(true, 'Should have acquired third lock.');
          return retryCount;
        }, [2000]);
      accept();
    }, 50);
  });

  const [first, second, third] = await Promise.all([firstLockPromise, secondLockPromise, thirdLockPromise]);
  t.strictEquals(first, true, 'Should complete the first lock function');
  t.strictEquals(second?.code, 'AdvisoryLockBusy', 'Should get an error for the second lock');
  t.strictEquals(third, 1, 'Third function should retry once');

  await pg.stop();
  t.end();
});
