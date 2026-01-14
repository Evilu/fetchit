import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';

export interface RequestWithId extends Request {
  requestId: string;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const response = context.switchToHttp().getResponse<Response>();

    const requestId = uuidv4();
    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);

    const { method, url, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const startTime = Date.now();

    this.logger.log(
      `[${requestId}] ${method} ${url} - Started | IP: ${ip} | UA: ${userAgent}`,
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logger.log(
            `[${requestId}] ${method} ${url} ${response.statusCode} - ${duration}ms`,
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logger.error(
            `[${requestId}] ${method} ${url} ${error.status || 500} - ${duration}ms | Error: ${error.message}`,
          );
        },
      }),
    );
  }
}
