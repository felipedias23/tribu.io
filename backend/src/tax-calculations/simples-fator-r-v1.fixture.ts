import type { FatorRParameters } from '../tax-rules/simples-fator-r.parameters';

/**
 * Parâmetros da versão 1 (§3.4.1), para os testes unitários do Tax Engine. O
 * teste e2e tax-rules confirma que a migration grava estes mesmos valores.
 */
export const FATOR_R_V1: FatorRParameters = {
  threshold: '0.28',
  opportunityMargin: '0.03',
  maxReferenceAgeMonths: 12,
  revenueLimit: '4800000.00',
  annexes: {
    III: [
      {
        upTo: '180000.00',
        nominalRate: '0.06',
        deduction: '0.00',
      },
      {
        upTo: '360000.00',
        nominalRate: '0.112',
        deduction: '9360.00',
      },
      {
        upTo: '720000.00',
        nominalRate: '0.135',
        deduction: '17640.00',
      },
      {
        upTo: '1800000.00',
        nominalRate: '0.16',
        deduction: '35640.00',
      },
      {
        upTo: '3600000.00',
        nominalRate: '0.21',
        deduction: '125640.00',
      },
      {
        upTo: '4800000.00',
        nominalRate: '0.33',
        deduction: '648000.00',
      },
    ],
    V: [
      {
        upTo: '180000.00',
        nominalRate: '0.155',
        deduction: '0.00',
      },
      {
        upTo: '360000.00',
        nominalRate: '0.18',
        deduction: '4500.00',
      },
      {
        upTo: '720000.00',
        nominalRate: '0.195',
        deduction: '9900.00',
      },
      {
        upTo: '1800000.00',
        nominalRate: '0.205',
        deduction: '17100.00',
      },
      {
        upTo: '3600000.00',
        nominalRate: '0.23',
        deduction: '62100.00',
      },
      {
        upTo: '4800000.00',
        nominalRate: '0.305',
        deduction: '540000.00',
      },
    ],
  },
};

/** Versão 1 como vem do banco, para o classificador do Radar. */
export const FATOR_R_V1_VERSION = {
  id: 'f0000000-0000-4000-8000-000000000101',
  version: 1,
  evaluatorKey: 'SIMPLES_FATOR_R@1',
  parameters: FATOR_R_V1,
};
