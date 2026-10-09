import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { companyKeys, getCompany } from '../companies/api';
import { formatCnae, formatMoney, formatPeriod, REGIME_LABELS } from '../companies/taxProfileFormat';
import { fractionToPercent } from '../radar/format';
import { RadarStatusBadge } from '../radar/RadarStatusBadge';
import { ApiError } from '../shared/api/http';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle';
import { type Analysis, type AnalysisInput, analysisKeys, getAnalysis } from './api';
import styles from './Analyses.module.css';
import { ANALYSIS_STATUS_LABELS, FIELD_LABELS, formatDateTime, formatValidity } from './format';

const INPUT_FIELDS: { key: keyof AnalysisInput; label: string; format(value: never): ReactNode }[] = [
  { key: 'taxRegime', label: 'Regime tributário', format: (v) => REGIME_LABELS[v as keyof typeof REGIME_LABELS] },
  { key: 'cnae', label: 'CNAE principal', format: formatCnae },
  { key: 'revenue12m', label: 'Receita bruta (12 meses)', format: formatMoney },
  { key: 'payroll12m', label: 'Folha de pagamento (12 meses)', format: formatMoney },
  { key: 'referencePeriod', label: 'Mês de referência', format: formatPeriod },
  { key: 'fatorRSubject', label: 'Atividade sujeita ao Fator R', format: (v: boolean) => (v ? 'Sim' : 'Não') },
];

function Result({ analysis }: { analysis: Analysis }) {
  const { result, trace } = analysis;
  if (!result) {
    return (
      <div className={styles.notice}>
        <p>{trace.outcome.message ?? 'A análise não chegou a calcular o Fator R.'}</p>
        {trace.missing.length > 0 && (
          <p>Dados em falta: {trace.missing.map((field) => FIELD_LABELS[field]).join(', ')}.</p>
        )}
      </div>
    );
  }
  return (
    <dl className={`${styles.card} ${styles.details}`}>
      <div>
        <dt>Fator R</dt>
        <dd className={styles.highlight}>{fractionToPercent(result.fatorR)}</dd>
      </div>
      <div>
        <dt>Anexo</dt>
        <dd className={styles.highlight}>Anexo {result.annex}</dd>
      </div>
      <div>
        <dt>Alíquota efetiva</dt>
        <dd className={styles.highlight}>{fractionToPercent(result.effectiveRate)}</dd>
      </div>
      <div>
        <dt>Faixa de RBT12</dt>
        <dd>{result.bracket}.ª faixa</dd>
      </div>
      <div>
        <dt>Alíquota nominal</dt>
        <dd>{fractionToPercent(result.nominalRate)}</dd>
      </div>
      <div>
        <dt>Parcela a deduzir</dt>
        <dd>{formatMoney(result.deduction)}</dd>
      </div>
    </dl>
  );
}

/**
 * Explicação de uma análise (US11): o que foi identificado, com que dados,
 * com que regra e versão, o que faltou, que premissas e porque a empresa foi
 * sinalizada (definição do produto §12). Mostra sempre o que foi gravado na
 * execução, mesmo que o perfil ou a regra tenham mudado depois.
 */
