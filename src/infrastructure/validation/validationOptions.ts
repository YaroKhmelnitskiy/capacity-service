import { ValidationPipeOptions } from '@nestjs/common';

export const VALIDATION_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
  validationError: { target: false, value: false },
};
