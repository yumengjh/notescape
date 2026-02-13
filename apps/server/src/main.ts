import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { ConfigService } from '@nestjs/config';
import boxen from 'boxen';
import chalk from 'chalk';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const normalizePath = (path = '') => path.replace(/^\/+|\/+$/g, '');
  const joinPath = (...segments: Array<string | undefined>) =>
    segments
      .filter((segment): segment is string => Boolean(segment))
      .map((segment) => normalizePath(segment))
      .filter(Boolean)
      .join('/');

  const apiPrefix = normalizePath(configService.get<string>('app.apiPrefix') || 'api/v1');
  const swaggerEnabled = configService.get<boolean>('app.swaggerEnabled') ?? true;
  const configuredSwaggerPath = normalizePath(
    configService.get<string>('app.swaggerPath') || 'docs',
  );
  const swaggerPath = configuredSwaggerPath.startsWith(`${apiPrefix}/`)
    ? configuredSwaggerPath.slice(apiPrefix.length + 1)
    : configuredSwaggerPath;
  const port = configService.get<number>('app.port') || 5200;
  const swaggerUiPath = joinPath(apiPrefix, swaggerPath);
  const swaggerJsonPath = joinPath(apiPrefix, `${swaggerPath}-json`);

  // 全局前缀
  app.setGlobalPrefix(apiPrefix);

  // 跨域
  app.enableCors({
    origin: configService.get<string>('app.corsOrigin') || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // 全局管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // 全局过滤器
  app.useGlobalFilters(new HttpExceptionFilter());

  // 全局拦截器
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger 文档（可通过 SWAGGER_ENABLED 控制是否启用）
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('知识库 API')
      .setDescription('个人知识库系统 API 文档')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(swaggerPath, app, document, {
      useGlobalPrefix: true,
      jsonDocumentUrl: `${swaggerPath}-json`,
      yamlDocumentUrl: `${swaggerPath}-yaml`,
    });
  }

  await app.listen(port);

  const startupLines = [
    `${chalk.bold('Application')} ${chalk.green('RUNNING')}`,
    `${chalk.bold('Base URL')} ${chalk.cyan(`http://localhost:${port}`)}`,
    `${chalk.bold('API Prefix')} ${chalk.cyan(`/${apiPrefix}`)}`,
  ];

  if (swaggerEnabled) {
    startupLines.push(
      `${chalk.bold('Swagger UI')} ${chalk.cyan(`http://localhost:${port}/${swaggerUiPath}`)}`,
      `${chalk.bold('Swagger JSON')} ${chalk.cyan(`http://localhost:${port}/${swaggerJsonPath}`)}`,
    );
  }

  console.log(
    boxen(startupLines.join('\n'), {
      title: '🚀 Server Ready',
      titleAlignment: 'center',
      borderStyle: 'round',
      borderColor: 'green',
      padding: { top: 0, right: 1, bottom: 0, left: 1 },
      margin: { top: 1, bottom: 0, left: 0, right: 0 },
    }),
  );
}
bootstrap();
