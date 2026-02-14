import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '../../common/errors/error-codes';
import { BusinessException } from '../../common/exceptions/business.exception';
import { generateSecureChannelId } from '../../common/utils/id-generator.util';
import { SecureChannel } from '../../entities/secure-channel.entity';
import { Session } from '../../entities/session.entity';
import { SecurityEventType } from './constants/security-events';
import { InitSecureChannelDto } from './dto/init-secure-channel.dto';
import { SecurityService } from './security.service';
import { SecureCryptoService } from './secure-crypto.service';

const CHANNEL_ACTIVITY_UPDATE_INTERVAL_MS = 15000;

export interface InitSecureChannelOptions {
  userId: string;
  accessToken?: string;
  ipAddress?: string;
  userAgent?: string;
  body: InitSecureChannelDto;
}

export interface SecureChannelHandshakeResponse {
  channelId: string;
  serverPublicKey: string;
  serverRandom: string;
  expiresAt: string;
  serverTime: number;
  cipherSuite: string;
}

@Injectable()
export class SecureChannelService {
  private readonly activityTouchedAt = new Map<string, number>();

  constructor(
    @InjectRepository(SecureChannel)
    private readonly secureChannelRepository: Repository<SecureChannel>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    private readonly configService: ConfigService,
    private readonly secureCryptoService: SecureCryptoService,
    private readonly securityService: SecurityService,
  ) {}

  async initChannel(options: InitSecureChannelOptions): Promise<SecureChannelHandshakeResponse> {
    const { userId, accessToken, body, ipAddress, userAgent } = options;

    const derivedKeys = this.secureCryptoService.deriveChannelKeys(
      body.clientPublicKey,
      body.clientRandom,
    );
    const wrappedKeys = this.secureCryptoService.wrapChannelKeys({
      encKey: derivedKeys.encKey,
      macKey: derivedKeys.macKey,
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.getChannelTtlSeconds() * 1000);
    const sessionId = await this.resolveSessionId(userId, accessToken);

    const channel = this.secureChannelRepository.create({
      channelId: this.createSecureChannelId(),
      userId,
      sessionId,
      keyCipher: wrappedKeys.keyCipher,
      keyIv: wrappedKeys.keyIv,
      keyTag: wrappedKeys.keyTag,
      deviceId: body.deviceId?.trim() || null,
      status: 'active',
      expiresAt,
      lastActivityAt: now,
    });

    const saved = await this.secureChannelRepository.save(channel);

    this.securityService
      .logEvent(SecurityEventType.SECURE_CHANNEL_INIT, {
        userId,
        ipAddress: ipAddress || '0.0.0.0',
        userAgent,
        details: {
          channelId: saved.channelId,
          sessionId: saved.sessionId,
          deviceId: saved.deviceId,
          expiresAt: saved.expiresAt.toISOString(),
        },
        severity: 'low',
      })
      .catch(() => {});

    return {
      channelId: saved.channelId,
      serverPublicKey: derivedKeys.serverPublicKey,
      serverRandom: derivedKeys.serverRandom,
      expiresAt: saved.expiresAt.toISOString(),
      serverTime: Date.now(),
      cipherSuite: this.secureCryptoService.getCipherSuite(),
    };
  }

  async loadActiveChannel(channelId: string): Promise<SecureChannel> {
    const channel = await this.secureChannelRepository.findOne({
      where: { channelId },
    });

    if (!channel || channel.status !== 'active') {
      throw new BusinessException(
        ErrorCode.SECURE_CHANNEL_INVALID,
        '安全通道不存在或已失效',
        undefined,
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (channel.expiresAt.getTime() <= Date.now()) {
      await this.secureChannelRepository
        .update({ channelId: channel.channelId }, { status: 'expired' })
        .catch(() => {});
      throw new BusinessException(
        ErrorCode.SECURE_CHANNEL_EXPIRED,
        '安全通道已过期，请重新初始化',
        undefined,
        HttpStatus.UNAUTHORIZED,
      );
    }

    return channel;
  }

  buildRequestContext(channel: SecureChannel, meta: { reqId: string; nonce: string; ts: number }) {
    const keys = this.secureCryptoService.unwrapChannelKeys(channel);
    return this.secureCryptoService.createRequestContext({
      channelId: channel.channelId,
      userId: channel.userId,
      reqId: meta.reqId,
      nonce: meta.nonce,
      timestamp: meta.ts,
      encKey: keys.encKey,
      macKey: keys.macKey,
    });
  }

  async touchLastActivity(channelId: string): Promise<void> {
    const now = Date.now();
    const lastTouched = this.activityTouchedAt.get(channelId);
    if (lastTouched && now - lastTouched < CHANNEL_ACTIVITY_UPDATE_INTERVAL_MS) {
      return;
    }

    this.activityTouchedAt.set(channelId, now);
    await this.secureChannelRepository
      .update({ channelId }, { lastActivityAt: new Date(now) })
      .catch(() => {});
  }

  private async resolveSessionId(userId: string, accessToken?: string): Promise<string | null> {
    if (!accessToken) {
      return null;
    }

    const session = await this.sessionRepository.findOne({
      where: {
        userId,
        token: accessToken,
      },
      select: ['sessionId'],
    });

    return session?.sessionId ?? null;
  }

  private getChannelTtlSeconds(): number {
    const ttl = this.configService.get<number>('secure.channelTtlSeconds');
    if (typeof ttl !== 'number' || Number.isNaN(ttl)) {
      return 1800;
    }

    return Math.max(60, Math.trunc(ttl));
  }

  private createSecureChannelId(): string {
    return generateSecureChannelId();
  }
}
