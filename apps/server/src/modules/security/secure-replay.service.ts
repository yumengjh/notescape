import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, QueryFailedError, Repository } from 'typeorm';
import { ErrorCode } from '../../common/errors/error-codes';
import { BusinessException } from '../../common/exceptions/business.exception';
import { SecureReplayGuard } from '../../entities/secure-replay-guard.entity';
import { SecurityEventType } from './constants/security-events';
import { SecurityService } from './security.service';

const CLEANUP_INTERVAL_MS = 60000;

@Injectable()
export class SecureReplayService {
  private readonly logger = new Logger(SecureReplayService.name);
  private cleanupInProgress = false;
  private lastCleanupAt = 0;

  constructor(
    @InjectRepository(SecureReplayGuard)
    private readonly replayGuardRepository: Repository<SecureReplayGuard>,
    private readonly configService: ConfigService,
    private readonly securityService: SecurityService,
  ) {}

  async assertNotReplay(params: {
    channelId: string;
    reqId: string;
    nonce: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const expireAt = new Date(Date.now() + this.getReplayTtlSeconds() * 1000);

    try {
      await this.replayGuardRepository.insert({
        channelId: params.channelId,
        reqId: params.reqId,
        nonce: params.nonce,
        expireAt,
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        this.securityService
          .logEvent(SecurityEventType.SECURE_REPLAY_BLOCKED, {
            userId: params.userId,
            ipAddress: params.ipAddress || '0.0.0.0',
            userAgent: params.userAgent,
            details: {
              channelId: params.channelId,
              reqId: params.reqId,
              nonce: params.nonce,
            },
            threatLevel: 'high',
            blocked: true,
            severity: 'high',
          })
          .catch(() => {});

        throw new BusinessException(
          ErrorCode.SECURE_REPLAY_DETECTED,
          '检测到请求重放，已拦截',
          undefined,
          HttpStatus.CONFLICT,
        );
      }

      throw error;
    }

    void this.cleanupExpiredRecords();
  }

  private async cleanupExpiredRecords(): Promise<void> {
    const now = Date.now();
    if (this.cleanupInProgress || now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) {
      return;
    }

    this.cleanupInProgress = true;
    this.lastCleanupAt = now;

    try {
      await this.replayGuardRepository.delete({
        expireAt: LessThan(new Date()),
      });
    } catch (error) {
      this.logger.warn(
        `清理过期防重放记录失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.cleanupInProgress = false;
    }
  }

  private getReplayTtlSeconds(): number {
    const configured = this.configService.get<number>('secure.replayTtlSeconds');
    if (typeof configured !== 'number' || Number.isNaN(configured)) {
      return 120;
    }

    return Math.max(10, Math.trunc(configured));
  }

  private isUniqueConflict(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverCode = (error as any)?.driverError?.code;
    return driverCode === '23505';
  }
}
