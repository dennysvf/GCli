# Diário de bordo — como o GCli foi construído

Este diário registra, em ordem, tudo o que foi feito no projeto desde a leitura do briefing até a implementação da primeira funcionalidade (F01). A ideia é que qualquer pessoa consiga **entender as decisões** e **repetir o processo** em outro projeto.

O trabalho foi feito em dupla: uma pessoa responsável pelo produto e um assistente de programação com IA. A pessoa respondeu perguntas, tomou as decisões de negócio e aprovou cada etapa; o assistente conduziu entrevistas, escreveu documentos e código, rodou os testes e registrou o que encontrou pelo caminho.

> **Resumo do caminho:** briefing → entrevista → PRD → documentação bilíngue → repositório público → arquitetura e ADRs → especificação técnica e plano da F01 → implementação em 6 etapas, com testes e commit a cada etapa.

English version: [build-log.en.md](build-log.en.md).

---

## Sumário

1. [Ponto de partida: o briefing](#1-ponto-de-partida-o-briefing)
2. [O PRD: entrevista antes de escrever](#2-o-prd-entrevista-antes-de-escrever)
3. [Documentação em dois idiomas](#3-documentação-em-dois-idiomas)
4. [Repositório público no GitHub](#4-repositório-público-no-github)
5. [Arquitetura antes do código](#5-arquitetura-antes-do-código)
6. [Especificação técnica e plano da F01](#6-especificação-técnica-e-plano-da-f01)
7. [Implementação da F01, etapa por etapa](#7-implementação-da-f01-etapa-por-etapa)
8. [Problemas encontrados e como foram resolvidos](#8-problemas-encontrados-e-como-foram-resolvidos)
9. [Como reproduzir o ambiente do zero](#9-como-reproduzir-o-ambiente-do-zero)
10. [Lições aprendidas](#10-lições-aprendidas)

---

## 1. Ponto de partida: o briefing

O projeto começou com um único arquivo: um briefing em português (hoje em [briefing.pt-BR.md](briefing.pt-BR.md)) descrevendo uma plataforma de gestão para clínicas: pacientes, agenda, profissionais, serviços, financeiro e painel de gestão.

O briefing dizia **o que** a clínica queria, mas deixava abertas perguntas decisivas: é um sistema para uma clínica ou para várias? Quantas unidades? Quem pode ver o prontuário? O financeiro inclui despesas?

**Primeira lição:** um briefing não é um requisito. Antes de escrever qualquer documento técnico, é preciso transformar intenções em decisões.

---

## 2. O PRD: entrevista antes de escrever

### 2.1 Leitura e contexto

Antes da entrevista, foram levantados:

- **O entendimento do produto**, resumido em uma frase e confirmado com a pessoa responsável.
- **O contexto do repositório.** Havia só o briefing e um arquivo de configuração do editor, que indicava Next.js na porta 3001 e Prisma. Isso já apontava a stack.

### 2.2 A entrevista (uma pergunta por vez)

Em vez de escrever o PRD direto a partir do briefing, foi feita uma entrevista estruturada. Cada pergunta vinha com opções e uma recomendação justificada, e só uma pergunta era feita por vez, porque cada resposta muda as próximas. As decisões foram:

| Pergunta | Decisão |
|---|---|
| Uma clínica ou várias (SaaS)? | Uma clínica na V1, mas com o modelo de dados **pronto para SaaS** (toda tabela com `organizationId`) |
| Quantas unidades? | **Várias unidades já na V1** |
| Quais perfis de acesso? | **4 perfis fixos**: Administrador, Gestor, Recepção, Profissional |
| Profundidade do prontuário? | **Evolução em texto livre + anexos**, travada 24 horas após a criação (depois disso, só adendos) |
| Quem agenda? | **Só a equipe interna** (sem portal do paciente) |
| Escopo do financeiro? | **Recebimentos + despesas**, com caixa diário por unidade |
| Pacotes e recorrência? | **Ambos** |
| LGPD e auditoria? | **Log de auditoria + LGPD básico** (consentimento, exportação e anonimização) |
| Documentos? | **Upload + modelos imprimíveis** (atestado, declaração, receituário) |
| Relatórios? | **Painel + relatórios em CSV e PDF** |
| Porte da clínica? | **Pequena/média**: até 5 unidades, 50 profissionais, 500 atendimentos/dia, 100 mil pacientes |

No fim, a entrevista foi resumida num único parágrafo, confirmado antes de escrever.

### 2.3 A estrutura do PRD

O PRD ([prd.pt-BR.md](prd.pt-BR.md) / [prd.en.md](prd.en.md)) tem exatamente 9 seções:

1. Resumo executivo
2. Problema e oportunidade
3. Público-alvo (personas)
4. Objetivos e métricas de sucesso, **sempre com números**
5. Histórias de usuário, agrupadas por funcionalidade
6. Funcionalidades (F01 a F15), cada uma com capacidades, experiência, tratamento de erros e o que **consome** e **fornece** para as outras
7. Fora do escopo
8. Grafo de dependências, com prioridades, **ondas de execução** (o que pode ser construído em paralelo) e diagrama Mermaid
9. Critérios de aceitação verificáveis, incluindo critérios de **integração entre funcionalidades**

Três práticas fizeram diferença:

- **IDs de funcionalidade (F01…F15)**, usados de ponta a ponta: nas histórias, nos critérios, nos commits e nos nomes dos testes.
- **"Consome / Fornece"**: cada funcionalidade declara quais dados recebe de outras e quais entrega. Isso gera, de forma mecânica, o grafo de dependências e os testes de integração.
- **Checklist de validação antes de salvar**: cada funcionalidade tem histórias, critérios e aparece no grafo; o grafo não tem ciclos; toda dependência declarada aparece no diagrama.

Algumas regras foram inferidas e ficaram sinalizadas para revisão. Por exemplo: a cobrança é gerada no check-in, e descontos acima de 20% exigem aprovação do gestor.

---

## 3. Documentação em dois idiomas

Como o projeto será aberto, o PRD e o briefing foram traduzidos para o inglês. A organização final ficou assim:

```
README.md                  ← cartão de visita do projeto (não o briefing)
docs/
  briefing.pt-BR.md / .en.md
  prd.pt-BR.md / .en.md
```

**Por que separar README e briefing?** O README é a vitrine técnica do repositório: o que é o projeto, stack, status e como rodar. O briefing é contexto de negócio. Misturar os dois deixa ambos piores.

**Detalhe do Windows:** o sistema de arquivos não diferencia maiúsculas de minúsculas, então `README.md` e `Readme.md` não podem coexistir. Por isso as versões de idioma usam os sufixos `.pt-BR` e `.en`.

---

## 4. Repositório público no GitHub

Passos executados:

1. **`.gitignore`** criado antes do primeiro commit, excluindo a pasta de configuração local do editor (`.claude/`), `node_modules`, `.env`, etc.
2. **GitHub CLI instalado** (`winget install --id GitHub.cli -e --source winget`).
3. **Autenticação pelo navegador**: `gh auth login --hostname github.com --git-protocol https --web`. O comando mostra um código de uso único, que a pessoa digita em `github.com/login/device`.
4. **Primeiro commit** na branch `main`, revisando com `git status` o que entraria (nenhum segredo, nenhuma pasta local).
5. **Criação do repositório público e push**: `gh repo create GCli --public --source=. --remote=origin --push`.

**Problema:** o push falhou com `SSL certificate problem: unable to get local issuer certificate`. **Causa:** o Git para Windows usa o repositório de certificados do OpenSSL, que não reconhecia o certificado apresentado pela rede. **Solução:** `git config --global http.sslbackend schannel`, que faz o Git usar o repositório de certificados do Windows. Mais adiante descobrimos a causa raiz (ver [seção 8](#8-problemas-encontrados-e-como-foram-resolvidos)).

---

## 5. Arquitetura antes do código

Com o PRD pronto, surgiu a pergunta: *"já devemos pensar em boas práticas, padrões, segurança, performance, SOLID?"*

A resposta foi dividir as responsabilidades:

| Assunto | Onde fica |
|---|---|
| Segurança, performance e escala **como requisito** (números) | PRD |
| Padrões arquiteturais, infraestrutura, isolamento por organização | Documento de arquitetura + ADRs |
| SOLID, clean code, design patterns, testes | Diretrizes de engenharia + `CLAUDE.md` |

O PRD diz **o quê** e **quanto**; a arquitetura diz **como**. O documento [architecture.pt-BR.md](architecture.pt-BR.md) / [architecture.en.md](architecture.en.md) registrou:

- **Monólito modular:** um módulo por área de negócio, com fronteiras verificadas por lint. Microsserviços seriam exagero para o porte.
- **Módulos de dois tipos:** "ricos" (agenda, financeiro, prontuário), com domínio puro e repositórios; e "simples" (cadastros), com acesso direto ao Prisma. Nada de cerimônia onde não há regra.
- **Isolamento por organização** automático, com um cliente Prisma "com escopo".
- **Autorização centralizada** (matriz de perfis em código) e **auditoria na mesma transação** da alteração.
- **Eventos de domínio + outbox transacional** para desacoplar módulos sem perder mensagens.
- **Fila no próprio PostgreSQL** (pg-boss), sem Redis.
- **Restrições no banco** contra agendamento duplo (exclusion constraint).
- **Estratégia de testes**: unitários no domínio, integração com PostgreSQL real e E2E nas jornadas críticas.
- **Design patterns só onde o PRD mostra o problema**: State para status, Strategy para regras de conflito, Outbox, Specification. Também uma lista explícita do que **não** usar (repositório genérico sobre o ORM, contêiner de injeção de dependência, event sourcing).

Cada decisão virou um **ADR** (Architecture Decision Record): decisão, porquê e contrapartida. A regra é nunca editar um ADR antigo; quando algo muda, cria-se um novo ADR que o refina. Hoje são 18.

Também foi criado um `CLAUDE.md` na raiz: um resumo das regras em inglês, lido pelo assistente de IA antes de gerar código, para que todo código novo siga as mesmas convenções.

---

## 6. Especificação técnica e plano da F01

### 6.1 Por que começar pela F01

O grafo de dependências do PRD mostra que a F01 (fundação da plataforma, autenticação e controle de acesso) é a única "funcionalidade de fundação": todas as outras dependem dela. Num projeto sem código, ela tem de vir primeiro.

### 6.2 A entrevista técnica

Como na etapa do PRD, as dúvidas foram resolvidas uma por vez, sempre com uma recomendação. Só se perguntou o que o PRD e a arquitetura não respondiam:

| Decisão | Resultado |
|---|---|
| Biblioteca de autenticação ou módulo próprio? | **Better Auth, customizado**. A rota HTTP genérica dele não é exposta; tudo passa pelos nossos casos de uso |
| Como nasce o primeiro administrador? | **Comando de terminal** `npm run setup:admin` (um assistente web aberto permitiria que o primeiro visitante virasse administrador) |
| Como enviar e-mails? | **SMTP genérico + Mailpit** no ambiente local |
| O que mais entra na fundação? | **CI, testes E2E, Sentry e Dependabot** |
| Idioma das URLs? | **Inglês** (`/settings/users`); a interface continua em pt-BR |

Antes de escrever, as **versões atuais das bibliotecas** foram conferidas no npm (`npm view <pacote> version`). A especificação cita versões reais, não versões lembradas.

### 6.3 Os dois documentos

- [spec.md](F01-platform-foundation-authentication-and-access-control/spec.md): 7 seções (visão geral, impacto na arquitetura, decisões técnicas, componentes por arquivo, contratos das actions com exemplos JSON, modelo de dados com SQL, estratégia de testes). **Cada critério de aceitação do PRD virou um teste com nome.**
- [plan.md](F01-platform-foundation-authentication-and-access-control/plan.md): 29 passos em 6 etapas. O plano diz **o que** fazer; a spec diz **como**.

---

## 7. Implementação da F01, etapa por etapa

A implementação seguiu o plano. Cada etapa terminou com **lint + checagem de tipos + testes**, uma **verificação real** (servidor rodando, navegador automatizado ou banco consultado) e **um commit**. Os commits usam o padrão Conventional Commits com o ID da funcionalidade, por exemplo `feat(identity): ... [F01]`.

### Etapa 0 — Preparar o ambiente

- O Docker Desktop foi iniciado, mas o motor não respondia a nenhum comando, embora os logs dissessem que estava rodando. Reiniciar o Docker Desktop resolveu.
- **Ler a documentação da versão instalada.** O Next.js 16 traz um aviso ("This is NOT the Next.js you know") e a documentação dentro do pacote (`node_modules/next/dist/docs/`). Os guias de `proxy.ts` (o antigo `middleware`), CSP com nonce, `forbidden()` e Server Actions foram lidos antes de escrever código. O mesmo foi feito com as definições de tipo do Better Auth, do pg-boss e do Prisma 7.

### Etapa 1 — Estrutura do projeto (commit `88f5e04`)

1. O esqueleto do Next.js foi gerado numa **pasta temporária** (`npx create-next-app@16 ... --yes`) e só os arquivos necessários foram copiados, porque o gerador não aceita uma pasta que já contém arquivos.
2. **TypeScript estrito** (`strict`, `noUncheckedIndexedAccess`).
3. **ESLint com fronteiras de módulo**: um módulo só pode ser importado pelo seu `index.ts`, `domain/` não importa framework nem banco, rotas não acessam o banco.
4. **Tailwind CSS 4 + shadcn/ui**, com os componentes em `src/shared/ui`.
5. **Docker Compose** com PostgreSQL 18, armazenamento S3 e Mailpit, mais um script SQL que cria **dois usuários de banco**: `gcli_owner` (migrações) e `gcli_app` (aplicação).
6. **Variáveis de ambiente validadas com Zod** na inicialização: a aplicação não sobe com configuração inválida.
7. **Husky + lint-staged**: cada commit passa por ESLint e Prettier.

### Etapa 2 — Núcleo compartilhado, banco e worker (commit `af1df78`)

1. **Schema Prisma 7** com as tabelas da F01, com colunas em snake_case e CHECK constraints no lugar de enums nativos.
2. **Migrações geradas sem banco**: `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`. O SQL foi dividido em dois arquivos e recebeu partes escritas à mão: permissões, índice único parcial e a **tabela de auditoria particionada por mês**, em que a aplicação só tem `INSERT` e `SELECT` (ninguém consegue apagar a auditoria pela aplicação).
3. **Cliente com escopo por organização** (`forTenant`): uma extensão do Prisma que injeta `organizationId` em toda consulta e criação.
4. **Transação como unidade de trabalho**: cada caso de uso recebe o cliente da transação, o gravador de auditoria e o outbox, todos na mesma transação. Um resultado de erro desfaz tudo.
5. **Worker** separado com pg-boss: entrega do outbox, envio de e-mail e tarefas de manutenção.

### Etapa 3 — Autenticação (commits `03080d8` e `e5deb32`)

1. Políticas de domínio puras e testadas: senha, bloqueio, expiração de sessão e **CNPJ alfanumérico** (formato novo, emitido desde julho de 2026).
2. Login com **bloqueio após 5 falhas por 15 minutos**. E-mails inexistentes seguem a mesma regra, para que a mensagem de bloqueio não revele quais e-mails existem, e a verificação de senha leva o mesmo tempo nos dois casos.
3. **Limite de tentativas por IP**, guardado no PostgreSQL.
4. **Redefinição de senha** pelo outbox, com resposta idêntica para e-mails cadastrados e não cadastrados.
5. **Proxy** (`src/proxy.ts`) com ID de requisição, CSP com nonce por requisição e redirecionamento para o login.
6. **Testes de integração com Testcontainers**: cada execução sobe PostgreSQL, Mailpit e o armazenamento S3 em contêineres descartáveis. Os testes de tempo (bloqueio de 15 minutos, sessão de 12 horas) usam um relógio simulado.
7. **Verificação no navegador** com Playwright: senha errada mostra a mensagem do PRD; senha certa redireciona e grava um cookie `httpOnly`.

### Etapa 4 — Autorização e layout (commit `cfcfe33`)

1. A **matriz de permissões do PRD** virou código, com um teste que compara cada perfil e ação com a tabela do PRD.
2. A **guarda de autorização** registra toda negação na auditoria (`PERMISSION_DENIED`).
3. **Layout autenticado**: menu lateral filtrado por perfil, menu do usuário, página 403 e redirecionamento inicial por perfil.
4. Verificação no navegador com dois perfis: a Recepção vê só "Agenda" e recebe 403 no Painel; o Administrador vê os quatro itens do menu.

### Etapa 5 — Usuários e organização (commit `77d62c9`)

1. **Convites**: token de 32 bytes, e só o hash SHA-256 fica no banco. O link vale 72 horas, e reenviar invalida o anterior. O aceite usa uma atualização condicional (`status = 'PENDING'`) para garantir uso único mesmo com dois cliques simultâneos.
2. **Proteção do último administrador** com trava de linha (`SELECT ... FOR UPDATE`). Um teste dispara duas rebaixas simultâneas e confirma que só uma passa.
3. **Configurações da organização** com trava otimista (`version`).
4. **Logotipo**: o conteúdo real do arquivo é conferido (não só a extensão) e a imagem é convertida para PNG. Isso também elimina scripts que um SVG possa carregar.
5. **`npm run setup:admin`**: cria a organização e envia o convite do primeiro administrador. Recusa rodar se já existir uma organização.
6. Verificação completa: setup → e-mail no Mailpit → definir senha → configurações → logotipo → convidar outro usuário.

### Etapa 6 — Operação e entrega

1. **`/api/health`** verifica o banco e o armazenamento. Foi testado parando o armazenamento: a rota respondeu `503 degraded` e voltou a `ok` quando o serviço voltou.
2. **Sentry** no web e no worker, desligado quando não há DSN, com remoção de dados pessoais antes do envio.
3. **Imagem Docker única** para web, worker e migrações, com um perfil `app` no Compose que sobe tudo em contêineres (`docker compose --profile app up -d`).
4. **CI no GitHub Actions**: lint, tipos, testes unitários, integração, migrações e verificação de divergência do schema, E2E e build da imagem.
5. **Dependabot** para npm, GitHub Actions e Docker.
6. **Testes E2E** com Playwright, contra um banco separado (`gcli_e2e`) e um build de produção na porta 3101, sem tocar nos dados de desenvolvimento.

---

## 8. Problemas encontrados e como foram resolvidos

Esta seção é talvez a mais útil para quem for reproduzir o projeto. Todos esses problemas apareceram porque **cada etapa foi executada de verdade**, e não só escrita.

| Problema | Causa | Solução |
|---|---|---|
| `git push` falhou com erro de certificado | Antivírus interceptando HTTPS (ver última linha) | `git config --global http.sslbackend schannel` |
| Motor do Docker não respondia | Docker Desktop travado após iniciar | Reiniciar o Docker Desktop |
| `eslint-plugin-boundaries` 7 com API nova | A versão mudou a configuração de políticas | Regra nativa `no-restricted-imports` do ESLint (ADR-018) |
| **Sessão cairia com o usuário ativo** | O Better Auth só renova o cookie dentro de Server Actions, não na navegação | Sessão fixa de 12 horas + `lastActiveAt` para a inatividade de 60 minutos (ADR-016) |
| Imagens MinIO indisponíveis | A MinIO deixou de publicar imagens de contêiner | SeaweedFS com API S3 no ambiente local; R2 em produção (ADR-017) |
| Worker não iniciava com o usuário da aplicação | O pg-boss tenta `CREATE SCHEMA` e o usuário da aplicação não tem essa permissão | O schema é criado pela migração e o pg-boss roda com `createSchema: false` |
| **Salvar a organização após enviar o logotipo dava "dados alterados por outra pessoa"** | O upload incrementava a `version` usada pela trava otimista | O logotipo usa só o seu próprio contador (`logoVersion`); teste de regressão adicionado |
| Campos do formulário vazios antes do JavaScript carregar | `react-hook-form` preenche os campos só no navegador | `defaultValue` nos campos, para o HTML já vir preenchido do servidor |
| **Rascunho do formulário não era restaurado após a sessão expirar** (achado pelo teste E2E) | `form.reset()` não sobrescreve campos cujo valor inicial veio do HTML do servidor; e o rascunho guardava `null` (valor já transformado pelo schema), que a validação recusava | Restaurar campo a campo com `setValue`, não guardar nulos no rascunho e aceitar `null` nos campos opcionais do schema |
| **Texto digitado sumia em aparelhos lentos** (achado pelo E2E no CI, que roda num servidor mais lento) | O `react-hook-form` inicializa os campos ao terminar de carregar a página e apaga o que foi digitado antes disso | Campos desabilitados até a página carregar (`HydratedFieldset`); verificado com a CPU do navegador 4× mais lenta |
| Nova tentativa automática do E2E falhava por outro motivo | As jornadas compartilham estado (um convite aceito não pode ser aceito de novo) | E2E sem novas tentativas: uma falha aparece como falha de verdade |
| Build da imagem: `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | O **Norton Antivirus** intercepta HTTPS; o contêiner não confia no certificado dele | *Build secret* opcional `extra_ca` com o certificado raiz (nunca fica gravado na imagem) |
| Build da imagem: falha ao baixar a fonte do Google | O compilador do Next.js baixa a fonte com um TLS próprio | Fonte Geist servida localmente pelo pacote `geist` (e nenhuma requisição ao Google, bom para a LGPD) |
| `prisma generate` exigia `DATABASE_MIGRATION_URL` no build | O `prisma.config.ts` pedia a variável sempre | URL opcional para `generate`; obrigatória só para migrações |

---

## 9. Como reproduzir o ambiente do zero

### Pré-requisitos

- Node.js 22 ou superior e npm 10 ou superior
- Docker (Docker Desktop no Windows ou macOS)
- Git

### Passo a passo

```bash
# 1. Código e dependências
git clone https://github.com/dennysvf/GCli.git
cd GCli
npm install                      # também gera o cliente Prisma
npx playwright install chromium  # somente para os testes E2E

# 2. Configuração local
cp .env.example .env
# gere um segredo e coloque em BETTER_AUTH_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# 3. Serviços locais: PostgreSQL 18, SeaweedFS (S3) e Mailpit
docker compose up -d

# 4. Banco de dados
npm run db:deploy

# 5. Primeira organização e administrador
npm run setup:admin -- --org-name "Minha Clínica" --admin-name "Seu Nome" --admin-email voce@exemplo.com

# 6. Aplicação e worker (dois terminais)
npm run dev          # http://localhost:3001
npm run dev:worker   # envia os e-mails do outbox
```

Abra o **Mailpit** em http://localhost:8025, clique no link do convite, defina a senha e pronto.

### Testes

```bash
npm run lint && npm run typecheck
npm test                  # unitários
npm run test:integration  # PostgreSQL, Mailpit e S3 reais em contêineres (Docker ligado)
npm run test:e2e          # build de produção na porta 3101 + banco gcli_e2e (docker compose up -d antes)
```

### Tudo em contêineres

```bash
docker compose --profile app up -d --build   # web em http://localhost:3000
```

Se a sua rede ou o seu antivírus intercepta HTTPS (erros como `UNABLE_TO_VERIFY_LEAF_SIGNATURE`), passe o certificado raiz no build:

```bash
EXTRA_CA_CERTS=/caminho/para/certificado-raiz.pem docker compose --profile app build
```

---

## 10. Lições aprendidas

1. **Entrevista antes de documento.** Uma pergunta por vez, sempre com uma recomendação, resolve mais do que um documento longo escrito no escuro.
2. **IDs de ponta a ponta** (F01 → história → critério → teste → commit) tornam o projeto rastreável sem esforço extra.
3. **"O quê" e "como" em documentos separados.** O PRD não escolhe biblioteca; a arquitetura não inventa requisito.
4. **Ler a documentação da versão instalada**, não a que se lembra de cabeça. Next.js 16, Prisma 7 e Better Auth 1.7 mudaram APIs importantes.
5. **"Escrevi o código" não é "está pronto".** Quatro bugs reais (sessão caindo, conflito de versão após o upload do logotipo, permissão do pg-boss, rascunho não restaurado) só apareceram ao executar de verdade: servidor, navegador e banco.
6. **Testar contra infraestrutura real.** O banco nunca é simulado nos testes de regra de dados: restrições, permissões e concorrência só são testáveis nele.
7. **Registrar as mudanças de rumo como ADRs novos.** O histórico de decisões conta a história do projeto melhor do que qualquer resumo.
