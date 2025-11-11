import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as admin from 'firebase-admin';
import { Plan, Role } from '@prisma/client';
import { CreateOrganizationDto, PlanDto } from './create-organization.dto';
import { BillingService } from 'src/billing/stripe.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private stripeS: BillingService
  ) { }

  async createOrganizationForUser(
    googleId: string,
    emailVerified: boolean,
    dto: CreateOrganizationDto
  ) {

    if (!emailVerified) {
      throw new ForbiddenException('email-not-verified');
    }

    // 1) resolve usuário local
    const user = await this.prisma.user.findUnique({ where: { googleId } });
    if (!user) {
      // você decidiu criar explicitamente no signup; mantemos isso aqui estrito
      throw new BadRequestException('user-not-provisioned');
    }
    if (user.organizationId) {
      throw new BadRequestException('user-already-has-organization');
    }

    if (dto.seats < 1) throw new BadRequestException('quantity-min-1');

    // 3) cria org + promove user a ADMIN, tudo em transação
    const [org, updatedUser] = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.name,
          plan: dto.plan,
          seatLimit: dto.seats,
        },
      });

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          role: Role.ADMIN,
          organizationId: org.id,
        },
      });

      return [org, updatedUser] as const;
    });

    const stripeSession = await this.stripeS.createCheckoutSessionForUser(user.email, org)

    // 4) seta claims no Firebase (role ADMIN + orgId)
    //    obs: preferimos usar claims como autoridade para autorização
    if (user.googleId) {
      const userRecord = await admin.auth().getUser(user.googleId);
      const currentCustomClaims = userRecord.customClaims || {};

      await admin.auth().setCustomUserClaims(user.googleId, {
        ...currentCustomClaims,
        role: 'ADMIN',
        org_id: org.id,
      });
    }

    // 5) retorna payload útil para o front (ele fará refreshClaims())
    return {
      organization: {
        id: org.id,
        name: org.name,
        plan: org.plan,
        seatLimit: org.seatLimit,
      },
      user: {
        id: updatedUser.id,
        role: updatedUser.role, // ADMIN
        organizationId: updatedUser.organizationId,
      },
      session: stripeSession,
      // auth.refreshClaims() após receber este 200
      claimsUpdated: true,
    };
  }

  async getMyOrg(firebaseUser) {
    const user = await this.prisma.user.findUnique({
      where: {
        googleId: firebaseUser.uid
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            plan: true,
            seatLimit: true,
            stripeCustomerId: true,
            stripeSubscriptionId: true,
            users: {
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                picture: true,
              },
              orderBy: { name: 'asc' }
            },
          },
        },
      }
    });

    if (!user) {
      throw new BadRequestException('user-not-provisioned');
    }

    if (user.organization?.id !== firebaseUser.org_id) {
      throw new BadRequestException('organization-does-not-match');
    }

    const pm = await this.stripeS.getPaymentInfoForOrg(user.organization)

    return { ...user.organization, paymentInfo: pm }
  }

  async checkIfExists(id: string) {
    const res = await this.prisma.organization.findFirst({ where: { id } })

    return {
      exists: !!res,
      name: res?.name
    }
  }
}