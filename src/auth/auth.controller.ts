import { Body, Controller, ForbiddenException, NotFoundException, Post, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import * as admin from 'firebase-admin';
import { Role } from 'generated/prisma';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
    constructor(
        private readonly prisma: PrismaService,
        private authS: AuthService
    ) { }

    @UseGuards(FirebaseAuthGuard)
    @Post('signup')
    async sync(@Req() req: any) {
        const decoded = req.firebaseUser as { uid: string; email?: string; name?: string; picture?: string; email_verified?: boolean; };

        return await this.authS.signup(decoded)
    }

    @UseGuards(FirebaseAuthGuard)
    @Post('accept-invite')
    async acceptInvite(@Req() req: any, @Body() body: {orgId: string}) {
        const decoded = req.firebaseUser as { uid: string; email?: string; name?: string; picture?: string; email_verified?: boolean; };

        return await this.authS.acceptInvite(decoded, body)
    }
}