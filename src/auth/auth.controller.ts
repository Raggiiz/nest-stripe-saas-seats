import { Body, Controller, Delete, Param, Post, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from './firebase/firebase-auth.guard';
import { Role } from 'generated/prisma';
import { AuthService } from './auth.service';
import { Roles } from './roles/roles.decorator';
import { RolesGuard } from './roles/roles.guard';

@Controller('auth')
@UseGuards(FirebaseAuthGuard)
export class AuthController {
    constructor(private authS: AuthService) { }

    @Post('signup')
    async sync(@Req() req: any) {
        const decoded = req.firebaseUser as { uid: string; email?: string; name?: string; picture?: string; email_verified?: boolean; };

        return await this.authS.signup(decoded)
    }

    
    @Post('accept-invite')
    async acceptInvite(@Req() req: any, @Body() body: { orgId: string }) {
        const decoded = req.firebaseUser as { uid: string; email?: string; name?: string; picture?: string; email_verified?: boolean; };

        return await this.authS.acceptInvite(decoded, body)
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN, Role.SUPER_ADMIN)
    async removeUser(@Req() req: any, @Param('id') targetUserId: string) {
        const requesterId = req.firebaseUser.uid;
        console.log(requesterId, targetUserId)
        return this.authS.removeUser(requesterId,targetUserId);
    }
}