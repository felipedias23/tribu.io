import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, Role } from '../generated/prisma/client';
import { UnscopedPrismaService } from '../prisma/unscoped-prisma.service';
import type { AuthUserResponse } from './dto/auth-user.response';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { hashPassword, verifyPassword } from './password';
import { SessionService } from './session.service';

/** Campos públicos do utilizador; passwordHash e tokenVersion nunca saem. */
const AUTH_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  accountingFirm: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

export interface AuthResult {
  user: AuthUserResponse;
  token: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: UnscopedPrismaService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Cria o escritório e o primeiro utilizador como ADMIN. A escrita aninhada
   * do Prisma é uma única transação: se o utilizador falhar, o escritório
   * também não é criado.
   */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const passwordHash = await hashPassword(dto.password);

    let user: AuthUserResponse & { tokenVersion: number };
    try {
      // Unscoped (S5): o escritório ainda não existe.
      const firm = await this.prisma.accountingFirm.create({
        data: {
          name: dto.firmName,
          users: {
            create: {
              name: dto.name,
              email: dto.email,
              passwordHash,
              role: Role.ADMIN,
            },
          },
        },
        select: {
          users: { select: { ...AUTH_USER_SELECT, tokenVersion: true } },
        },
      });
      user = firm.users[0];
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Este email já está registado.');
      }
      throw error;
    }

    return this.startSession(user);
  }

  /** Mesmo erro e mesmo tempo de resposta para email inexistente ou password errada. */
  async login(dto: LoginDto): Promise<AuthResult> {
    // Unscoped (S5): o login recebe só email e password; o tenant ainda não é conhecido.
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { ...AUTH_USER_SELECT, passwordHash: true, tokenVersion: true },
    });

    const valid = await verifyPassword(
      user?.passwordHash ?? null,
      dto.password,
    );
    if (!user || !valid) {
      throw new UnauthorizedException('Email ou password incorretos.');
    }

    const { passwordHash, ...rest } = user;
    return this.startSession(rest);
  }

  /** Dados do utilizador autenticado, incluindo o nome do escritório. */
  async profile(userId: string): Promise<AuthUserResponse> {
    // Unscoped (S5): o id é o do utilizador da própria sessão.
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: AUTH_USER_SELECT,
    });
  }

  /**
   * Termina todas as sessões do utilizador (incrementa tokenVersion). Com
   * token inválido ou expirado não há nada a invalidar.
   */
  async logout(token: string | undefined): Promise<void> {
    const user = await this.sessions.resolve(token);
    if (!user) return;

    // Unscoped (S5): o id é o do utilizador da própria sessão.
    await this.prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  private async startSession({
    tokenVersion,
    ...user
  }: AuthUserResponse & { tokenVersion: number }): Promise<AuthResult> {
    const token = await this.sessions.issue({ id: user.id, tokenVersion });
    return { user, token };
  }
}
