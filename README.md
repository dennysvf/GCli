# GCli — Sistema de Gestão para Clínicas

![status](https://img.shields.io/badge/status-em%20planejamento-yellow)
![Next.js](https://img.shields.io/badge/Next.js-000000?logo=next.js&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)

Plataforma web para centralizar a rotina administrativa, operacional e de atendimento de clínicas: pacientes, agenda multiprofissional, prontuário, documentos, pacotes de sessões, financeiro e indicadores de gestão.

## Sobre o projeto

Clínicas de pequeno e médio porte costumam operar com planilhas, agendas de papel e WhatsApp espalhados entre recepção, profissionais e financeiro. O GCli propõe um único sistema que cobre o ciclo completo do atendimento — do agendamento ao prontuário, da cobrança ao fechamento de caixa — configurável para diferentes especialidades (médica, odontológica, fisioterapia, psicologia, estética, etc.) sem ser travado a um único modelo de negócio.

## O que este projeto demonstra

- **Levantamento de requisitos de ponta a ponta:** PRD completo com 15 funcionalidades, personas, objetivos com métricas de sucesso mensuráveis, histórias de usuário, critérios de aceitação e grafo de dependências com ondas de execução (o que pode ser construído em paralelo).
- **Modelagem de um domínio real e complexo:** agenda multi-recurso (profissional × sala × unidade) com regras de conflito, pacotes de sessões com saldo, prontuário com trava temporal e adendos, fluxo de LGPD (exportação e anonimização de dados).
- **Arquitetura pensada antes do código:** monólito modular com fronteiras verificadas por lint, isolamento por organização pronto para SaaS, autorização centralizada, auditoria transacional, restrições no banco contra agendamento duplo e 20 decisões registradas como ADRs.
- **Documentação como artefato de trabalho:** PRD e briefing mantidos em português e inglês, com rastreabilidade entre problema → funcionalidade → história de usuário → critério de aceitação.
- **Design system próprio:** identidade "Tinta e Papel" inspirada na ficha, no livro de agenda e no livro-caixa da clínica, com tokens prontos para implementação, contraste medido (WCAG 2.2 AA) e regras de conteúdo em pt-BR.

## Funcionalidades principais

- Autenticação e 4 perfis de acesso (Administrador, Gestor, Recepção, Profissional)
- Unidades, salas e catálogo de serviços configuráveis
- Agenda com verificação de conflito, encaixe e séries recorrentes
- Prontuário eletrônico com trava de edição e anexos
- Documentos gerados a partir de modelos (atestado, declaração, receituário)
- Cobrança, pagamentos parciais e pacotes de sessões pré-pagos
- Caixa diário por unidade e controle de despesas
- Painel de gestão e relatórios exportáveis (CSV/PDF)
- Log de auditoria e conformidade com a LGPD

Detalhamento completo de cada uma no PRD (seção 6).

## Stack

- **Aplicação:** Next.js (App Router) + TypeScript, em monólito modular
- **Dados:** PostgreSQL + Prisma
- **Tarefas em segundo plano:** pg-boss (fila no próprio PostgreSQL)
- **Autenticação:** Better Auth com sessões no banco e Argon2id
- **Interface:** React Server Components, Tailwind CSS, shadcn/ui, design system "Tinta e Papel"
- **Arquivos:** armazenamento compatível com S3 (Cloudflare R2 / MinIO)
- **Testes:** Vitest, Testcontainers, Playwright
- **Idioma da interface:** pt-BR · **Moeda:** BRL

## Documentação

| Documento                                       | Português                                                  | English                                              |
| ----------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| PRD (requisitos completos)                      | [docs/prd.pt-BR.md](docs/prd.pt-BR.md)                     | [docs/prd.en.md](docs/prd.en.md)                     |
| Arquitetura e diretrizes de engenharia          | [docs/architecture.pt-BR.md](docs/architecture.pt-BR.md)   | [docs/architecture.en.md](docs/architecture.en.md)   |
| Briefing do produto                             | [docs/briefing.pt-BR.md](docs/briefing.pt-BR.md)           | [docs/briefing.en.md](docs/briefing.en.md)           |
| Design system (identidade visual e interface)   | [docs/design-system.pt-BR.md](docs/design-system.pt-BR.md) | [docs/design-system.en.md](docs/design-system.en.md) |
| Diário de bordo (como o projeto foi construído) | [docs/build-log.pt-BR.md](docs/build-log.pt-BR.md)         | [docs/build-log.en.md](docs/build-log.en.md)         |

O PRD é a fonte de verdade sobre **o que** construir: escopo, funcionalidades (F01–F15), dependências entre elas e critérios de aceitação. O documento de arquitetura define **como** construir: monólito modular, camadas, segurança, performance, estratégia de testes, padrões de código e as decisões registradas como ADRs. O design system define **como a interface se parece e se comporta**: cores, tipografia, componentes, textos e acessibilidade.

## Estrutura do repositório

```
src/app/          Rotas Next.js (páginas, Server Actions, route handlers)
src/modules/      Módulos de negócio (identity, audit, ...), cada um com domain/application/infrastructure/ui
src/shared/       Núcleo compartilhado: banco, autorização, auditoria, eventos, e-mail, armazenamento
src/worker/       Processo worker (outbox, e-mails, manutenção)
prisma/           Schema e migrações
tests/            Integração (Testcontainers) e E2E (Playwright)
docs/             PRD, arquitetura, design system, specs, briefing e diário de bordo (pt-BR e en)
CLAUDE.md         Regras de engenharia resumidas para desenvolvimento assistido por IA
```

## Status e roadmap

- [x] Briefing e PRD completo
- [x] Arquitetura, diretrizes de engenharia e ADRs
- [x] F01 — Fundação, autenticação e controle de acesso (spec, plano e implementação)
- [x] F02 — Unidades e salas
- [x] F03 — Catálogo de serviços
- [x] Design system "Tinta e Papel" (documento e aplicação nas telas)
- [x] F04 — Profissionais e horários de atendimento
- [x] F05 — Cadastro de pacientes
- [x] F06 — Agenda e agendamentos
- [x] F16 — Internacionalização e perfis de país
- [x] F07 — Registro do atendimento clínico
- [x] F08 — Documentos do paciente
- [ ] F09 em diante, seguindo as ondas de execução do PRD
- [ ] Deploy de uma versão de demonstração

## Como rodar localmente

Pré-requisitos: Node.js 22+, npm 10+ e Docker.

```bash
npm install
cp .env.example .env          # defina BETTER_AUTH_SECRET
docker compose up -d          # PostgreSQL 18, SeaweedFS (S3) e Mailpit
npm run db:deploy
npm run setup:admin -- --org-name "Minha Clínica" --admin-name "Seu Nome" --admin-email voce@exemplo.com
npm run dev                   # http://localhost:3001
npm run dev:worker            # em outro terminal: envia os e-mails
npm run seed:demo             # opcional, depois de aceitar o convite: dados de demonstração
```

O convite do administrador chega no Mailpit (http://localhost:8025). Testes: `npm test`, `npm run test:integration` e `npm run test:e2e`. Para rodar tudo em contêineres: `docker compose --profile app up -d --build` (http://localhost:3000). O passo a passo completo está no [diário de bordo](docs/build-log.pt-BR.md#19-como-reproduzir-o-ambiente-do-zero).

### Ambientes: desenvolvimento e produção

- **`.env`** é o ambiente local (a partir de `.env.example`), usado por `npm run dev`, pelo worker, pelo Prisma e pelos scripts.
- **Produção não lê arquivo `.env`**: a aplicação e o worker recebem as variáveis dos _secrets_ da hospedagem. O `.dockerignore` deixa todos os `.env*` fora da imagem.
- **`.env.prod`** (a partir de `.env.prod.example`, ignorado pelo git) existe só para rodar, da sua máquina, os scripts de operação contra produção: `npm run setup:storage-cors:prod` e `npm run setup:admin:prod`. Os scripts mostram o destino (banco, bucket, URL) antes de gravar, e o CORS aceita `-- --dry-run`.
- Não use os nomes `.env.production` nem `.env.production.local`: o Next.js os carrega em todo `next build`, e um build local passaria a usar o banco e o bucket de produção.
