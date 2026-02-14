import {
  Global,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityLog } from '../../entities/security-log.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { SecureChannel } from '../../entities/secure-channel.entity';
import { SecureReplayGuard } from '../../entities/secure-replay-guard.entity';
import { Session } from '../../entities/session.entity';
import { SecurityService } from './security.service';
import { AuditService } from './audit.service';
import { SecurityController } from './security.controller';
import { AuditLogInterceptor } from './interceptors/audit-log.interceptor';
import { SecureChannelController } from './secure-channel.controller';
import { SecureChannelService } from './secure-channel.service';
import { SecureCryptoService } from './secure-crypto.service';
import { SecureReplayService } from './secure-replay.service';
import { SecureTransportMiddleware } from './middleware/secure-transport.middleware';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([SecurityLog, AuditLog, SecureChannel, SecureReplayGuard, Session]),
  ],
  controllers: [SecurityController, SecureChannelController],
  providers: [
    SecurityService,
    AuditService,
    SecureChannelService,
    SecureCryptoService,
    SecureReplayService,
    SecureTransportMiddleware,
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
  exports: [SecurityService, AuditService, SecureChannelService, SecureCryptoService],
})
export class SecurityModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecureTransportMiddleware).forRoutes({
      path: '*',
      method: RequestMethod.ALL,
    });
  }
}
