import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      message: 'Backend API is running',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  checkHealth() {
    return {
      status: 'healthy',
      uptime: process.uptime(),
    };
  }
}
