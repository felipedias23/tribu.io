import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthReport, HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** 200 com o banco disponível; 503 caso contrário. */
  @Get()
  async check(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthReport> {
    const report = await this.health.check();
    if (report.status !== 'ok') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }
}
