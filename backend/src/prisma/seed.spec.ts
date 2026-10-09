import { classify, RADAR_STATUSES } from '../radar/radar-classifier';
import { selectVersion } from '../tax-calculations/rule-version-selection';
import { FATOR_R_V2_VERSION } from '../tax-calculations/simples-fator-r-v1.fixture';
import {
  SEED_COMPANIES,
  SEED_FIRMS,
  SEED_TAX_PROFILES,
  validateSeedEnv,
} from './seed';

describe('validateSeedEnv', () => {
  const env = {
    DATABASE_URL: 'postgresql://tribu:outra-senha@db:5432/tribu',
    SEED_PASSWORD: 'change-me-demo-only',
  };

  it('aceita os valores de exemplo fora de produção', () => {
    expect(validateSeedEnv({ ...env, NODE_ENV: 'development' })).toMatchObject(
      env,
    );
  });

  it('em produção, recusa a password de exemplo antes de criar contas (D19)', () => {
    expect(() => validateSeedEnv({ ...env, NODE_ENV: 'production' })).toThrow(
      /SEED_PASSWORD: valor de exemplo/,
    );
  });
});

describe('dados do seed', () => {
  const v1 = {
    ...FATOR_R_V2_VERSION,
    status: 'PUBLISHED' as const,
    validFrom: new Date('2018-01-01'),
    validUntil: null,
  };

  it('cada escritório demonstra os 5 estados do Tax Radar (em 2026-10)', () => {
    for (const firm of SEED_FIRMS) {
      const statuses = SEED_COMPANIES.filter(
        (company) => company.accountingFirmId === firm.id,
      ).map((company) => {
        const profile = SEED_TAX_PROFILES.find(
          (p) => p.companyId === company.id,
        );
        const input = profile && {
          taxRegime: profile.taxRegime,
          cnae: profile.cnae,
          revenue12m: profile.revenue12m,
          payroll12m: profile.payroll12m,
          referencePeriod:
            profile.referencePeriod?.toISOString().slice(0, 7) ?? null,
          fatorRSubject: profile.fatorRSubject,
        };
        return classify({
          profile: input ?? null,
          ruleVersion: input?.referencePeriod
            ? selectVersion([v1], input.referencePeriod)
            : null,
          lastAnalysisRuleVersionId: null,
          currentPeriod: '2026-10',
        }).status;
      });

      expect(new Set(statuses)).toEqual(new Set(RADAR_STATUSES));
    }
  });

  it('tem cerca de 30 empresas fictícias, com CNPJ e id únicos', () => {
    expect(SEED_COMPANIES).toHaveLength(30);
    expect(new Set(SEED_COMPANIES.map((c) => c.cnpj)).size).toBe(30);
    expect(new Set(SEED_COMPANIES.map((c) => c.id)).size).toBe(30);
  });
});

describe('elegibilidade ao Fator R no seed (D33)', () => {
  it('cada escritório tem empresas com "sim", "não" e "não informado"', () => {
    for (const firm of SEED_FIRMS) {
      const values = new Set(
        SEED_TAX_PROFILES.filter(
          (p) =>
            p.accountingFirmId === firm.id &&
            p.taxRegime === 'SIMPLES_NACIONAL',
        ).map((p) => p.fatorRSubject),
      );
      expect(values).toEqual(new Set([true, false, null]));
    }
  });
});
