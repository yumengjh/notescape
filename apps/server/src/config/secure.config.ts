import { registerAs } from '@nestjs/config';

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
};

const parseIntWithDefault = (
  value: string | undefined,
  defaultValue: number,
  min: number,
): number => {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return defaultValue;
  }
  return Math.max(parsed, min);
};

const parsePathList = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

export default registerAs('secure', () => ({
  enabled: parseBoolean(process.env.SECURE_CHANNEL_ENABLED, false),
  force: parseBoolean(process.env.SECURE_CHANNEL_FORCE, false),
  channelTtlSeconds: parseIntWithDefault(process.env.SECURE_CHANNEL_TTL_SECONDS, 1800, 60),
  clockSkewMs: parseIntWithDefault(process.env.SECURE_CLOCK_SKEW_MS, 60000, 1000),
  replayTtlSeconds: parseIntWithDefault(process.env.SECURE_REPLAY_TTL_SECONDS, 120, 10),
  kekBase64: process.env.SECURE_KEK_BASE64 || '',
  openPaths: parsePathList(
    process.env.SECURE_OPEN_PATHS ||
      '/api/v1/auth/login,/api/v1/auth/register,/api/v1/auth/refresh,/api/v1/security/channel/init,/api/v1/assets/upload,/api/v1/assets/:assetId/file',
  ),
}));
