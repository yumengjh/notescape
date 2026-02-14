import { HttpStatus, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from 'crypto';
import { ErrorCode } from '../../common/errors/error-codes';
import { BusinessException } from '../../common/exceptions/business.exception';
import { SecureChannel } from '../../entities/secure-channel.entity';
import {
  SecureDecryptedPayload,
  SecureEnvelopeDto,
  SecureRequestContext,
} from './types/secure-request-context.type';
import { decryptSecureEnvelope, encryptSecureEnvelope } from './utils/secure-payload.util';

const CHANNEL_KEY_DERIVE_INFO = Buffer.from('api-v1-secure', 'utf8');
const CHANNEL_KEY_LENGTH = 64;
const CHANNEL_RANDOM_LENGTH = 16;
const KEK_LENGTH = 32;
const KEK_IV_LENGTH = 12;

export interface DerivedChannelKeys {
  serverPublicKey: string;
  serverRandom: string;
  encKey: Buffer;
  macKey: Buffer;
}

@Injectable()
export class SecureCryptoService {
  constructor(private readonly configService: ConfigService) {}

  deriveChannelKeys(clientPublicKeyBase64: string, clientRandomBase64: string): DerivedChannelKeys {
    const clientRandom = this.parseClientRandom(clientRandomBase64);

    let clientPublicKey: ReturnType<typeof createPublicKey>;
    try {
      clientPublicKey = createPublicKey({
        key: Buffer.from(clientPublicKeyBase64, 'base64'),
        format: 'der',
        type: 'spki',
      });
    } catch {
      throw new BusinessException(
        ErrorCode.SECURE_CHANNEL_INVALID,
        'clientPublicKey 格式无效（必须是 base64(spki)）',
        undefined,
        HttpStatus.BAD_REQUEST,
      );
    }

    const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const sharedSecret = diffieHellman({
      privateKey,
      publicKey: clientPublicKey,
    });

    const serverRandomBuffer = randomBytes(CHANNEL_RANDOM_LENGTH);
    const salt = Buffer.concat([clientRandom, serverRandomBuffer]);
    const master = Buffer.from(
      hkdfSync('sha256', sharedSecret, salt, CHANNEL_KEY_DERIVE_INFO, CHANNEL_KEY_LENGTH),
    );

    return {
      serverPublicKey: Buffer.from(publicKey.export({ format: 'der', type: 'spki' })).toString(
        'base64',
      ),
      serverRandom: serverRandomBuffer.toString('base64'),
      encKey: master.subarray(0, 32),
      macKey: master.subarray(32, 64),
    };
  }

  wrapChannelKeys(keys: { encKey: Buffer; macKey: Buffer }): {
    keyCipher: string;
    keyIv: string;
    keyTag: string;
  } {
    const kek = this.getKekOrThrow();
    const iv = randomBytes(KEK_IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', kek, iv);

    const material = Buffer.from(
      JSON.stringify({
        encKey: keys.encKey.toString('base64'),
        macKey: keys.macKey.toString('base64'),
      }),
      'utf8',
    );

    const encrypted = Buffer.concat([cipher.update(material), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      keyCipher: encrypted.toString('base64'),
      keyIv: iv.toString('base64'),
      keyTag: tag.toString('base64'),
    };
  }

  unwrapChannelKeys(channel: Pick<SecureChannel, 'keyCipher' | 'keyIv' | 'keyTag'>): {
    encKey: Buffer;
    macKey: Buffer;
  } {
    try {
      const kek = this.getKekOrThrow();
      const iv = Buffer.from(channel.keyIv, 'base64');
      const tag = Buffer.from(channel.keyTag, 'base64');
      const encrypted = Buffer.from(channel.keyCipher, 'base64');

      const decipher = createDecipheriv('aes-256-gcm', kek, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      const parsed = JSON.parse(plaintext.toString('utf8')) as {
        encKey?: string;
        macKey?: string;
      };

      if (!parsed.encKey || !parsed.macKey) {
        throw new Error('通道密钥字段缺失');
      }

      const encKey = Buffer.from(parsed.encKey, 'base64');
      const macKey = Buffer.from(parsed.macKey, 'base64');

      if (encKey.length !== 32 || macKey.length !== 32) {
        throw new Error('通道密钥长度无效');
      }

      return {
        encKey,
        macKey,
      };
    } catch {
      throw new BusinessException(
        ErrorCode.SECURE_DECRYPT_FAILED,
        '安全通道密钥解包失败',
        undefined,
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  createRequestContext(params: {
    channelId: string;
    userId: string;
    reqId: string;
    nonce: string;
    timestamp: number;
    encKey: Buffer;
    macKey: Buffer;
  }): SecureRequestContext {
    return {
      enabled: true,
      channelId: params.channelId,
      userId: params.userId,
      reqId: params.reqId,
      nonce: params.nonce,
      timestamp: params.timestamp,
      encKey: params.encKey,
      macKey: params.macKey,
    };
  }

  decryptRequestEnvelope(
    context: SecureRequestContext,
    envelope: SecureEnvelopeDto,
  ): SecureDecryptedPayload {
    try {
      return decryptSecureEnvelope(context, envelope);
    } catch {
      throw new BusinessException(
        ErrorCode.SECURE_DECRYPT_FAILED,
        '安全通道解密失败',
        undefined,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  encryptResponseEnvelope(context: SecureRequestContext, payload: unknown) {
    try {
      return encryptSecureEnvelope(context, payload);
    } catch {
      throw new BusinessException(
        ErrorCode.SECURE_DECRYPT_FAILED,
        '安全通道加密失败',
        undefined,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  getCipherSuite() {
    return 'ECDH_P256+HKDF_SHA256+AES_256_GCM+HMAC_SHA256';
  }

  private parseClientRandom(clientRandomBase64: string): Buffer {
    try {
      const random = Buffer.from(clientRandomBase64, 'base64');
      if (random.length !== CHANNEL_RANDOM_LENGTH) {
        throw new Error('客户端随机数长度必须为 16 字节');
      }
      return random;
    } catch {
      throw new BusinessException(
        ErrorCode.SECURE_CHANNEL_INVALID,
        'clientRandom 格式无效（必须是 base64(16B)）',
        undefined,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private getKekOrThrow(): Buffer {
    const base64Value = (this.configService.get<string>('secure.kekBase64') || '').trim();
    if (!base64Value) {
      throw new InternalServerErrorException('服务端未配置 SECURE_KEK_BASE64');
    }

    const kek = Buffer.from(base64Value, 'base64');
    if (kek.length !== KEK_LENGTH) {
      throw new InternalServerErrorException('SECURE_KEK_BASE64 必须是 32 字节的 Base64 值');
    }

    return kek;
  }
}
