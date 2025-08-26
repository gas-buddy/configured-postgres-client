import PgClient from '../src/index';

interface TestConfig {
  name: string;
  hostname: string;
  database: string;
  username: string;
  password: string;
}

describe('Database Connection', () => {
  let pg: PgClient;
  let db: any;

  const config: TestConfig = {
    name: 'test-db',
    hostname: process.env.PGHOST || 'localhost',
    database: process.env.PGDATABASE || process.env.PGUSER || 'postgres',
    username: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
  };

  beforeEach(async () => {
    pg = new PgClient({ logger: console }, config);
    db = await pg.start({});
  });

  afterEach(async () => {
    if (pg) {
      await pg.stop();
    }
  });

  test('should have a connect method', () => {
    expect(db.connect).toBeDefined();
    expect(typeof db.connect).toBe('function');
  });

  test('should execute simple queries', async () => {
    const result = await db.query({}, 'test').one('SELECT 1 as one');
    expect(result.one).toBe(1);
  });
});
