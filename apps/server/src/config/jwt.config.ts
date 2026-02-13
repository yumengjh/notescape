import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  refreshSecret: process.env.REFRESH_TOKEN_SECRET || 'your-refresh-token-secret',
  refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
}));
