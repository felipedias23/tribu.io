import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { TaxRulesModule } from '../tax-rules/tax-rules.module';
import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';

@Module({
  imports: [CompaniesModule, TaxRulesModule],
  controllers: [AnalysesController],
  providers: [AnalysesService],
})
export class AnalysesModule {}
