import { createHash } from 'crypto';

// Converts string to 64 bit number for use with postgres advisory lock
// functions
function strToKey(name) {
  // Generate sha256 hash of name
  // and take 32 bit twice from hash
  const buf = createHash('sha256').update(name).digest();
  // Read the first 4 bytes and the next 4 bytes
  // The parameter here is the byte offset, not the sizeof(int32) offset
  return [buf.readInt32LE(0), buf.readInt32LE(4)];
}

export default class TrackingClient {
  constructor(pg, queryContext, operationName) {
    this.configuredClient = pg;
    this.queryContext = queryContext;
    this.operationName = operationName;
  }

  async run(method, args) {
    const callSite = new Error();
    Error.captureStackTrace(callSite, this.run);
    const callInfo = {
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
      const rz = await client[method](...args);
      callInfo.result = rz;
      this.configuredClient.emit('finish', callInfo);
      return rz;
    } catch (error) {
      callInfo.error = error;
      // Only emit this if someone is listening, because otherwise it
      // prevents the throw of the original error
      if (this.configuredClient.listenerCount('error')) {
        this.configuredClient.emit('error', callInfo);
      }
      callSite.message = error.message;
      Object.assign(callSite, error);
      throw callSite;
    }
  }

  async connect(...args) {
    return this.run('connect', args);
  }

  async none(...args) {
    return this.run('none', args);
  }

  async one(...args) {
    return this.run('one', args);
  }

  async oneOrNone(...args) {
    return this.run('oneOrNone', args);
  }

  async many(...args) {
    return this.run('many', args);
  }

  async manyOrNone(...args) {
    return this.run('manyOrNone', args);
  }

  async result(...args) {
    return this.run('result', args);
  }

  async any(...args) {
    return this.run('any', args);
  }

  async tx(...args) {
    return this.run('tx', args);
  }

  async task(...args) {
    return this.run('task', args);
  }

  /**
   * If a read-only replica is configured for this client, use it.
   * In order to allow parameterized control, you can pass false
   * as the argument and we will NOT use a read only replica even if available.
   * Any other value (undefined, for example) is the same as true.
   * @param {boolean} ro If === false, do not use read only connection,
   *  else use the read only connection
   */
  readOnly(ro: boolean) {
    this.useReadOnly = ro !== false;
    return this;
  }

  /**
   * Whether or not a R/O replica is configured
   */
  get hasReadOnly() {
    return !!this.configuredClient.readonlyBaseClient;
  }

  /**
   * Execute a function with a lock. The lock is unique across processes and within the current process as well
   * since it holds a connection from the pool so long as it is running. Throws an exception if it cannot get the lock
   * after timeout
   *
   * @param {String} key Will be SHA256-d to build a key.
   * @param {async () => void} fn The function to execute.
   * @param {map} options
   *  immediate: truthy to use pg_try_advisory_lock
   */
  async withAdvisoryLock(key, fn, options = {}) {
    const [k1, k2] = strToKey(key);
    let result;
    let lockConnection;
    const logger = this.queryContext.gb?.logger || this.queryContext.logger;
    try {
      await this.configuredClient.baseClient
        .connect()
        .then((conn) => {
          lockConnection = conn;
          if (logger) {
            logger.info('Acquiring advisory lock', options.immediate ? { key, immediate: true } : { key });
          }
          if (options.immediate) {
            return conn.one('SELECT pg_try_advisory_lock($1, $2) as locked', [k1, k2]);
          }
          return conn.one('SELECT pg_advisory_lock($1, $2) as locked', [k1, k2]);
        })
        .then(async (pgLockResult) => {
          if (options.immediate && pgLockResult?.locked !== true) {
            const error = new Error('Failed to acquire advisory lock');
            error.code = 'AdvisoryLockBusy';
            throw error;
          }
          if (logger) {
            logger.info('Acquired advisory lock', { key });
          }
          try {
            result = await fn(options);
          } catch (error) {
            logger.error('Advisory lock function failed', this.queryContext.gb?.wrapError(error) || error);
            throw error;
          }
        });
    } catch (pgError) {
      if (logger && pgError.code !== 'AdvisoryLockBusy') {
        logger.error('Advisory locking failed', this.queryContext.gb?.wrapError(pgError) || pgError);
      }
      throw pgError;
    } finally {
      if (lockConnection) {
        lockConnection.done();
      }
    }
    return result;
  }

  /**
   * A gentler form of withAdvisoryLock that will delay between attempts ()
   */
  async tryAdvisoryLock(key, fn, delays, options = {}) {
    try {
      const lockResult = await this.withAdvisoryLock(key, fn, { ...options, immediate: true });
      return lockResult;
    } catch (error) {
      if (error.code === 'AdvisoryLockBusy' && delays.length) {
        await new Promise(accept => setTimeout(accept, delays[0]));
        options.retryCount = (options.retryCount || 0) + 1;
        return this.tryAdvisoryLock(key, fn, delays.slice(1), options);
      }
      throw error;
    }
  }

  async createNotificationListener(notificationKey, fn) {
    if (notificationKey.match(/[^A-Za-z0-9_]/)) {
      throw new Error('Invalid notification key, only A-Za-z0-9_');
    }
    const logger = this.queryContext.gb?.logger || this.queryContext.logger;
    return this.configuredClient.baseClient
      .connect({ direct: true })
      .then((conn) => {
        if (logger) {
          logger.info('Listening for postgres notifications', { notificationKey });
        }
        this.configuredClient.once('stop', () => {
          logger.info('Shutdown postgres notification listener', { notificationKey });
          conn.done();
        });
        conn.client.on('notification', async (msg) => {
          try {
            if (logger) {
              logger.info('Received postgres notification', { notificationKey });
            }
            await fn(JSON.parse(msg.payload));
          } catch (error) {
            if (logger) {
              logger.error('Notification processing failed', this.queryContext.gb?.wrapError(error) || error);
            }
          }
        });
        conn.none('LISTEN $1~', [notificationKey]);
      });
  }

  notifyListeners(notificationKey, payload) {
    if (notificationKey.match(/[^A-Za-z0-9_]/)) {
      throw new Error('Invalid notification key, only A-Za-z0-9_');
    }
    return this.configuredClient.baseClient.none('NOTIFY $1~, $2', [notificationKey, JSON.stringify(payload)]);
  }
}
