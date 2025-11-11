import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const FirebaseUser = createParamDecorator((_data, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return req.firebaseUser
});