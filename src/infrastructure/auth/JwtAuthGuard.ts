import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

const IS_PUBLIC = Symbol('IS_PUBLIC');
const BEARER = /^Bearer (\S+)$/;

export const Public = (): ClassDecorator & MethodDecorator => SetMetadata(IS_PUBLIC, true);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  public constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (token === undefined) {
      throw new UnauthorizedException('A Bearer token is required');
    }
    const payload = await this.jwt.verifyAsync<{ sub?: unknown }>(token, { algorithms: ['HS256'] }).catch(() => {
      throw new UnauthorizedException('The token is invalid or expired');
    });
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new UnauthorizedException('The token must name its subject');
    }
    return true;
  }
}
