import { Controller, Post, Get, Body, Sse } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { BedrockService } from './bedrock.service';
import { InvokeModelDto, ModelResponse } from './dto/invoke-model.dto';

@ApiTags('bedrock')
@Controller('bedrock')
export class BedrockController {
  constructor(private readonly bedrockService: BedrockService) {}

  @Get('models')
  @ApiOperation({ summary: 'List available models' })
  @ApiResponse({
    status: 200,
    description: 'Returns list of available AWS Bedrock models',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
      },
    },
  })
  getModels() {
    return this.bedrockService.getModels();
  }

  @Post('invoke')
  @ApiOperation({ summary: 'Invoke model with prompt' })
  @ApiBody({ type: InvokeModelDto })
  @ApiResponse({
    status: 200,
    description: 'Model response with generated content',
    type: ModelResponse,
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 500, description: 'Model invocation failed' })
  async invoke(@Body() dto: InvokeModelDto): Promise<ModelResponse> {
    return this.bedrockService.invoke(dto);
  }

  @Post('stream')
  @Sse()
  @ApiOperation({ summary: 'Stream model response' })
  @ApiBody({ type: InvokeModelDto })
  @ApiResponse({
    status: 200,
    description: 'Server-sent events stream of model chunks',
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  async stream(@Body() dto: InvokeModelDto): Promise<Observable<MessageEvent>> {
    return new Observable((subscriber) => {
      (async () => {
        try {
          for await (const chunk of this.bedrockService.invokeStream(dto)) {
            subscriber.next({ data: chunk } as MessageEvent);
          }
          subscriber.complete();
        } catch (error) {
          subscriber.error(error);
        }
      })();
    });
  }
}
