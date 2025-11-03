import { Module } from '@nestjs/common';
import { FirebaseAdminModule } from './firebase-admin.module';
import * as admin from 'firebase-admin';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { AuthController } from './auth.controller';

@Module({
  imports: [FirebaseAdminModule],
  providers: [FirebaseAuthGuard],
  controllers: [AuthController],
  exports: [FirebaseAuthGuard],
})
export class AuthModule {}