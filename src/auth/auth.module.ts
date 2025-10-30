import { Module } from '@nestjs/common';
import { FirebaseAdminModule } from './firebase-admin.module';
import * as admin from 'firebase-admin';
import { FirebaseAuthGuard } from './firebase-auth.guard';

@Module({
  imports: [FirebaseAdminModule],
  providers: [
    {
      provide: FirebaseAuthGuard,
      useFactory: (firebase: typeof admin) => new FirebaseAuthGuard(firebase),
      inject: ['FIREBASE_ADMIN'],
    },
  ],
  exports: [FirebaseAuthGuard],
})
export class AuthModule {}