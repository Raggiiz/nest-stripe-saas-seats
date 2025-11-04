import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { BillingService } from 'src/billing/stripe.service';

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, BillingService],
})
export class OrganizationsModule {}