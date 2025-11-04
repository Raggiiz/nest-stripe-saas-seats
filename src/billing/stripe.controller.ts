import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { FirebaseAuthGuard } from "src/auth/firebase-auth.guard";
import { BillingService } from "./stripe.service";
import { Plan } from "generated/prisma";

@Controller('billing')
export class BillingController {

    constructor(private billingS: BillingService) { }

    @UseGuards(FirebaseAuthGuard)
    @Get('verify')
    async verifyStripe(@Query('session_id') sessionId: string) {
        return await this.billingS.verifyCheckoutSession(sessionId);
    }

    @UseGuards(FirebaseAuthGuard)
    @Post('portal')
    async getPortal(@Req() req: any) {
        const decoded = req.firebaseUser as { uid: string };
        return await this.billingS.createBillingPortalSessionForUser(decoded.uid);
    }

    @UseGuards(FirebaseAuthGuard)
    @Post('update-plan')
    async updatePlan(@Req() req: any, @Body() body: { plan: Plan }) {
        const decoded = req.firebaseUser as { uid: string };
        return this.billingS.updatePlanForUser(decoded.uid, body.plan);
    }
}