import { Module, Global } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Global()
@Module({
  providers: [
    {
      provide: 'FIREBASE_ADMIN',
      useFactory: () => {
        const raw = process.env.FIREBASE_ADMIN_CREDENTIALS;
        if (raw) {
          const creds = JSON.parse(raw);
          if (!admin.apps.length) {
            admin.initializeApp({
              credential: admin.credential.cert(creds),
            });
          }
          return admin;
        }
      },
    },
  ],
  exports: ['FIREBASE_ADMIN'],
})
export class FirebaseAdminModule {}