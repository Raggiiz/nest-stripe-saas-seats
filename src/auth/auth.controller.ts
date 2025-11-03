import { Body, Controller, ForbiddenException, NotFoundException, Post, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import * as admin from 'firebase-admin';
import { Role } from 'generated/prisma';

@Controller('auth')
export class AuthController {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    @UseGuards(FirebaseAuthGuard)
    @Post('signup')
    async sync(@Req() req: any) {
        const decoded = req.firebaseUser as { uid: string; email?: string; name?: string; picture?: string; email_verified?: boolean; };

        if (!decoded.email || decoded.email_verified === false) {
            return { error: 'email_not_verified' };
        }

        
        const exists = await this.prisma.user.findUnique({ where: { googleId: decoded.uid } });
        if (exists) {
            return { error: 'already_exists', userId: exists.id }; // 200 com erro sem criar (ou use 409 se preferir)
        }

        const user = await this.prisma.user.create({
            data: {
                googleId: decoded.uid,
                email: decoded?.email ?? '',
                name: decoded.name ?? null,
                picture: decoded.picture ?? null,
                role: Role.ADMIN
            },
        });

        await admin.auth().setCustomUserClaims(decoded.uid, { role: 'ADMIN', platform_user_id: user.id });

        return user;
    }

    @UseGuards(FirebaseAuthGuard)
    @Post('accept-invite')
    async acceptInvite(@Req() req: any, @Body() body: {orgId: string}) {
        const decoded = req.firebaseUser as { uid: string; email?: string; name?: string; picture?: string; email_verified?: boolean; };

        console.log(body)

        if (!decoded.email || decoded.email_verified === false) {
            return { error: 'email_not_verified' };
        }

        
        const exists = await this.prisma.user.findUnique({ where: { googleId: decoded.uid } });
        if (exists) {
            return { error: 'already_exists', userId: exists.id };
        }

        // 1) seat limit
        const org = await this.prisma.organization.findUnique({
            where: { id: body.orgId },
            select: { seatLimit: true, _count: { select: { users: true } } },
        });
        if (!org) throw new NotFoundException('org-not-found');
        if (org._count.users >= org.seatLimit) throw new ForbiddenException('seat-limit-reached');
        

        const user = await this.prisma.user.create({
            data: {
                googleId: decoded.uid,
                email: decoded?.email ?? '',
                name: decoded.name ?? null,
                picture: decoded.picture ?? null,
                role: Role.USER,
                organization: { connect: { id: body.orgId } },
            },
        });

        await admin.auth().setCustomUserClaims(decoded.uid, { role: 'USER', platform_user_id: user.id, org_id: body.orgId });

        return user;
    }
}