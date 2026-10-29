import { STATUS_CODES } from 'node:http';
import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import {
  InsufficientCapacityError,
  ProgramNotFoundError,
  ReservationConflictError,
  ReservationNotFoundError,
  UnsupportedCurrencyError,
} from '../errors';

@Catch()
export class ApiExceptionFilter extends BaseExceptionFilter {
  public override catch(exception: unknown, host: ArgumentsHost): void {
    super.catch(toHttpException(exception), host);
  }
}

export enum ErrorCode {
  PROGRAM_NOT_FOUND = 'PROGRAM_NOT_FOUND',
  RESERVATION_NOT_FOUND = 'RESERVATION_NOT_FOUND',
  INSUFFICIENT_CAPACITY = 'INSUFFICIENT_CAPACITY',
  INVOICE_ALREADY_RESERVED = 'INVOICE_ALREADY_RESERVED',
  UNSUPPORTED_CURRENCY = 'UNSUPPORTED_CURRENCY',
}

function toHttpException(exception: unknown): unknown {
  if (exception instanceof ProgramNotFoundError) {
    return coded(HttpStatus.NOT_FOUND, ErrorCode.PROGRAM_NOT_FOUND, exception.message);
  }
  if (exception instanceof ReservationNotFoundError) {
    return coded(HttpStatus.NOT_FOUND, ErrorCode.RESERVATION_NOT_FOUND, exception.message);
  }
  if (exception instanceof InsufficientCapacityError) {
    return coded(HttpStatus.CONFLICT, ErrorCode.INSUFFICIENT_CAPACITY, exception.message);
  }
  if (exception instanceof ReservationConflictError) {
    return coded(HttpStatus.CONFLICT, ErrorCode.INVOICE_ALREADY_RESERVED, exception.message);
  }
  if (exception instanceof UnsupportedCurrencyError) {
    return coded(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.UNSUPPORTED_CURRENCY, exception.message);
  }
  if (isClientHttpError(exception)) {
    return clientError(exception.statusCode, exception.message);
  }
  if (exception instanceof HttpException && exception.getStatus() < 500) {
    const response = exception.getResponse();
    const message = typeof response === 'object' && 'message' in response ? response.message : response;
    return Array.isArray(message) ? exception : clientError(exception.getStatus(), String(message));
  }
  return exception;
}

function coded(statusCode: HttpStatus, code: ErrorCode, message: string): HttpException {
  return new HttpException({ statusCode, code, message: [message], error: STATUS_CODES[statusCode] }, statusCode);
}

function clientError(statusCode: number, message: string): HttpException {
  return new HttpException({ statusCode, message: [message], error: STATUS_CODES[statusCode] }, statusCode);
}

function isClientHttpError(value: unknown): value is Error & { statusCode: number } {
  return (
    value instanceof Error &&
    'statusCode' in value &&
    typeof value.statusCode === 'number' &&
    value.statusCode >= 400 &&
    value.statusCode < 500
  );
}
