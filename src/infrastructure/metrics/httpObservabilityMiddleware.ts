import { NextFunction, Request, Response } from 'express';
import { resolveRequestId } from '../logging/loggerOptions';
import { MetricsService } from './MetricsService';

const UNMATCHED_ROUTE = 'unmatched';
const CLIENT_CLOSED_REQUEST = 499;
const UNLOGGED_ROUTES = new Set(['/health/liveness', '/health/readiness', '/metrics']);

export interface AccessLogger {
  info(details: object, message: string): void;
}

export function createHttpObservabilityMiddleware(
  metrics: MetricsService,
  logger: AccessLogger,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    req.id = resolveRequestId(req, res);
    const startedAt = process.hrtime.bigint();
    res.on('close', () => {
      const route = resolveRoute(req);
      const statusCode = res.writableFinished ? res.statusCode : CLIENT_CLOSED_REQUEST;
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      metrics.observeHttpRequest({ method: req.method, route, statusCode, durationSeconds: durationMs / 1000 });
      if (!UNLOGGED_ROUTES.has(route)) {
        logger.info(
          { requestId: req.id, method: req.method, route, statusCode, durationMs: Math.round(durationMs * 100) / 100 },
          'Request completed',
        );
      }
    });
    next();
  };
}

function resolveRoute(req: Request): string {
  const routePath: unknown = req.route?.path;
  return typeof routePath === 'string' ? `${req.baseUrl}${routePath}` : UNMATCHED_ROUTE;
}
