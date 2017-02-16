import assert from 'assert';
import pgp from 'pg-promise';

let postgresClient;
let usageCount = 0;

function enc(s) {
  return encodeURIComponent(s);
}

export default class PgClient {
  constructor(context, opts) {
    if (!postgresClient) {
      postgresClient = pgp();
    }

    assert(opts, 'configured-postgres-client must be passed arguments');
    assert(opts.username, 'configured-postgres-client missing username setting');
    assert(opts.password, 'configured-postgres-client missing password setting');
    assert(opts.hostname, 'configured-postgres-client missing hostname setting');
    assert(opts.database, 'configured-postgres-client missing database setting');

    const hostname = opts.port ? `${opts.hostname}:${opts.port}` : opts.hostname;
    const url = `postgres://${enc(opts.username)}:${enc(opts.password)}@${hostname}/${opts.database}`;
    if (context && context.logger && context.logger.info) {
      context.logger.info('Initializing postgres client', {
        user: opts.username,
        host: hostname,
        db: opts.database,
      });
    }
    this.pgClient = postgresClient(url);
    if (opts.interface) {
      this.interface = opts.interface.default || opts.interface;
    }
    this.options = Object.assign({}, opts);
    delete this.options.password;
  }

  start() {
    assert(!this.db, 'start called multiple times on configured-postgres-client instance');
    if (this.interface) {
      const ClassConstructor = this.interface;
      this.db = new (ClassConstructor)(this.pgClient, this.options);
    } else {
      this.db = this.pgClient;
    }
    usageCount += 1;
    return this.db;
  }

  stop() {
    assert(this.db, 'stop called multiple times on configured-postgres-client instance');
    delete this.db;
    usageCount -= 1;
    if (usageCount <= 0) {
      if (postgresClient) {
        postgresClient.end();
        postgresClient = null;
      }
      usageCount = 0;
    }
  }
}
