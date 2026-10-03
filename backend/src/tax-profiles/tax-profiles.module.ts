import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { TaxProfilesController } from './tax-profiles.controller';
import { TaxProfilesService } from './tax-profiles.service';

@Module({
  imports: [CompaniesModule],
  controllers: [TaxProfilesController],
  providers: [TaxProfilesService],
})
export class TaxProfilesModule {}
