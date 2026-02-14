import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import {
  SecureDecryptedPayload,
  SecureEnvelopeDto,
  SecureRequestContext,
} from '../types/secure-request-context.type';

const ENC_ALGORITHM = 'aes-256-gcm';

export const buildSecureRequestSignMaterial = (payload: {
  method: string;
  path: string;
  reqId: string;
  nonce: string;
  ts: string;
  iv: string;
  ciphertext: string;
}): string => {
  return [
    payload.method.toUpperCase(),
    payload.path,
    payload.reqId,
    payload.nonce,
    payload.ts,
    payload.iv,
    payload.ciphertext,
  ].join('\n');
};

export const buildSecureResponseSignMaterial = (payload: {
  channelId: string;
  iv: string;
  ciphertext: string;
}): string => {
  return [payload.channelId, payload.iv, payload.ciphertext].join('\n');
};

export const signWithMacKey = (macKey: Buffer, material: string): string => {
  return createHmac('sha256', macKey).update(material).digest('base64');
};

export const verifyWithMacKey = (
  macKey: Buffer,
  material: string,
  signatureBase64: string,
): boolean => {
  try {
    const expected = signWithMacKey(macKey, material);
    const receivedBuffer = Buffer.from(signatureBase64, 'base64');
    const expectedBuffer = Buffer.from(expected, 'base64');

    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(receivedBuffer, expectedBuffer);
  } catch {
    return false;
  }
};

export const encryptSecureEnvelope = (
  context: SecureRequestContext,
  plaintext: unknown,
): SecureEnvelopeDto & { sig: string } => {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENC_ALGORITHM, context.encKey, iv);
  const plaintextBuffer = Buffer.from(JSON.stringify(plaintext), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([encrypted, tag]).toString('base64');
  const ivBase64 = iv.toString('base64');
  const signMaterial = buildSecureResponseSignMaterial({
    channelId: context.channelId,
    iv: ivBase64,
    ciphertext,
  });

  return {
    v: 1,
    iv: ivBase64,
    ciphertext,
    sig: signWithMacKey(context.macKey, signMaterial),
  };
};

export const decryptSecureEnvelope = (
  context: SecureRequestContext,
  envelope: SecureEnvelopeDto,
): SecureDecryptedPayload => {
  const iv = Buffer.from(envelope.iv, 'base64');
  const cipherBuffer = Buffer.from(envelope.ciphertext, 'base64');
  if (cipherBuffer.length <= 16) {
    throw new Error('密文长度无效');
  }

  const encrypted = cipherBuffer.subarray(0, cipherBuffer.length - 16);
  const authTag = cipherBuffer.subarray(cipherBuffer.length - 16);
  const decipher = createDecipheriv(ENC_ALGORITHM, context.encKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as SecureDecryptedPayload;
};
