import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser, TenantId } from './authenticated-user';

/** Claims mínimos: o resto do contexto vem da base de dados. */
interface SessionPayload {
  sub: string;
  tv: number;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  issue(user: { id: string; tokenVersion: number }): Promise<string> {
    const payload: SessionPayload = { sub: user.id, tv: user.tokenVersion };
    return this.jwt.signAsync(payload);
  }

  /**
   * Devolve o utilizador da sessão, ou null se o token faltar, for inválido,
   * adulterado ou expirado, se o utilizador já não existir ou se a sessão foi
   * terminada (tokenVersion diferente).
   */
  async resolve(token: string | undefined): Promise<AuthenticatedUser | null> {
    if (!token) return null;

    let payload: Partial<SessionPayload>;
    try {
      payload = await this.jwt.verifyAsync<SessionPayload>(token);
    } catch {
      return null;
    }
    if (typeof payload.sub !== 'string' || typeof payload.tv !== 'number') {
      return null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        accountingFirmId: true,
        role: true,
        name: true,
        email: true,
        tokenVersion: true,
      },
    });
    if (!user || user.tokenVersion !== payload.tv) return null;

    return {
      id: user.id,
      accountingFirmId: user.accountingFirmId as TenantId,
      role: user.role,
      name: user.name,
      email: user.email,
    };
  }
}
