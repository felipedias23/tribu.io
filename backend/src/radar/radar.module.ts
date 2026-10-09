import { Module } from '@nestjs/common';
import { TaxRulesModule } from '../tax-rules/tax-rules.module';
import { RadarController } from './radar.controller';
import { RadarService } from './radar.service';

@Module({
  imports: [TaxRulesModule],
  controllers: [RadarController],
  providers: [RadarService],
})
export class RadarModule {}
