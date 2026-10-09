# Documentação do Tribu.io

Cada assunto tem **um único documento de referência**. Os outros documentos apontam para ele com um link em vez de repetir o conteúdo.

## Documentos e precedência

Em caso de divergência entre documentos, prevalece o que estiver mais acima na tabela.

| Ordem | Documento | Estado | Conteúdo |
|---|---|---|---|
| 1 | [regras-academicas.md](regras-academicas.md) | Vigente | Regras e plano semanal do projeto académico (definidos pelo professor) |
| 2 | [arquitetura-e-decisoes.md](arquitetura-e-decisoes.md) | Vigente | Arquitetura aprovada, modelo de dados, cronograma e registo de decisões (D1, D2, …) |
| 2 | [adr/0001-postgresql-prisma.md](adr/0001-postgresql-prisma.md) | Vigente | Justificação da escolha de PostgreSQL com Prisma |
| 3 | [modelo-dados.md](modelo-dados.md) | Vigente | Diagrama ER e restrições do modelo alvo do MVP |
| 3 | [user-stories.md](user-stories.md) | Vigente | Backlog do MVP com critérios de aceitação (cartões do Trello) |
| 3 | [seguranca.md](seguranca.md) | Vigente | Padrão de desenvolvimento seguro (regras S1–S27) |
| 3 | [autenticacao.md](autenticacao.md) | Vigente | Autenticação, sessão, tenant e papéis |
| 3 | [banco-de-dados.md](banco-de-dados.md) | Vigente | Estrutura atual do banco, migrations e seed |
| 3 | [frontend.md](frontend.md) | Vigente | Layout base, rotas, acessibilidade e sessão no frontend |
| 4 | [CLAUDE.md](CLAUDE.md) | Vigente | Diretrizes para o agente de desenvolvimento e Definition of Done |
| 5 | [definicao-do-produto.md](definicao-do-produto.md) | Referência | Especificação original do produto: visão, domínio e MVP |
| 6 | [instrucoes-fase-analise.md](instrucoes-fase-analise.md) | Histórico | Instruções da fase de análise, concluída em 2026-09-26 |

- **Vigente:** mantido atualizado; descreve o projeto como ele é.
- **Referência:** a visão original do produto. O modelo técnico foi refinado pelas decisões em [arquitetura-e-decisoes.md](arquitetura-e-decisoes.md).
- **Histórico:** registo de uma etapa concluída. Não é atualizado nem contém instruções em vigor.

## Como manter

1. Uma regra nova ou alterada é registada como decisão (Dxx) em [arquitetura-e-decisoes.md](arquitetura-e-decisoes.md).
2. No mesmo commit, atualiza-se o documento vigente do assunto (ex.: [seguranca.md](seguranca.md) para uma regra de segurança).
3. Os outros documentos apontam para essa fonte com um link; não copiam a regra.
4. Documentos de referência e históricos não são reescritos. Quando ficam desatualizados num ponto concreto, recebem uma nota que remete para a decisão correspondente.
