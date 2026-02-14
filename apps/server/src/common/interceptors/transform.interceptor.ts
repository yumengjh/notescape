import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SuccessResponse } from '../dto/response.dto';
import { type SecureEnvelopeDto } from '../../modules/security/types/secure-request-context.type';
import { encryptSecureEnvelope } from '../../modules/security/utils/secure-payload.util';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  SuccessResponse<T> | StreamableFile | (SecureEnvelopeDto & { sig: string })
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessResponse<T> | StreamableFile | (SecureEnvelopeDto & { sig: string })> {
    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      map((data) => {
        // 文件流等特殊类型直接返回，避免被包裹成 JSON
        if (data instanceof StreamableFile) {
          return data;
        }

        // 如果数据已经是标准格式 { success: true, data? }，直接返回
        const payload =
          data && typeof data === 'object' && 'success' in data && data.success === true
            ? (data as SuccessResponse<T>)
            : ({
                success: true,
                data,
              } as SuccessResponse<T>);

        const secureContext = request.secureContext;
        if (!secureContext) {
          return payload;
        }

        return encryptSecureEnvelope(secureContext, payload);
      }),
    );
  }
}
