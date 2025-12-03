import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { BedrockModule } from './bedrock/bedrock.module';
import { ExamplesModule } from './examples/examples.module';
import awsConfig from './config/aws.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [awsConfig],
    }),
    BedrockModule,
    ExamplesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
