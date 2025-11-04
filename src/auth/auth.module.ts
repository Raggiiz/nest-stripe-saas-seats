import { Module } from '@nestjs/common';
import { FirebaseAdminModule } from './firebase-admin.module';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [FirebaseAdminModule],
  providers: [FirebaseAuthGuard, AuthService],
  controllers: [AuthController],
  exports: [FirebaseAuthGuard],
})
export class AuthModule {}