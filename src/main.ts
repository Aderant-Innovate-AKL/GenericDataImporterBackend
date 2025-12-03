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
    .setTitle('Hackathon NestJS Template')
    .setDescription(
      'NestJS backend template with AWS Bedrock AI integration. Perfect for hackathons and rapid prototyping.',
    )
    .setVersion('1.0')
    .addTag('bedrock', 'AWS Bedrock AI model endpoints')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Backend server running on http://localhost:${port}`);
  console.log(`📚 Swagger documentation available at http://localhost:${port}/api`);
}
bootstrap();
