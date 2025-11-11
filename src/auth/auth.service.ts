import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import * as admin from 'firebase-admin';

@Injectable()
export class AuthService {
    constructor(private readonly prisma: PrismaService,) { }

    async signup(decoded) {
        // if (!decoded.email || decoded.email_verified === false) {
        //     throw new ForbiddenException('email-not-verified');
        // }

        const exists = await this.prisma.user.findUnique({ where: { googleId: decoded.uid } });
        if (exists) {
            throw new ConflictException('already_exists')
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

    async acceptInvite(decoded, body) {
        // if (!decoded.email || decoded.email_verified === false) {
        //     throw new ForbiddenException('email-not-verified');
        // }

        const exists = await this.prisma.user.findUnique({ where: { googleId: decoded.uid } });
        if (exists) {
            throw new ConflictException('already_exists')
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

    async removeUser(requesterId: string, targetUserId: string) {
        if (requesterId === targetUserId) {
            throw new BadRequestException('cannot-delete-yourself');
        }

        const [requester, target] = await Promise.all([
            this.prisma.user.findUnique({ where: { googleId: requesterId } }),
            this.prisma.user.findUnique({ where: { id: targetUserId } }),
        ]);

        if (!target) throw new NotFoundException('user-not-found');
        if (!requester) throw new ForbiddenException('requester-not-found');

        if (!requester.organizationId || requester.organizationId !== target.organizationId) {
            throw new ForbiddenException('different-organization');
        }
        // Admin não pode remover Admin
        if (target.role === Role.ADMIN) {
            throw new ForbiddenException('cannot-delete-admin');
        }

        await admin.auth().deleteUser(target.googleId as string).catch(() => {/* no-op */});
        await this.prisma.user.delete({ where: { id: target.id } });

        return { deleted: true }
    }
}