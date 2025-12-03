import {
  Controller,
  Get,
  Post,
  Param,
  NotFoundException,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { OperationsManager } from './operations.manager';
import { OperationStatusResponse } from '../shared/types';

@ApiTags('operations')
@Controller('operations')
export class OperationsController {
  constructor(private operationsManager: OperationsManager) {}

  @Get(':operationId')
  @ApiOperation({
    summary: 'Get operation status',
    description:
      'Retrieve the current status of an extraction operation. Returns result when completed.',
  })
  @ApiParam({
    name: 'operationId',
    description: 'The operation ID returned from /extract',
    example: 'op_abc123def456',
  })
  @ApiResponse({
    status: 200,
    description: 'Operation status',
    schema: {
      type: 'object',
      properties: {
        operationId: { type: 'string' },
        status: {
          type: 'string',
          enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
        },
        createdAt: { type: 'string', format: 'date-time' },
        startedAt: { type: 'string', format: 'date-time' },
        completedAt: { type: 'string', format: 'date-time' },
        progress: {
          type: 'object',
          properties: {
            phase: { type: 'string', enum: ['parsing', 'discovery', 'extraction', 'mapping'] },
            currentStep: { type: 'string' },
            rowsProcessed: { type: 'number' },
            totalRows: { type: 'number' },
            percentComplete: { type: 'number' },
          },
        },
        result: {
          type: 'object',
          description: 'Present only when status is "completed"',
        },
        error: {
          type: 'object',
          description: 'Present only when status is "failed"',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Operation not found' })
  getOperation(@Param('operationId') operationId: string): OperationStatusResponse {
    try {
      const operation = this.operationsManager.get(operationId);

      // Build response - exclude internal fields like fileContent
      const response: OperationStatusResponse = {
        operationId: operation.operationId,
        status: operation.status,
        createdAt: operation.createdAt.toISOString(),
      };

      // Add optional timestamp fields
      if (operation.startedAt) {
        response.startedAt = operation.startedAt.toISOString();
      }
      if (operation.completedAt) {
        response.completedAt = operation.completedAt.toISOString();
      }
      if (operation.failedAt) {
        response.failedAt = operation.failedAt.toISOString();
      }
      if (operation.cancelledAt) {
        response.cancelledAt = operation.cancelledAt.toISOString();
      }

      // Add progress if processing
      if (operation.progress) {
        response.progress = operation.progress;
      }

      // Add result if completed
      if (operation.status === 'completed' && operation.result) {
        response.result = operation.result;
      }

      // Add error if failed
      if (operation.status === 'failed' && operation.error) {
        response.error = operation.error;
      }

      return response;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException(`Operation ${operationId} not found`);
    }
  }

  @Post(':operationId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel an operation',
    description: 'Cancel a pending or processing operation.',
  })
  @ApiParam({
    name: 'operationId',
    description: 'The operation ID to cancel',
    example: 'op_abc123def456',
  })
  @ApiResponse({
    status: 200,
    description: 'Operation cancelled',
    schema: {
      type: 'object',
      properties: {
        operationId: { type: 'string' },
        status: { type: 'string', example: 'cancelled' },
        cancelledAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Operation cannot be cancelled (already completed/failed)' })
  @ApiResponse({ status: 404, description: 'Operation not found' })
  cancelOperation(
    @Param('operationId') operationId: string,
  ): { operationId: string; status: string; cancelledAt: string } {
    try {
      // Check if operation can be cancelled
      if (!this.operationsManager.canCancel(operationId)) {
        const operation = this.operationsManager.get(operationId);
        throw new BadRequestException(
          `Cannot cancel operation in status '${operation.status}'. Only 'pending' or 'processing' operations can be cancelled.`,
        );
      }

      const operation = this.operationsManager.cancel(operationId);

      return {
        operationId: operation.operationId,
        status: operation.status,
        cancelledAt: operation.cancelledAt?.toISOString() || new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new NotFoundException(`Operation ${operationId} not found`);
    }
  }
}

