import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import databaseConfig from './database.config';
import jwtConfig from './jwt.config';
import appConfig from './app.config';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [databaseConfig, jwtConfig, appConfig],
    }),
  ],
})
export class ConfigModule {}
