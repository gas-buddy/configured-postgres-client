import { createHash } from 'crypto';
import type { IDatabase } from 'pg-promise';
import type { EventEmitter } from 'events';
import type { QueryContext } from './types';

interface CallInfo {
  client: any;
  context: QueryContext;
  operationName: string;
  method: string;
  args: any[];
  result?: any;
  error?: Error;
}

interface AdvisoryLockOptions {
  immediate?: boolean;
  retryCount?: number;
}

interface ConfiguredClient extends EventEmitter {
  baseClient: IDatabase<any>;
  readonlyBaseClient?: IDatabase<any>;
  emit(event: 'start', callInfo: CallInfo): boolean;
  emit(event: 'finish', callInfo: CallInfo): boolean;
  emit(event: 'error', callInfo: CallInfo): boolean;
  emit(event: 'stop'): boolean;
  once(event: 'stop', listener: () => void): this;
  listenerCount(event: string): number;
}

// Converts string to 64 bit number for use with postgres advisory lock
// functions
function strToKey(name: string): [number, number] {
  // Generate sha256 hash of name
  // and take 32 bit twice from hash
  const buf = createHash('sha256').update(name).digest();
  // Read the first 4 bytes and the next 4 bytes
  // The parameter here is the byte offset, not the sizeof(int32) offset
  return [buf.readInt32LE(0), buf.readInt32LE(4)];
}

export default class TrackingClient {
  private configuredClient: ConfiguredClient;

  private queryContext: QueryContext;

  private operationName: string;

  private useReadOnly: boolean = false;

  constructor(pg: ConfiguredClient, queryContext: QueryContext, operationName: string) {
    this.configuredClient = pg;
    this.queryContext = queryContext;
    this.operationName = operationName;
  }

  async run(method: string, args: any[]): Promise<any> {
    const callSite = new Error();
    Error.captureStackTrace(callSite, this.run);
    const callInfo: CallInfo = {
      client: this.configuredClient,
      context: this.queryContext,
      operationName: this.operationName,
      method,
      args,
    };
    this.configuredClient.emit('start', callInfo);
    try {
      let client = this.configuredClient.baseClient;
      if (this.useReadOnly && this.configuredClient.readonlyBaseClient) {
        client = this.configuredClient.readonlyBaseClient;
      }
      const rz = await (client as any)[method](...args);
      callInfo.result = rz;
      this.configuredClient.emit('finish', callInfo);
      return rz;
    } catch (error) {
      callInfo.error = error as Error;
      // Only emit this if someone is listening, because otherwise it
      // prevents the throw of the original error
      if (this.configuredClient.listenerCount('error')) {
        this.configuredClient.emit('error', callInfo);
      }
      callSite.message = (error as Error).message;
      Object.assign(callSite, error);
      throw callSite;
    }
  }

  async connect(...args: any[]): Promise<any> {
    return this.run('connect', args);
  }

  async none(...args: any[]): Promise<any> {
    return this.run('none', args);
  }

  async one(...args: any[]): Promise<any> {
    return this.run('one', args);
  }

  async oneOrNone(...args: any[]): Promise<any> {
    return this.run('oneOrNone', args);
  }

  async many(...args: any[]): Promise<any> {
    return this.run('many', args);
  }

  async manyOrNone(...args: any[]): Promise<any> {
    return this.run('manyOrNone', args);
  }

  async result(...args: any[]): Promise<any> {
    return this.run('result', args);
  }

  async any(...args: any[]): Promise<any> {
    return this.run('any', args);
  }

  async tx(...args: any[]): Promise<any> {
    return this.run('tx', args);
  }

  async task(...args: any[]): Promise<any> {
    return this.run('task', args);
  }

  /**
   * If a read-only replica is configured for this client, use it.
   * In order to allow parameterized control, you can pass false
   * as the argument and we will NOT use a read only replica even if available.
   * Any other value (undefined, for example) is the same as true.
   * @param ro If === false, do not use read only connection,
   *  else use the read only connection
   */
  readOnly(ro?: boolean): this {
    this.useReadOnly = ro !== false;
    return this;
  }

  /**
   * Whether or not a R/O replica is configured
   */
  get hasReadOnly(): boolean {
    return !!this.configuredClient.readonlyBaseClient;
  }

