import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    // Lê os roles permitidos do decorator
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>('roles', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user || req.firebaseUser;

    if (!user) throw new ForbiddenException('no-user-in-request');

    const userRole = user.role || user.customClaims?.role;

    if (!requiredRoles.includes(userRole)) {
      throw new ForbiddenException(`role ${userRole} not authorized`);
    }

    return true;
  }
}