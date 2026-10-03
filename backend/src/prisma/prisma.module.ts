import { Global, Module } from '@nestjs/common';
import { createPrismaService, PrismaService } from './prisma.service';
import { UnscopedPrismaService } from './unscoped-prisma.service';

@Global()
@Module({
  providers: [
    UnscopedPrismaService,
    {
      provide: PrismaService,
      inject: [UnscopedPrismaService],
      useFactory: createPrismaService,
    },
  ],
  exports: [PrismaService, UnscopedPrismaService],
})
export class PrismaModule {}
