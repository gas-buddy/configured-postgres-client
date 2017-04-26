import assert from 'assert';
import pgp from 'pg-promise';
import { EventEmitter } from 'events';
import TrackingClient from './trackingClient';

let postgresClient;
let usageCount = 0;

function enc(s) {
  return encodeURIComponent(s);
}

/**
 * The proxied pgclient interface will associate logging with the request that
 * started it (for better distributed system tracing for example), as well
 * as provide enough context to do proper metrics (eg Prometheus). The impact
 * is that you should call "queryWithContext" first before issuing one of the
 * supported commands: one, oneOrNone, many, manyOrNone, none, result
 */
function createProxiedInterface(instance, context) {
  const defaultQuery = new TrackingClient(instance, context, 'default');
  const pgClient = {
    query(...args) {
      return instance.query(...args);
    },
    queryWithContext(...args) {
      return instance.queryWithContext(...args);
    },
    connect(...args) {
      return instance.baseClient.connect(...args);
    },
  };
  const methods = ['any', 'one', 'oneOrNone', 'many', 'manyOrNone', 'none', 'result', 'tx'];
  for (const m of methods) {
    pgClient[m] = function defaultQueryFn(...args) {
      if (context && context.logger && context.logger.warn) {
        context.logger.warn(`pg method '${m}' called without query name. Use client.query(context, name).${m}(...)`, {
          stack: new Error().stack,
        });
      }
      if (!defaultQuery[m]) {
        throw new Error(`Invalid query function: ${m}. Supported: ${Object.getOwnPropertyNames(defaultQuery)}`);
      }
      return defaultQuery[m](...args);
    };
  }
  return pgClient;
}

export default class PgClient extends EventEmitter {
  constructor(context, opts) {
    super();
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

    this.baseClient = postgresClient(url);
    this.pgClient = createProxiedInterface(this, context);
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

  /**
   * Create a query proxy that has context and an operation name
   * (useful in metrics tracking, for example)
   */
  queryWithContext(queryContext, operationName) {
    return new TrackingClient(this, queryContext, operationName);
  }

  /**
   * Use queryWithContext instead
   * @deprecated
   */
  query(queryContext, operationName) {
    return this.queryWithContext(queryContext, operationName);
  }

  /**
   * Expose the pg-promise client for helpers
   */
  static pgp() {
    return postgresClient;
  }
}
