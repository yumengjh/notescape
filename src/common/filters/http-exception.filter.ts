import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorResponse } from '../dto/response.dto';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const isProduction = process.env.NODE_ENV === 'production';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        const errorObj = exceptionResponse as any;
        message = errorObj.message || message;
        code = errorObj.code || code || exception.name;
      } else {
        message = exceptionResponse as string;
        code = exception.name;
      }
    }

    // 记录错误日志
    console.error({
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      status,
      code,
      message,
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    if (isProduction) {
      const errorResponse: ErrorResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unauthorized',
        },
      };
      response.status(status).json(errorResponse);
      return;
    }

    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        code,
        message,
        ...(process.env.NODE_ENV === 'development' && {
          stack: exception instanceof Error ? exception.stack : undefined,
        }),
      },
    };

    response.status(status).json(errorResponse);
  }
}
