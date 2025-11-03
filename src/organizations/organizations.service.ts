import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as admin from 'firebase-admin';
import { Plan, Role } from '@prisma/client';
import { CreateOrganizationDto, PlanDto } from './create-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private seatLimitForPlan(plan: Plan | PlanDto) {
    switch (plan) {
      case 'ADVANCED': return 6;
      case 'PREMIUM':  return 9;
      case 'BASIC':
      default:         return 3;
    }
  }

  async createOrganizationForUser(params: {
    googleId: string;
    emailVerified: boolean;
    dto: CreateOrganizationDto;
  }) {
    const { googleId, emailVerified, dto } = params;
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

    // 2) normaliza plan
    // const plan = (dto.plan ?? 'BASIC') as Plan;
    const seatLimit = this.seatLimitForPlan(dto.plan);

    // 3) cria org + promove user a ADMIN, tudo em transação
    const [org, updatedUser] = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.name,
          plan: dto.plan,
          seatLimit,
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

    // 4) seta claims no Firebase (role ADMIN + orgId)
    //    obs: preferimos usar claims como autoridade para autorização
    if(user.googleId) {
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
      // dica para o front: chame auth.refreshClaims() após receber este 200
      claimsUpdated: true,
    };
  }

  async getMyOrg (firebaseUser) {
    const user = await this.prisma.user.findUnique({ 
      where: { 
        googleId: firebaseUser.uid 
      } ,
      include: {
        organization: {
        select: {
          id: true,
          name: true,
          plan: true,
          seatLimit: true,
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

    if(user.organization?.id !== firebaseUser.org_id) {
      throw new BadRequestException('organization-does-not-match');
    }
    return user.organization
  }

  async checkIfExists(id: string) {
    const res = await this.prisma.organization.findFirst({where: {id}})

    return {
      exists: !!res,
      name: res?.name
    }
  }
}