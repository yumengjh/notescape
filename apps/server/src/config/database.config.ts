import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'knowledge_base',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development',
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  migrationsRun: false,
  extra: {
    max: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
    min: parseInt(process.env.DB_MIN_CONNECTIONS || '5', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
}));
