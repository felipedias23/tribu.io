import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { TrimToNull } from '../../companies/dto/company-fields';
import { TaxRegime } from '../../generated/prisma/enums';

/** As 27 UFs (o mesmo CHECK está na migration). */
// prettier-ignore
export const STATES = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;

/** Valor em reais: até 13 dígitos inteiros e 2 decimais, nunca negativo. */
const MONEY = /^\d{1,13}(\.\d{1,2})?$/;
// Sem exemplo de formato: o frontend aceita "150.000,00" e envia "150000.00".
const MONEY_MESSAGE =
  'Informe um valor em reais, não negativo, com até 2 casas decimais.';

/** Remove a máscara (6201-5/01 → 6201501); texto vazio passa a null. */
const NormalizeCnae = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const digits = value.replace(/[\s./-]/g, '');
    return digits === '' ? null : digits;
  });

/** Aceita número ou texto; guarda texto para não perder precisão. */
const ToMoneyString = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string')
      return value.trim() === '' ? null : value.trim();
    return value;
  });

const UpperTrimToNull = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim().toUpperCase();
    return trimmed === '' ? null : trimmed;
  });

/**
 * Perfil completo. Campo omitido ou null fica como dado ausente (D20): o
 * sistema nunca o substitui por zero.
 */
export class PutTaxProfileDto {
  @ApiPropertyOptional({
    enum: TaxRegime,
    enumName: 'TaxRegime',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(TaxRegime, {
    message:
      'Regime inválido. Use SIMPLES_NACIONAL, LUCRO_PRESUMIDO ou LUCRO_REAL.',
  })
  taxRegime?: TaxRegime | null;

  @ApiPropertyOptional({
    example: '6201-5/01',
    nullable: true,
    description: 'Com ou sem máscara.',
  })
  @IsOptional()
  @NormalizeCnae()
  @Matches(/^\d{7}$/, {
    message: 'O CNAE deve ter 7 dígitos (ex.: 6201-5/01).',
  })
  cnae?: string | null;

  @ApiPropertyOptional({ example: 'São Paulo', maxLength: 100, nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsString({ message: 'O município deve ser um texto.' })
  @MaxLength(100, { message: 'O município deve ter no máximo 100 caracteres.' })
  city?: string | null;

  @ApiPropertyOptional({ enum: STATES, example: 'SP', nullable: true })
  @IsOptional()
  @UpperTrimToNull()
  @IsIn(STATES, { message: 'Informe a sigla de uma UF (ex.: SP).' })
  state?: string | null;

  @ApiPropertyOptional({
    example: '1200000.00',
    nullable: true,
    description: 'RBT12.',
  })
  @IsOptional()
  @ToMoneyString()
  @Matches(MONEY, { message: MONEY_MESSAGE })
  revenue12m?: string | null;

  @ApiPropertyOptional({ example: '360000.00', nullable: true })
  @IsOptional()
  @ToMoneyString()
  @Matches(MONEY, { message: MONEY_MESSAGE })
  payroll12m?: string | null;

  @ApiPropertyOptional({
    example: '2026-09',
    nullable: true,
    description: 'Mês (AAAA-MM).',
  })
  @IsOptional()
  @TrimToNull()
  // Anos de 1900 a 2099: o ano 0000 passava no formato e o banco recusava-o (500).
  @Matches(/^(19|20)\d{2}-(0[1-9]|1[0-2])$/, {
    message:
      'Informe o mês de referência no formato AAAA-MM, entre 1900 e 2099 (ex.: 2026-09).',
  })
  referencePeriod?: string | null;
}
