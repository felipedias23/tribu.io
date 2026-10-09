-- Regra do Fator R, versão 2 (D33): os mesmos parâmetros da versão 1 (§3.4.1,
-- mesmo checksum), com o evaluator SIMPLES_FATOR_R@2, que exige a confirmação
-- de que a atividade está sujeita ao Fator R em vez de a presumir.
--
-- A versão 1 passa a SUPERSEDED (a única mudança que o trigger de
-- imutabilidade permite) e a versão 2 vale para o mesmo período: o EXCLUDE só
-- considera versões PUBLISHED. As análises feitas com a versão 1 continuam
-- ligadas a ela e o Radar mostra REVISAR_REGRA nessas empresas.

UPDATE "tax_rule_versions"
SET "status" = 'SUPERSEDED'
WHERE "id" = 'f0000000-0000-4000-8000-000000000101';

INSERT INTO "tax_rule_versions"
    ("id", "tax_rule_id", "version", "valid_from", "valid_until", "parameters",
     "source", "evaluator_key", "status", "checksum")
VALUES (
    'f0000000-0000-4000-8000-000000000102',
    'f0000000-0000-4000-8000-000000000001',
    2,
    DATE '2018-01-01',
    NULL,
    $json${
  "threshold": "0.28",
  "opportunityMargin": "0.03",
  "maxReferenceAgeMonths": 12,
  "revenueLimit": "4800000.00",
  "annexes": {
    "III": [
      {
        "upTo": "180000.00",
        "nominalRate": "0.06",
        "deduction": "0.00"
      },
      {
        "upTo": "360000.00",
        "nominalRate": "0.112",
        "deduction": "9360.00"
      },
      {
        "upTo": "720000.00",
        "nominalRate": "0.135",
        "deduction": "17640.00"
      },
      {
        "upTo": "1800000.00",
        "nominalRate": "0.16",
        "deduction": "35640.00"
      },
      {
        "upTo": "3600000.00",
        "nominalRate": "0.21",
        "deduction": "125640.00"
      },
      {
        "upTo": "4800000.00",
        "nominalRate": "0.33",
        "deduction": "648000.00"
      }
    ],
    "V": [
      {
        "upTo": "180000.00",
        "nominalRate": "0.155",
        "deduction": "0.00"
      },
      {
        "upTo": "360000.00",
        "nominalRate": "0.18",
        "deduction": "4500.00"
      },
      {
        "upTo": "720000.00",
        "nominalRate": "0.195",
        "deduction": "9900.00"
      },
      {
        "upTo": "1800000.00",
        "nominalRate": "0.205",
        "deduction": "17100.00"
      },
      {
        "upTo": "3600000.00",
        "nominalRate": "0.23",
        "deduction": "62100.00"
      },
      {
        "upTo": "4800000.00",
        "nominalRate": "0.305",
        "deduction": "540000.00"
      }
    ]
  }
}$json$::jsonb,
    'LC 123/2006, art. 18, §§ 1º-A, 5º-I, 5º-J, 5º-K e 5º-M; Anexos III e V (redação da LC 155/2016, vigência 01/01/2018)',
    'SIMPLES_FATOR_R@2',
    'PUBLISHED',
    'ad55d2d82ccc79544a1acc6380a4713436f5a59b9b2860777595d101716423a6'
);
