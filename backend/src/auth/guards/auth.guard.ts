import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../authenticated-user';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { readSessionCookie } from '../session-cookie';
import { SessionService } from '../session.service';

/** Guard global: toda rota exige sessão válida, exceto as marcadas @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.sessions.resolve(readSessionCookie(request));
    if (!user) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }
    request.user = user;
    return true;
  }
}
