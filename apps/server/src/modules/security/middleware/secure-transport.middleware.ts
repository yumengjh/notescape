import { HttpStatus, Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { ErrorCode } from '../../../common/errors/error-codes';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { SecurityEventType } from '../constants/security-events';
import { SecureChannelService } from '../secure-channel.service';
import { SecureCryptoService } from '../secure-crypto.service';
import { SecureReplayService } from '../secure-replay.service';
import { SecurityService } from '../security.service';
import { type SecureEnvelopeDto } from '../types/secure-request-context.type';
import { buildSecureRequestSignMaterial, verifyWithMacKey } from '../utils/secure-payload.util';

@Injectable()
export class SecureTransportMiddleware implements NestMiddleware {
  private readonly openPathMatchers: RegExp[];

  constructor(
    private readonly configService: ConfigService,
    private readonly secureChannelService: SecureChannelService,
    private readonly secureReplayService: SecureReplayService,
    private readonly secureCryptoService: SecureCryptoService,
    private readonly securityService: SecurityService,
  ) {
    const paths = this.configService.get<string[]>('secure.openPaths') || [];
    this.openPathMatchers = paths.map((path) => this.compilePathPattern(path));
  }

  async use(request: Request, _response: Response, next: NextFunction) {
    try {
      const secureEnabled = this.configService.get<boolean>('secure.enabled') ?? false;
      if (!secureEnabled || request.method === 'OPTIONS') {
        next();
        return;
      }

      const secureRequested = this.getHeaderValue(request, 'x-sec-enabled') === '1';
      const secureForce = this.configService.get<boolean>('secure.force') ?? false;
      const requestPath = this.resolveSignPath(request);
      const isOpenPath = this.isOpenPath(requestPath);

      if (!secureRequested) {
        if (secureForce && !isOpenPath && this.shouldForceSecure(requestPath, request)) {
          throw new BusinessException(
            ErrorCode.SECURE_CHANNEL_INVALID,
            '当前接口已启用强制安全通道，请先初始化 channel 并使用密文请求',
            undefined,
            HttpStatus.BAD_REQUEST,
          );
        }

        next();
        return;
      }

      if (this.isMultipartRequest(request)) {
        throw new BusinessException(
          ErrorCode.SECURE_CHANNEL_INVALID,
          'multipart/form-data 接口暂不支持安全通道封包',
          undefined,
          HttpStatus.BAD_REQUEST,
        );
      }

      const channelId = this.requireHeader(request, 'x-sec-channel-id', 64);
      const reqId = this.requireHeader(request, 'x-sec-req-id', 128);
      const nonce = this.requireHeader(request, 'x-sec-nonce', 128);
      const tsRaw = this.requireHeader(request, 'x-sec-ts', 20);
      const signature = this.requireHeader(request, 'x-sec-sig', 1024);
      const kv = this.getHeaderValue(request, 'x-sec-kv');

      if (kv && kv !== 'v1') {
        throw new BusinessException(
          ErrorCode.SECURE_CHANNEL_INVALID,
          `不支持的安全通道版本: ${kv}`,
          undefined,
          HttpStatus.BAD_REQUEST,
        );
      }

      const timestamp = this.parseTimestamp(tsRaw);
      const clockSkew = this.getClockSkewMs();
      if (Math.abs(Date.now() - timestamp) > clockSkew) {
        throw new BusinessException(
          ErrorCode.SECURE_TIMESTAMP_INVALID,
          '请求时间戳超出允许偏差，请同步客户端时间',
          { clockSkewMs: clockSkew },
          HttpStatus.UNAUTHORIZED,
        );
      }

      const envelope = this.extractEnvelope(request);
      const channel = await this.secureChannelService.loadActiveChannel(channelId);

      await this.secureReplayService.assertNotReplay({
        channelId,
        reqId,
        nonce,
        userId: channel.userId,
        ipAddress: request.ip || request.socket?.remoteAddress || '0.0.0.0',
        userAgent: request.headers['user-agent'],
      });

      const secureContext = this.secureChannelService.buildRequestContext(channel, {
        reqId,
        nonce,
        ts: timestamp,
      });
      request.secureContext = secureContext;

      const signMaterial = buildSecureRequestSignMaterial({
        method: request.method,
        path: requestPath,
        reqId,
        nonce,
        ts: tsRaw,
        iv: envelope.iv,
        ciphertext: envelope.ciphertext,
      });

      if (!verifyWithMacKey(secureContext.macKey, signMaterial, signature)) {
        this.securityService
          .logEvent(SecurityEventType.SECURE_SIGNATURE_INVALID, {
            userId: channel.userId,
            ipAddress: request.ip || request.socket?.remoteAddress || '0.0.0.0',
            userAgent: request.headers['user-agent'],
            details: {
              channelId,
              reqId,
              nonce,
              path: requestPath,
            },
            threatLevel: 'high',
            blocked: true,
            severity: 'high',
          })
          .catch(() => {});

        throw new BusinessException(
          ErrorCode.SECURE_SIGNATURE_INVALID,
          '安全通道签名校验失败',
          undefined,
          HttpStatus.UNAUTHORIZED,
        );
      }

      const decrypted = this.decryptRequestPayload(secureContext, envelope, {
        channelId,
        reqId,
        nonce,
        userId: channel.userId,
        ipAddress: request.ip || request.socket?.remoteAddress || '0.0.0.0',
        userAgent: request.headers['user-agent'],
      });

      request.body = this.ensureRecord(decrypted.body);
      request.query = this.ensureRecord(decrypted.query) as Record<string, string>;

      void this.secureChannelService.touchLastActivity(channelId);

      next();
    } catch (error) {
      next(error);
    }
  }

  private decryptRequestPayload(
    context: Parameters<SecureCryptoService['decryptRequestEnvelope']>[0],
    envelope: SecureEnvelopeDto,
    logContext: {
      channelId: string;
      reqId: string;
      nonce: string;
      userId: string;
      ipAddress: string;
      userAgent?: string;
    },
  ) {
    try {
      return this.secureCryptoService.decryptRequestEnvelope(context, envelope);
    } catch (error) {
      this.securityService
        .logEvent(SecurityEventType.SECURE_DECRYPT_FAILED, {
          userId: logContext.userId,
          ipAddress: logContext.ipAddress,
          userAgent: logContext.userAgent,
          details: {
            channelId: logContext.channelId,
            reqId: logContext.reqId,
            nonce: logContext.nonce,
          },
          threatLevel: 'medium',
          blocked: true,
          severity: 'medium',
        })
        .catch(() => {});

      throw error;
    }
  }

  private extractEnvelope(request: Request): SecureEnvelopeDto {
    const fromBody = this.parseEnvelopeRecord(request.body);
    if (fromBody) {
      return fromBody;
    }

    const fromQuery = this.parseEnvelopeRecord(request.query);
    if (fromQuery) {
      return fromQuery;
    }

    throw new BusinessException(
      ErrorCode.SECURE_CHANNEL_INVALID,
      '请求缺少安全封包字段（v/iv/ciphertext）',
      undefined,
      HttpStatus.BAD_REQUEST,
    );
  }

  private parseEnvelopeRecord(value: unknown): SecureEnvelopeDto | null {
    if (!this.isRecord(value)) {
      return null;
    }

    const vRaw = this.getValue(value, 'v');
    const iv = this.getValue(value, 'iv');
    const ciphertext = this.getValue(value, 'ciphertext');

    if (!vRaw || !iv || !ciphertext) {
      return null;
    }

    const version = Number(vRaw);
    if (!Number.isFinite(version) || version !== 1) {
      throw new BusinessException(
        ErrorCode.SECURE_CHANNEL_INVALID,
        '请求安全封包版本无效，仅支持 v=1',
        undefined,
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      v: version,
      iv,
      ciphertext,
    };
  }

  private requireHeader(request: Request, key: string, maxLength: number): string {
    const value = this.getHeaderValue(request, key);
    if (!value) {
      throw new BusinessException(
        ErrorCode.SECURE_CHANNEL_INVALID,
        `缺少安全通道请求头: ${key}`,
        undefined,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (value.length > maxLength) {
      throw new BusinessException(
        ErrorCode.SECURE_CHANNEL_INVALID,
        `请求头 ${key} 超出长度限制`,
        undefined,
        HttpStatus.BAD_REQUEST,
      );
    }

    return value;
  }

  private getHeaderValue(request: Request, key: string): string | undefined {
    const value = request.headers[key.toLowerCase()];
    if (Array.isArray(value)) {
      return value[0];
    }

    if (typeof value === 'string') {
      return value;
    }

    return undefined;
  }

  private parseTimestamp(raw: string): number {
    const timestamp = Number(raw);
    if (!Number.isFinite(timestamp)) {
      throw new BusinessException(
        ErrorCode.SECURE_TIMESTAMP_INVALID,
        '请求时间戳格式无效',
        undefined,
        HttpStatus.BAD_REQUEST,
      );
    }

    return Math.trunc(timestamp);
  }

  private getClockSkewMs(): number {
    const clockSkew = this.configService.get<number>('secure.clockSkewMs');
    if (typeof clockSkew !== 'number' || Number.isNaN(clockSkew)) {
      return 60000;
    }

    return Math.max(1000, Math.trunc(clockSkew));
  }

  private shouldForceSecure(requestPath: string, request: Request): boolean {
    if (request.method === 'OPTIONS' || request.method === 'HEAD') {
      return false;
    }

    if (this.isMultipartRequest(request)) {
      return false;
    }

    return requestPath.startsWith('/api/');
  }

  private isMultipartRequest(request: Request): boolean {
    const contentType = this.getHeaderValue(request, 'content-type') || '';
    return contentType.toLowerCase().includes('multipart/form-data');
  }

  private isOpenPath(requestPath: string): boolean {
    const normalizedPath = this.normalizePath(requestPath);
    return this.openPathMatchers.some((matcher) => matcher.test(normalizedPath));
  }

  private compilePathPattern(pathPattern: string): RegExp {
    const normalizedPattern = this.normalizePath(pathPattern);
    const segments = normalizedPattern
      .split('/')
      .filter(Boolean)
      .map((segment) => {
        if (segment.startsWith(':')) {
          return '[^/]+';
        }

        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      });

    if (segments.length === 0) {
      return /^\/?$/;
    }

    return new RegExp(`^/${segments.join('/')}/?$`);
  }

  private normalizePath(path: string): string {
    if (!path) {
      return '/';
    }

    const withSlash = path.startsWith('/') ? path : `/${path}`;
    return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
  }

  private resolveSignPath(request: Request): string {
    const rawPath = request.originalUrl || request.url || request.path;
    const path = rawPath.split('?')[0];
    return this.normalizePath(path);
  }

  private ensureRecord(value: unknown): Record<string, unknown> {
    if (!this.isRecord(value)) {
      return {};
    }

    return value;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private getValue(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key];

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number') {
      return String(value);
    }

    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      return value[0];
    }

    return undefined;
  }
}
