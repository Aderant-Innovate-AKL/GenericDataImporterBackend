import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Enable CORS for development (allow any localhost port for flexibility)
  app.enableCors({
    origin: true, // In production, replace with specific origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  });

  // Setup Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Generic Data Importer API')
    .setDescription(
      'AI-powered data extraction service that intelligently maps source data to user-defined schemas using LLM-based field extraction.',
    )
    .setVersion('1.0')
    .addTag('extract', 'Data extraction endpoints')
    .addTag('operations', 'Operation status and management')
    .addTag('health', 'Health check endpoints')
    .addTag('bedrock', 'AWS Bedrock AI model endpoints (reference)')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Generic Data Importer API running on http://localhost:${port}`);
  console.log(`📚 Swagger documentation available at http://localhost:${port}/api`);
  console.log(`❤️  Health check available at http://localhost:${port}/health`);
}
bootstrap();
