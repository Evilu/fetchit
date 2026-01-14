import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCode } from '../errors/error-codes';

export class ErrorDetail {
  @ApiProperty({ description: 'Field that caused the error' })
  field: string;

  @ApiProperty({ description: 'Reason for the error' })
  reason: string;
}

export class ErrorBody {
  @ApiProperty({ enum: ErrorCode, description: 'Error code' })
  code: ErrorCode;

  @ApiProperty({ description: 'Human-readable error message' })
  message: string;

  @ApiPropertyOptional({
    type: [ErrorDetail],
    description: 'Detailed validation errors',
  })
  details?: ErrorDetail[];
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorBody })
  error: ErrorBody;

  constructor(code: ErrorCode, message: string, details?: ErrorDetail[]) {
    this.error = { code, message, details };
  }
}
