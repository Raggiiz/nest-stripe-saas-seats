import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { FirebaseAuthGuard } from "src/auth/firebase/firebase-auth.guard";
import { BillingService } from "./stripe.service";
import { RolesGuard } from "src/auth/roles/roles.guard";
import { Roles } from "src/auth/roles/roles.decorator";
import { Plan, Role } from "@prisma/client";

@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('billing')
export class BillingController {

    constructor(private billingS: BillingService) { }

    @Get('verify')
    async verifyStripe(@Query('session_id') sessionId: string) {
        return await this.billingS.verifyCheckoutSession(sessionId);
    }

    @Post('portal')
    async getPortal(@Req() req: any) {
        const decoded = req.firebaseUser as { uid: string };
        return await this.billingS.createBillingPortalSessionForUser(decoded.uid);
    }

    @Post('update-subscription')
    async updateSsubscription(@Req() req: any, @Body() body: { plan?: Plan, seats?: number }) {
        const decoded = req.firebaseUser as { uid: string };
        return this.billingS.updateSubscriptionForOrg(decoded.uid, body.plan, body.seats);
    }
}