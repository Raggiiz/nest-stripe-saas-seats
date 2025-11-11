import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase/firebase-auth.guard';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './create-organization.dto';
import { RolesGuard } from 'src/auth/roles/roles.guard';
import { Role } from '@prisma/client';
import { Roles } from 'src/auth/roles/roles.decorator';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgS: OrganizationsService) {}

  @UseGuards(FirebaseAuthGuard)
  @Post()
  async create(@Req() req, @Body() dto: CreateOrganizationDto) {
    // req.firebaseUser vem do guard (token verificado pelo Firebase)
    const firebaseUser = req.firebaseUser as { uid: string; email?: string; email_verified?: boolean };

    return this.orgS.createOrganizationForUser(
      firebaseUser.uid,
      // !!firebaseUser.email_verified,
      dto,
    );
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('my')
  async myOrg(@Req() req) {
    const firebaseUser = req.firebaseUser as { uid: string; org_id: string };

    return this.orgS.getMyOrg(firebaseUser)
  }

  @Get('exists/:orgId')
  async checkIfOrgExists(@Param('orgId') id: string) {
    return this.orgS.checkIfExists(id)
  }

}