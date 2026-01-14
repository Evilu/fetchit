import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorCode } from '../errors/error-codes';
import { ErrorResponseDto, ErrorDetail } from '../dto/error-response.dto';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = ErrorCode.INTERNAL_ERROR;
    let message = 'Internal server error';
    let details: ErrorDetail[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (exception instanceof BadRequestException) {
        errorCode = ErrorCode.VALIDATION_ERROR;
        message = 'Invalid request';

        if (typeof exceptionResponse === 'object' && 'message' in exceptionResponse) {
          const messages = exceptionResponse.message;
          if (Array.isArray(messages)) {
            details = messages.map((msg: string) => {
              const fieldMatch = msg.match(/^(\w+)\s/);
              return {
                field: fieldMatch ? fieldMatch[1] : 'unknown',
                reason: msg,
              };
            });
          } else if (typeof messages === 'string') {
            message = messages;
          }
        }
      } else if (exception instanceof NotFoundException) {
        errorCode = ErrorCode.NOT_FOUND;
        message = typeof exceptionResponse === 'object' && 'message' in exceptionResponse
          ? String(exceptionResponse.message)
          : 'Resource not found';
      } else if (exception instanceof ConflictException) {
        errorCode = ErrorCode.CONFLICT;
        message = typeof exceptionResponse === 'object' && 'message' in exceptionResponse
          ? String(exceptionResponse.message)
          : 'Conflict';
      } else {
        message = typeof exceptionResponse === 'object' && 'message' in exceptionResponse
          ? String(exceptionResponse.message)
          : exception.message;
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unexpected error: ${exception.message}`, exception.stack);
    }

    const errorResponse = new ErrorResponseDto(errorCode, message, details);
    response.status(status).json(errorResponse);
  }
}
