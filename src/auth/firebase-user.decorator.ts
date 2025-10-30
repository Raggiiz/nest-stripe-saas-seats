import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const FirebaseUser = createParamDecorator((_data, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return req.firebaseUser as {
    uid: string;
    email?: string;
    name?: string;
    picture?: string;
    [k: string]: any;
  };
});