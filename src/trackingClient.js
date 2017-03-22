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
      const rz = await this.configuredClient.baseClient[method](...args);
      callInfo.result = rz;
      this.configuredClient.emit('finish', callInfo);
      return rz;
    } catch (error) {
      callInfo.error = error;
      this.configuredClient.emit('queryError', callInfo);
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
}
