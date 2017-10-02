export default class TrackingClient {
  constructor(pg, queryContext, operationName) {
    this.configuredClient = pg;
    this.queryContext = queryContext;
    this.operationName = operationName;
  }

  async run(method, args) {
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
      throw error;
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

  readOnly() {
    this.useReadOnly = true;
    return this;
  }
}
