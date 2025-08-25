const tap = require('tap');
const PgClient = require('../build/index').default;

tap.test('test_connection', async (t) => {
  const config = {
    name: 'test-db',
    hostname: process.env.PGHOST || 'localhost',
    database: process.env.PGDATABASE || process.env.PGUSER || 'postgres',
    username: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
  };
  const pg = new PgClient({ logger: console }, config);
  const db = await pg.start({});
  t.ok(db.connect, 'Should have a connect method');
  const c = await db.query({}, 'test').one('SELECT 1 as one');
  t.strictEquals(c.one, 1, 'Simple query should work.');
  await pg.stop();
  t.end();
});