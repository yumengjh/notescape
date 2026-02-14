/* eslint-disable @typescript-eslint/no-namespace */

export interface SecureRequestContext {
  enabled: true;
  channelId: string;
  userId: string;
  encKey: Buffer;
  macKey: Buffer;
  reqId: string;
  nonce: string;
  timestamp: number;
}

export interface SecureEnvelopeDto {
  v: number;
  iv: string;
  ciphertext: string;
  sig?: string;
}

export interface SecureDecryptedPayload {
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

declare global {
  namespace Express {
    interface Request {
      secureContext?: SecureRequestContext;
    }
  }
}
