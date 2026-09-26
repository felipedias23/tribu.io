Regras gerais

Tem 8 semanas para entregar uma aplicação full-stack a funcionar, com pelo menos 3 serviços: front-end, back-end e base de dados.

## Semana 0 — obrigatório antes de começar

1. Criar o repositório (monorepo recomendado: `/frontend`, `/backend`, `/db` ou `/infra`).
2. Criar o quadro no Trello com as colunas Backlog · Sprint · Em curso · Em revisão · Feito.
3. Convidar diogo@dionamite.com como contribuidor do repositório e do quadro.
4. Enviar o nome da equipa, os membros e o projeto escolhido.

##

## Requisitos técnicos mínimos

- 3 serviços separados, cada um no seu container: front-end, API, base de dados.
- `docker compose up` arranca tudo numa máquina limpa, com dados de seed.
- Autenticação (registo, login, logout) com passwords em hash e sessões ou JWT.
- API REST documentada (Swagger/OpenAPI ou ficheiro `.http`/Postman no repo).
- Evolução da base de dados versionada: migrações para SQL ou scripts versionados de criação/alteração de coleções, validações e índices para MongoDB (nada de alterações manuais sem registo no repositório).
- Validação de dados no back-end e mensagens de erro claras no front-end.
- Testes: pelo menos 10 testes automatizados no back-end e 3 no front-end.
- CI no GitHub Actions: lint + testes em cada Pull Request.
- Deploy público (Render, Railway, Fly.io, VPS ou cloud à escolha).
- README com: descrição, arquitetura, como correr, contas de teste, screenshots.
- Front-end responsivo (telemóvel e desktop).

Stack livre. Sugestão: React ou Vue (Vite) · Node.js com Express ou NestJS · PostgreSQL com Prisma/Drizzle **ou MongoDB com Mongoose/driver oficial** · Docker Compose.

<aside>🗄️

**PostgreSQL e MongoDB são opções válidas nos projetos.** A equipa deve justificar a escolha e modelar os dados de acordo com a tecnologia: tabelas, relações e migrações em SQL; coleções, documentos, referências/embedding, validações e índices em MongoDB. Os requisitos funcionais, de segurança, testes, seeds e consistência mantêm-se.

</aside>

## Forma de trabalhar

- Cada funcionalidade nasce como cartão no Trello com critérios de aceitação.
- Nada entra na branch `main` sem Pull Request revisto por outro membro.
- Commits pequenos e com mensagens claras (sugestão: Conventional Commits).
- Todos os membros têm de ter commits em front-end e back-end.

Plano das 10 semanas

1 - Arranque e desenho - User stories no Trello, modelo de dados (diagrama ER para SQL ou diagrama de coleções/documentos para MongoDB), docker compose com os 3 serviços a responder "hello world"

2 - Fundações - Auth completa, evolução do esquema versionada, seeds, layout base do front-end. Checkpoint 1

3 - Núcleo I - Primeiras funcionalidades obrigatórias de ponta a ponta (BD → API → UI)

4 - Núcleo II - Metade das funcionalidades obrigatórias a funcionar. Checkpoint 2 (demo) 

5 - Tempo real e integrações - WebSockets, uploads, emails ou o que o vosso brief pedir

6 - Fecho do MVP - Todas as funcionalidades obrigatórias. Feature freeze 

7- Qualidade e deploy - Testes, CI verde, deploy público, acessibilidade básica, extras se houver tempo

8 - Entrega - Bugfix, README, vídeo de 3 min, apresentação final com demo ao vivo