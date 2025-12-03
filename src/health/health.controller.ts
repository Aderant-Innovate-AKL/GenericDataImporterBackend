import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { OperationsStore } from '../operations/operations.store';

/**
 * Health check response
 */
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  operations?: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  private startTime = Date.now();

  constructor(private operationsStore: OperationsStore) {}

  @Get()
  @ApiOperation({
    summary: 'Health check',
    description: 'Returns the health status of the service',
  })
  @ApiResponse({
    status: 200,
    description: 'Service health status',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
        timestamp: { type: 'string', format: 'date-time' },
        version: { type: 'string' },
        uptime: { type: 'number', description: 'Uptime in seconds' },
        operations: {
          type: 'object',
          properties: {
            pending: { type: 'number' },
            processing: { type: 'number' },
            completed: { type: 'number' },
            failed: { type: 'number' },
            cancelled: { type: 'number' },
          },
        },
      },
    },
  })
  getHealth(): HealthResponse {
    const operationCounts = this.operationsStore.getCountByStatus();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      operations: operationCounts,
    };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness check',
    description: 'Returns whether the service is ready to accept requests',
  })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  getReady(): { ready: boolean } {
    return { ready: true };
  }

  @Get('live')
  @ApiOperation({
    summary: 'Liveness check',
    description: 'Returns whether the service is alive',
  })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  getLive(): { alive: boolean } {
    return { alive: true };
  }
}

