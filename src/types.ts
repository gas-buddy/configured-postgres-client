export interface Logger {
  info?: (message: string, data?: any) => void;
  warn?: (message: string, data?: any) => void;
  error?: (message: string, data?: any) => void;
}

export interface QueryContext {
  gb?: {
    logger?: Logger;
    wrapError?: (error: Error) => any;
  };
  logger?: Logger;
}