export function AnalysisPage() {
  const { id = '' } = useParams();
  const { data: analysis, isPending, error } = useQuery({
    queryKey: analysisKeys.detail(id),
    queryFn: () => getAnalysis(id),
  });
  const { data: company } = useQuery({
    queryKey: companyKeys.detail(analysis?.companyId ?? ''),
    queryFn: () => getCompany(analysis!.companyId),
    enabled: !!analysis,
  });
  useDocumentTitle(company ? `Análise · ${company.legalName}` : 'Análise');

  const notFound = error instanceof ApiError && (error.status === 404 || error.status === 400);

  return (
    <section className={styles.page} aria-labelledby="page-title">
      {analysis && (
        <Link to={`/companies/${analysis.companyId}`} className={styles.back}>
          ← {company?.legalName ?? 'Empresa'}
        </Link>
      )}

      {isPending && <p role="status">A carregar análise…</p>}
      {notFound && (
        <>
          <h1 id="page-title" className={styles.title}>
            Análise não encontrada
          </h1>
          <p className={styles.empty}>A análise não existe ou não pertence ao seu escritório.</p>
        </>
      )}
      {error && !notFound && (
        <p role="alert" className={styles.alert}>
          {error.message}
        </p>
      )}

      {analysis && (
        <>
          <div>
            <h1 id="page-title" className={styles.title}>
              Análise do Fator R{company && ` · ${company.legalName}`}
            </h1>
            <p className={styles.meta}>
              {ANALYSIS_STATUS_LABELS[analysis.status]} · executada em {formatDateTime(analysis.executedAt)} por{' '}
              {analysis.executedBy.name}
            </p>
          </div>

          <Result analysis={analysis} />

          <section className={styles.section} aria-labelledby="signal-title">
            <h2 id="signal-title" className={styles.subtitle}>
              Sinal do Tax Radar
            </h2>
            <p>
              <RadarStatusBadge status={analysis.radarStatus} />
            </p>
            <ul className={styles.list}>
              {analysis.trace.reasons.map((reason) => (
                <li key={reason.code}>{reason.message}</li>
              ))}
            </ul>
            <p className={styles.hint}>
              Estado no momento da análise. Os sinais orientam o contador; não são decisões tributárias.
            </p>
          </section>

          {analysis.trace.steps.length > 0 && (
            <section className={styles.section} aria-labelledby="steps-title">
              <h2 id="steps-title" className={styles.subtitle}>
                Como foi calculado
              </h2>
              <ol className={styles.list}>
                {analysis.trace.steps.map((step) => (
                  <li key={step.code}>{step.description}</li>
                ))}
              </ol>
            </section>
          )}

          <section className={styles.section} aria-labelledby="input-title">
            <h2 id="input-title" className={styles.subtitle}>
              Dados usados
            </h2>
            <dl className={`${styles.card} ${styles.details}`}>
              {INPUT_FIELDS.map(({ key, label, format }) => {
                const value = analysis.input[key];
                // Análises anteriores à D33 não têm a elegibilidade: não se mostra.
                if (value === undefined) return null;
                return (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{value === null ? <span className={styles.missing}>Não informado</span> : format(value as never)}</dd>
                  </div>
                );
              })}
            </dl>
            <p className={styles.hint}>Cópia do perfil tributário no momento da análise.</p>
          </section>

          {analysis.trace.assumptions.length > 0 && (
            <section className={styles.section} aria-labelledby="assumptions-title">
              <h2 id="assumptions-title" className={styles.subtitle}>
                Premissas
              </h2>
              <ul className={styles.list}>
                {analysis.trace.assumptions.map((assumption) => (
                  <li key={assumption.code}>{assumption.description}</li>
                ))}
              </ul>
            </section>
          )}

          <section className={styles.section} aria-labelledby="rule-title">
            <h2 id="rule-title" className={styles.subtitle}>
              Regra aplicada
            </h2>
            {analysis.ruleVersion ? (
              <dl className={`${styles.card} ${styles.details}`}>
                <div>
                  <dt>Regra</dt>
                  <dd>
                    {analysis.ruleVersion.ruleName} ({analysis.ruleVersion.ruleCode})
                  </dd>
                </div>
                <div>
                  <dt>Versão</dt>
                  <dd>
                    {analysis.ruleVersion.version} · {analysis.ruleVersion.evaluatorKey}
                  </dd>
                </div>
                <div>
                  <dt>Vigência</dt>
                  <dd>{formatValidity(analysis.ruleVersion.validFrom, analysis.ruleVersion.validUntil)}</dd>
                </div>
                <div>
                  <dt>Base legal</dt>
                  <dd>{analysis.ruleVersion.source}</dd>
                </div>
                <div>
                  <dt>Checksum dos parâmetros</dt>
                  <dd className={styles.checksum}>{analysis.parametersChecksum}</dd>
                </div>
                <div>
                  <dt>Versão do Tax Engine</dt>
                  <dd>{analysis.engineVersion}</dd>
                </div>
              </dl>
            ) : (
              <p className={styles.empty}>Nenhuma versão da regra foi aplicada.</p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
