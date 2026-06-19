import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JsonLogger } from './common/logger/json.logger';
import { resolveCorsOrigins } from './common/config/cors-origin';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  const corsOrigins = resolveCorsOrigins(isProd);

  const app = await NestFactory.create(AppModule, {
    logger: isProd ? new JsonLogger() : undefined,
  });

  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  // credentials: true permite que el browser mande la cookie auth_token cross-origin.
  // Combinado con SameSite=Lax en la cookie, mitiga CSRF para top-level navigation.
  app.enableCors({ origin: corsOrigins, credentials: true });

  await app.listen(process.env.PORT || 3001);
  if (!isProd) console.log(`API running on port ${process.env.PORT || 3001} · CORS: ${corsOrigins.join(', ')}`);
}
bootstrap();
