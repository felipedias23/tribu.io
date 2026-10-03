import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TenantId } from '../auth/authenticated-user';
import { Prisma, Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { UserResponse } from './dto/user.response';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
} satisfies Prisma.UserSelect;

/**
 * Toda consulta filtra pelo tenant recebido da sessão. Um utilizador de outro
 * escritório é tratado como inexistente (404), sem revelar que existe.
 */
@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list(tenantId: TenantId): Promise<UserResponse[]> {
    return this.prisma.user.findMany({
      where: { accountingFirmId: tenantId },
      select: USER_SELECT,
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });
  }

  update(
    tenantId: TenantId,
    userId: string,
    dto: UpdateUserDto,
  ): Promise<UserResponse> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, accountingFirmId: tenantId },
        select: { role: true },
      });
      if (!user) {
        throw new NotFoundException('Utilizador não encontrado.');
      }

      if (user.role === Role.ADMIN && dto.role && dto.role !== Role.ADMIN) {
        await this.ensureAnotherAdmin(tx, tenantId);
      }

      return tx.user.update({
        where: { id: userId, accountingFirmId: tenantId },
        data: { name: dto.name, role: dto.role },
        select: USER_SELECT,
      });
    });
  }

  /**
   * Bloqueia (FOR UPDATE) os ADMIN do escritório até ao fim da transação, para
   * que duas despromoções simultâneas não deixem o escritório sem ADMIN.
   */
  private async ensureAnotherAdmin(
    tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
    tenantId: TenantId,
  ): Promise<void> {
    const admins = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE accounting_firm_id = ${tenantId}::uuid AND role = 'ADMIN'
      FOR UPDATE`;
    if (admins.length <= 1) {
      throw new ConflictException(
        'O escritório precisa de pelo menos um ADMIN.',
      );
    }
  }
}
