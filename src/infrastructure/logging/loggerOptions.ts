import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Params } from 'nestjs-pino';
import { LoggerOptions, stdTimeFunctions } from 'pino';
import { LogLevel } from '../../config/config';

const REQUEST_ID_HEADER = 'x-request-id';
const MAX_REQUEST_ID_LENGTH = 128;

export const BASE_LOGGER_OPTIONS: LoggerOptions = {
  timestamp: stdTimeFunctions.isoTime,
  formatters: { level: (label: string) => ({ level: label }) },
};

export function createLoggerOptions(level: LogLevel): Params {
  return {
    pinoHttp: {
      ...BASE_LOGGER_OPTIONS,
      level,
      autoLogging: false,
      quietReqLogger: true,
      customAttributeKeys: { reqId: 'requestId' },
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
  };
}

export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const header = req.headers[REQUEST_ID_HEADER];
  const candidate = typeof header === 'string' ? header.trim() : '';
  const requestId = candidate.length > 0 && candidate.length <= MAX_REQUEST_ID_LENGTH ? candidate : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, requestId);
  return requestId;
}
