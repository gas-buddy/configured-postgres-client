import tap from 'tap';
import winston from 'winston';
import PgClient from '../src/index';

tap.test('test_connection', async (t) => {
  const config = {
    name: 'test-db',
    hostname: process.env.PGHOST,
    database: process.env.PGDATABASE || process.env.PGUSER || 'postgres',
    username: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
  };
  const pg = new PgClient(winston, config);
  const db = await pg.start();
  t.ok(db.connect, 'Should have a connect method');
  const c = await db.one('SELECT 1 as one');
  t.strictEquals(c.one, 1, 'Simple query should work.');
  await pg.stop();
  t.end();
});

tap.test('test query files', async(t) => {
  const config = {
    name: 'test-db',
    hostname: process.env.PGHOST,
    database: process.env.PGDATABASE || process.env.PGUSER || 'postgres',
    username: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    sqlFilesDirectory: '/data/tests/sqlFiles'
  };
  const pg = new PgClient(winston, config);
  const db = await pg.start();
  t.ok(db.sqlFiles.testGroup1.testFile1, 'Contains a test sql file');
  const c = await db.one(db.sqlFiles.testGroup1.testFile1);
  t.strictEquals(c.one, 1, 'Test query file should work.');
  await pg.stop();
  t.end();

});
