import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx     = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = exception instanceof HttpException
      ? (exception.getResponse() as any)?.message || exception.message
      : 'Internal server error';

    if (status >= 500) {
      const err = exception as any;
      this.logger.error(
        `[${request.method}] ${request.url} → ${status} | ${err?.message ?? String(exception)}`,
        err?.stack,
      );
    }

    response.status(status).json({
      error: Array.isArray(message) ? message.join(', ') : message,
      status,
      meta: { timestamp: new Date().toISOString() },
    });
  }
}
