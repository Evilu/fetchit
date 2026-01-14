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
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../errors/error-codes';
import { ErrorResponseDto, ErrorDetail } from '../dto/error-response.dto';
import { RequestWithId } from '../interceptors/logging.interceptor';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const requestId = request.requestId || 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = ErrorCode.INTERNAL_ERROR;
    let message = 'Internal server error';
    let details: ErrorDetail[] | undefined;

    // Handle Prisma errors
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': // Unique constraint violation
          status = HttpStatus.CONFLICT;
          errorCode = ErrorCode.CONFLICT;
          message = 'Resource already exists';
          break;
        case 'P2025': // Record not found
          status = HttpStatus.NOT_FOUND;
          errorCode = ErrorCode.NOT_FOUND;
          message = 'Resource not found';
          break;
        case 'P2003': // Foreign key constraint failed
          status = HttpStatus.BAD_REQUEST;
          errorCode = ErrorCode.VALIDATION_ERROR;
          message = 'Invalid reference';
          break;
        default:
          this.logger.error(
            `[${requestId}] Prisma error ${exception.code}: ${exception.message}`,
          );
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      errorCode = ErrorCode.VALIDATION_ERROR;
      message = 'Invalid data provided';
    } else if (exception instanceof HttpException) {
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
      this.logger.error(
        `[${requestId}] Unexpected error: ${exception.message}`,
        exception.stack,
      );
    }

    const errorResponse = new ErrorResponseDto(errorCode, message, details);
    response.status(status).json(errorResponse);
  }
}
