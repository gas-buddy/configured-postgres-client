import assert from 'assert';
import pgp, { IMain, IDatabase } from 'pg-promise';
import { EventEmitter } from 'events';
import TrackingClient from './trackingClient';
import type { QueryContext } from './types';

type Context = QueryContext;

interface DatabaseOptions {
  username: string;
  password: string;
  hostname: string;
  database: string;
  port?: number;
  readonly?: {
    hostname?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
  };
  interface?: any;
  sqlFilesDirectory?: string;
  logQueries?: boolean;
}

interface ProxiedPgClient {
  query(...args: any[]): any;
  queryWithContext(...args: any[]): any;
  connect(...args: any[]): any;
  any(...args: any[]): any;
  one(...args: any[]): any;
  oneOrNone(...args: any[]): any;
  many(...args: any[]): any;
  manyOrNone(...args: any[]): any;
  none(...args: any[]): any;
  result(...args: any[]): any;
  tx(...args: any[]): any;
  task(...args: any[]): any;
}

let postgresClient: IMain | null = null;
let usageCount = 0;

function enc(s: string): string {
  return encodeURIComponent(s);
}

/**
 * The proxied pgclient interface will associate logging with the request that
 * started it (for better distributed system tracing for example), as well
 * as provide enough context to do proper metrics (eg Prometheus). The impact
 * is that you should call "queryWithContext" first before issuing one of the
 * supported commands: one, oneOrNone, many, manyOrNone, none, result, tx, task
 */
function createProxiedInterface(instance: PgClient, context: Context): ProxiedPgClient {
  const defaultQuery = new TrackingClient(instance as any, context, 'default');
  const pgClient: any = {
    query(...args: any[]) {
      return (instance as any).query(...args);
    },
    queryWithContext(...args: any[]) {
      return (instance as any).queryWithContext(...args);
    },
    connect(...args: any[]) {
      return (instance.baseClient as any).connect(...args);
    },
  };

  const methods: (keyof ProxiedPgClient)[] = ['any', 'one', 'oneOrNone', 'many', 'manyOrNone', 'none', 'result', 'tx', 'task'];
  methods.forEach((m) => {
    (pgClient as any)[m] = function defaultQueryFn(...args: any[]) {
      if (context && context.logger && context.logger.warn) {
        context.logger.warn(`pg method '${m}' called without query name. Use client.query(context, name).${m}(...)`, {
          stack: new Error().stack,
        });
      }
      if (!(defaultQuery as any)[m]) {
        throw new Error(`Invalid query function: ${m}. Supported: ${Object.getOwnPropertyNames(defaultQuery)}`);
      }
      return (defaultQuery as any)[m].apply(defaultQuery, args);
    };
  });
  return pgClient;
}

function roUrl(opts: DatabaseOptions): string {
  // Allow config from readonly dictionary, fall back to regular opts
  const {
    hostname = opts.hostname,
    port = opts.port,
    username = opts.username,
    password = opts.password,
    database = opts.database,
  } = opts.readonly || {};
  const finalHost = port ? `${hostname}:${port}` : hostname;
  return `postgres://${enc(username)}:${enc(password)}@${finalHost}/${database}`;
}

export default class PgClient extends EventEmitter {
  public baseClient: IDatabase<any>;

  public readonlyBaseClient?: IDatabase<any>;

  public pgClient: ProxiedPgClient;

  public interface?: any;

  public sqlFiles?: any;

  public db?: any;

  public options: Omit<DatabaseOptions, 'password'>;

  constructor(context: Context, opts: DatabaseOptions) {
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

    this.baseClient = postgresClient!(url);
    if (opts.readonly) {
      this.readonlyBaseClient = postgresClient!(roUrl(opts));
    }
    this.pgClient = createProxiedInterface(this, context);
    if (opts.interface) {
      this.interface = opts.interface.default || opts.interface;
    }
    if (opts.sqlFilesDirectory) {
      if (context && context.logger && context.logger.info) {
        context.logger.info(`Creating SqlFiles for ${opts.sqlFilesDirectory}`);
      }
      this.sqlFiles = (pgp as any).utils.enumSql(
        `${opts.sqlFilesDirectory}`,
        { recursive: true },
        (file: string) => new (pgp as any).QueryFile(file),
      );
    }
    this.options = { ...opts };
    delete (this.options as any).password;
  }

  start(context: Context): any {
    assert(!this.db, 'start called multiple times on configured-postgres-client instance');
    if (this.interface) {
      const ClassConstructor = this.interface;
      this.db = new ClassConstructor(this.pgClient, this.options, context);
      if (typeof this.db.start === 'function') {
        return this.db.start(context);
      }
    } else {
      this.db = this.pgClient;
    }
    if (this.sqlFiles) {
      this.db.sqlFiles = this.sqlFiles;
    }
    usageCount += 1;
    return this.db;
  }

  async stop(...args: any[]): Promise<void> {
    assert(this.db, 'stop called multiple times on configured-postgres-client instance');
    this.emit('stop');
    if (typeof this.db.stop === 'function') {
      await this.db.stop(...args);
    }
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
  queryWithContext(queryContext: Context, operationName: string): TrackingClient {
    if (this.options.logQueries && queryContext && queryContext.gb
        && queryContext.gb.logger && queryContext.gb.logger.info) {
      queryContext.gb.logger.info('pgq', {
        operationName,
      });
    }
    return new TrackingClient(this as any, queryContext, operationName);
  }

  /**
   * Use queryWithContext instead
   * @deprecated
   */
  query(queryContext: Context, operationName: string): TrackingClient {
    return this.queryWithContext(queryContext, operationName);
  }

  /**
   * Expose the pg-promise client for helpers
   */
  static pgp(): IMain | null {
    return postgresClient;
  }
}
