import { Module } from '@nestjs/common';
import { TaxRulesService } from './tax-rules.service';

@Module({
  providers: [TaxRulesService],
  exports: [TaxRulesService],
})
export class TaxRulesModule {}
