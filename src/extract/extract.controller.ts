import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { OperationsManager } from '../operations/operations.manager';
import { ExtractionWorker } from '../workers/extraction.worker';
import { ParserFactory } from '../parsers/parser.factory';
import { ExtractRequestBodyDto } from './dto/extract.dto';

/**
 * Response for extract endpoint
 */
interface ExtractResponse {
  operationId: string;
  status: string;
  createdAt: string;
  links: {
    self: string;
    cancel: string;
  };
}

@ApiTags('extract')
@Controller('extract')
export class ExtractController {
  constructor(
    private operationsManager: OperationsManager,
    private extractionWorker: ExtractionWorker,
    private parserFactory: ParserFactory,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
      },
    }),
  )
  @ApiOperation({
    summary: 'Initiate data extraction',
    description:
      'Upload a file and start the extraction process. Returns an operation ID for tracking.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'context'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'The file to process (CSV or Excel)',
        },
        sheetName: {
          type: 'string',
          description: 'Sheet name for Excel files (optional)',
        },
        context: {
          type: 'string',
          description: 'JSON string containing extraction context',
        },
      },
    },
  })
  @ApiResponse({
    status: 202,
    description: 'Extraction operation initiated',
    schema: {
      type: 'object',
      properties: {
        operationId: { type: 'string', example: 'op_abc123def456' },
        status: { type: 'string', example: 'pending' },
        createdAt: { type: 'string', format: 'date-time' },
        links: {
          type: 'object',
          properties: {
            self: { type: 'string', example: '/operations/op_abc123def456' },
            cancel: { type: 'string', example: '/operations/op_abc123def456/cancel' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request (missing file, invalid format, etc.)' })
  async extract(
    @UploadedFile() file: Express.Multer.File,
    @Body('sheetName') sheetName?: string,
    @Body('context') contextJson?: string,
  ): Promise<ExtractResponse> {
    // Validate file
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file format
    if (!this.parserFactory.isSupported(file.originalname)) {
      throw new BadRequestException(
        `Unsupported file format. Supported formats: ${this.parserFactory.getSupportedExtensions().join(', ')}`,
      );
    }

    // Parse context JSON
    if (!contextJson) {
      throw new BadRequestException('Context is required');
    }

    let context: ExtractRequestBodyDto['context'];
    try {
      context = JSON.parse(contextJson);
    } catch {
      throw new BadRequestException('Invalid context JSON');
    }

    // Validate context
    if (!context.description || !context.fields || context.fields.length === 0) {
      throw new BadRequestException(
        'Context must include a description and at least one field',
      );
    }

    // Create operation
    const operation = this.operationsManager.create({
      fileContent: file.buffer,
      filename: file.originalname,
      sheetName,
      context,
    });

    // Start background processing (fire-and-forget)
    void this.extractionWorker.processOperation(operation.operationId);

    return {
      operationId: operation.operationId,
      status: operation.status,
      createdAt: operation.createdAt.toISOString(),
      links: {
        self: `/operations/${operation.operationId}`,
        cancel: `/operations/${operation.operationId}/cancel`,
      },
    };
  }
}

