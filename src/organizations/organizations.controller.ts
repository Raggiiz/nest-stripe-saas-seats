import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './create-organization.dto';

@Controller('organizations')

export class OrganizationsController {
  constructor(private readonly orgS: OrganizationsService) {}

  @UseGuards(FirebaseAuthGuard)
  @Post()
  async create(@Req() req, @Body() dto: CreateOrganizationDto) {
    // req.firebaseUser vem do guard (token verificado pelo Firebase)
    const firebaseUser = req.firebaseUser as { uid: string; email?: string; email_verified?: boolean };

    return this.orgS.createOrganizationForUser({
      googleId: firebaseUser.uid,
      emailVerified: !!firebaseUser.email_verified,
      dto,
    });
  }

  @UseGuards(FirebaseAuthGuard)
  @Get('my')
  async myOrg(@Req() req) {
    const firebaseUser = req.firebaseUser as { uid: string; org_id: string };

    return this.orgS.getMyOrg(firebaseUser)
  }

  @Get('exists/:orgId')
  async checkIfOrgExists(@Param('orgId') id: string) {
    console.log(id)
    return this.orgS.checkIfExists(id)
  }

}