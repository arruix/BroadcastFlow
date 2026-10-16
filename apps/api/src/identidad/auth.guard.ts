import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { verifyJwt } from '../shared/crypto';
import { DomainException } from '../shared/domain';

export type AuthedRequest = Request & { userId: string; sessionId: string };

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const claims = verifyJwt(token);
    if (!claims?.sid || claims.purpose === 'enroll') throw new DomainException('token_invalid', 401);
    request.userId = claims.sub;
    request.sessionId = claims.sid;
    return true;
  }
}
