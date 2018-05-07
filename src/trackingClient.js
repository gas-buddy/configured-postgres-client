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
}
