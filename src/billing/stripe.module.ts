import { Module } from '@nestjs/common';
import { BillingService } from 'src/billing/stripe.service';
import { BillingController } from './stripe.controller';

@Module({
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService]
})
export class BillingModule {}