import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Dispensa a autenticação. Todas as outras rotas exigem sessão. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
