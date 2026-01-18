import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SuccessResponse } from '../dto/response.dto';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, SuccessResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // 如果数据已经是标准格式 { success: true, data? }，直接返回
        if (data && typeof data === 'object' && 'success' in data && data.success === true) {
          return data;
        }

        // 否则包装为标准格式
        return {
          success: true,
          data,
        };
      }),
    );
  }
}
