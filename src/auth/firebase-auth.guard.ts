import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private readonly firebase: typeof admin) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearer(req);

    if (!token) throw new UnauthorizedException('Missing Authorization header');

    try {
      const decoded = await this.firebase.auth().verifyIdToken(token, true /* checkRevoked */);
      // Anexa o usuário do Firebase no request
      (req as any).firebaseUser = decoded;
      return true;
    } catch (err) {
      throw new UnauthorizedException('Invalid or revoked Firebase ID token');
    }
  }

  private extractBearer(req: Request): string | null {
    const auth = req.headers.authorization || '';
    const [type, value] = auth.split(' ');
    return type?.toLowerCase() === 'bearer' && value ? value : null;
  }
}