  /**
   * Execute a function with a lock. The lock is unique across processes and within the current
   * process as well since it holds a connection from the pool so long as it is running.
   * Throws an exception if it cannot get the lock after timeout
   *
   * @param key Will be SHA256-d to build a key.
   * @param fn The function to execute.
   * @param options
   *  immediate: truthy to use pg_try_advisory_lock
   */
  async withAdvisoryLock<T>(
    key: string,
    fn: (options?: AdvisoryLockOptions) => Promise<T>,
    options: AdvisoryLockOptions = {},
  ): Promise<T> {
    const [k1, k2] = strToKey(key);
    let result: T;
    let lockConnection: any;
    const logger = this.queryContext.gb?.logger || this.queryContext.logger;
    try {
      await this.configuredClient.baseClient
        .connect()
        .then((conn) => {
          lockConnection = conn;
          if (logger && logger.info) {
            logger.info('Acquiring advisory lock', options.immediate ? { key, immediate: true } : { key });
          }
          if (options.immediate) {
            return conn.one('SELECT pg_try_advisory_lock($1, $2) as locked', [k1, k2]);
          }
          return conn.one('SELECT pg_advisory_lock($1, $2) as locked', [k1, k2]);
        })
        .then(async (pgLockResult: { locked?: boolean }) => {
          if (options.immediate && pgLockResult?.locked !== true) {
            const error = new Error('Failed to acquire advisory lock') as Error & { code: string };
            error.code = 'AdvisoryLockBusy';
            throw error;
          }
          if (logger && logger.info) {
            logger.info('Acquired advisory lock', { key });
          }
          try {
            result = await fn(options);
          } catch (error) {
            if (logger && logger.error) {
              logger.error('Advisory lock function failed', this.queryContext.gb?.wrapError?.(error as Error) || error);
            }
            throw error;
          }
        });
    } catch (pgError) {
      if (logger && logger.error && (pgError as any).code !== 'AdvisoryLockBusy') {
        logger.error('Advisory locking failed', this.queryContext.gb?.wrapError?.(pgError as Error) || pgError);
      }
      throw pgError;
    } finally {
      if (lockConnection) {
        lockConnection.done();
      }
    }
    return result!;
  }

  /**
   * A gentler form of withAdvisoryLock that will delay between attempts
   */
  async tryAdvisoryLock<T>(
    key: string,
    fn: (options?: AdvisoryLockOptions) => Promise<T>,
    delays: number[],
    options: AdvisoryLockOptions = {},
  ): Promise<T> {
    try {
      const lockResult = await this.withAdvisoryLock(key, fn, { ...options, immediate: true });
      return lockResult;
    } catch (error) {
      if ((error as any).code === 'AdvisoryLockBusy' && delays.length) {
        await new Promise<void>((accept) => {
          setTimeout(accept, delays[0]);
        });
        // eslint-disable-next-line no-param-reassign
        options.retryCount = (options.retryCount || 0) + 1;
        return this.tryAdvisoryLock(key, fn, delays.slice(1), options);
      }
      throw error;
    }
  }

  async createNotificationListener(
    notificationKey: string,
    fn: (payload: any) => Promise<void>,
  ): Promise<void> {
    if (notificationKey.match(/[^A-Za-z0-9_]/)) {
      throw new Error('Invalid notification key, only A-Za-z0-9_');
    }
    const logger = this.queryContext.gb?.logger || this.queryContext.logger;
    return this.configuredClient.baseClient
      .connect({ direct: true })
      .then((conn) => {
        if (logger && logger.info) {
          logger.info('Listening for postgres notifications', { notificationKey });
        }
        this.configuredClient.once('stop', () => {
          if (logger && logger.info) {
            logger.info('Shutdown postgres notification listener', { notificationKey });
          }
          conn.done();
        });
        conn.client.on('notification', async (msg: { payload: string }) => {
          try {
            if (logger && logger.info) {
              logger.info('Received postgres notification', { notificationKey });
            }
            await fn(JSON.parse(msg.payload));
          } catch (error) {
            if (logger && logger.error) {
              logger.error('Notification processing failed', this.queryContext.gb?.wrapError?.(error as Error) || error);
            }
          }
        });
        conn.none('LISTEN $1~', [notificationKey]);
      });
  }

  notifyListeners(notificationKey: string, payload: any): Promise<any> {
    if (notificationKey.match(/[^A-Za-z0-9_]/)) {
      throw new Error('Invalid notification key, only A-Za-z0-9_');
    }
    return this.configuredClient.baseClient.none('NOTIFY $1~, $2', [notificationKey, JSON.stringify(payload)]);
  }
}
