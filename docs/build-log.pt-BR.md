# Diário de bordo — como o GCli foi construído

Este diário registra, em ordem, tudo o que foi feito no projeto desde a leitura do briefing até a implementação das primeiras funcionalidades (F01 a F05). A ideia é que qualquer pessoa consiga **entender as decisões** e **repetir o processo** em outro projeto.

O trabalho foi feito em dupla: uma pessoa responsável pelo produto e um assistente de programação com IA. A pessoa respondeu perguntas, tomou as decisões de negócio e aprovou cada etapa; o assistente conduziu entrevistas, escreveu documentos e código, rodou os testes e registrou o que encontrou pelo caminho.

> **Resumo do caminho:** briefing → entrevista → PRD → documentação bilíngue → repositório público → arquitetura e ADRs → especificação técnica e plano da F01 → implementação em 6 etapas, com testes e commit a cada etapa → F02 com branch, PR e CI → F03 → design system → F04 → F05.

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
8. [Segunda funcionalidade: F02 — Unidades e Salas](#8-segunda-funcionalidade-f02--unidades-e-salas)
9. [Terceira funcionalidade: F03 — Catálogo de Serviços](#9-terceira-funcionalidade-f03--catálogo-de-serviços)
10. [Design system antes das telas mais pesadas](#10-design-system-antes-das-telas-mais-pesadas)
11. [Quarta funcionalidade: F04 — Profissionais e Horários de Atendimento](#11-quarta-funcionalidade-f04--profissionais-e-horários-de-atendimento)
12. [Quinta funcionalidade: F05 — Cadastro de Pacientes](#12-quinta-funcionalidade-f05--cadastro-de-pacientes)
13. [Problemas encontrados e como foram resolvidos](#13-problemas-encontrados-e-como-foram-resolvidos)
14. [Como reproduzir o ambiente do zero](#14-como-reproduzir-o-ambiente-do-zero)
15. [Lições aprendidas](#15-lições-aprendidas)

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

**Problema:** o push falhou com `SSL certificate problem: unable to get local issuer certificate`. **Causa:** o Git para Windows usa o repositório de certificados do OpenSSL, que não reconhecia o certificado apresentado pela rede. **Solução:** `git config --global http.sslbackend schannel`, que faz o Git usar o repositório de certificados do Windows. Mais adiante descobrimos a causa raiz (ver [seção 13](#13-problemas-encontrados-e-como-foram-resolvidos)).

**Proteção da `main`.** Depois que o CI passou a rodar estável, a branch `main` foi protegida com um *ruleset* do GitHub:
- bloqueio de force push e de exclusão da branch;
- toda mudança entra por Pull Request (sem exigir aprovação de outra pessoa, já que o projeto tem um mantenedor);
- os quatro jobs do CI (qualidade, integração, E2E e imagem Docker) precisam estar verdes para o merge.

Desde então, o fluxo é: branch `feat/F02-...` → commits → PR → CI verde → merge.

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

Cada decisão virou um **ADR** (Architecture Decision Record): decisão, porquê e contrapartida. A regra é nunca editar um ADR antigo; quando algo muda, cria-se um novo ADR que o refina. Hoje são 19.

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

## 8. Segunda funcionalidade: F02 — Unidades e Salas

Com a fundação pronta, a F02 foi a primeira funcionalidade de negócio. Ela cadastra as unidades da clínica (endereço, fuso horário, horário de funcionamento e fechamentos) e as salas de cada unidade, e coloca um seletor de unidade no topo da aplicação. A agenda (F06), os horários dos profissionais (F04), os documentos (F08) e o caixa (F11) dependem desses dados.

### 8.1 Fluxo de trabalho: branch, PR e CI

Esta foi a primeira funcionalidade feita com a `main` protegida (ver [seção 4](#4-repositório-público-no-github)):

1. Branch `feat/F02-units-and-rooms` criada a partir da `main` atualizada.
2. Especificação e plano commitados primeiro, numa branch publicada no GitHub.
3. Um commit por etapa da implementação, cada um com lint, tipos e testes passando.
4. Pull Request #12, com os quatro jobs do CI verdes, e merge na `main` em um único commit (`ffecf7b`).

### 8.2 A entrevista técnica

O roteiro foi o mesmo da F01: só se perguntou o que o PRD e o código existente não respondiam, uma pergunta por vez, sempre com uma recomendação. Os padrões criados na F01 (módulos, autorização, auditoria, transações, mensagens de erro, formulários) foram reaproveitados sem discussão.

| Decisão | Resultado |
|---|---|
| Fuso horário | **Por unidade**, começando com o fuso da organização. Uma clínica com unidades em São Paulo e Manaus tem relógios diferentes. Registrado como **ADR-019**, que refina o ADR-010 |
| Busca de CEP | **Rota no próprio servidor** (`/api/address/cep/:cep`), que consulta a BrasilAPI e, se ela falhar, o ViaCEP, em até 3 segundos. Exige login e limita 30 consultas por minuto por usuário. Se as duas falharem, o endereço é digitado à mão |
| Unidade escolhida no topo | **Tabela própria** (`unit_selection`), para acompanhar o usuário em qualquer aparelho |
| Regras que dependem de agendamentos (que só existem na F06) | Uma **porta com padrão zero**: a F02 pergunta "quantos agendamentos futuros esta sala tem?" e, por enquanto, a resposta é sempre 0. A F06 vai trocar a implementação. As regras, mensagens e testes já existem |
| Horário de funcionamento | **Uma linha por intervalo**, com CHECK no banco (minutos de 0 a 1440, múltiplos de 5) e regras puras reaproveitáveis pela F04 e F06 |
| Fechamento sobre dias com agendamentos | **Confirmação em dois passos**: o primeiro envio devolve a quantidade de agendamentos; o segundo, confirmado, salva |
| Nomes repetidos | **Índice único sem diferenciar maiúsculas** no banco (`lower(name)`), além da checagem no código para a mensagem amigável |

A especificação e o plano estão em [F02-units-and-rooms/](F02-units-and-rooms/).

### 8.3 Implementação em 4 etapas

| Etapa | Commit | O que entrou |
|---|---|---|
| 1 — Fundações compartilhadas | `667d0f6` | Regras de CNPJ movidas para o núcleo compartilhado (agora usadas por dois módulos); mensagens de erro com parâmetros, como "Esta sala possui **12** agendamentos futuros"; busca de CEP |
| 2 — Banco e domínio | `80fa920` | Migração `0003_units` com cinco tabelas, CHECK constraints e índices únicos; regras puras do horário de funcionamento; limites como constantes nomeadas; porta de agendamentos com padrão zero |
| 3 — Casos de uso | `66a6703` | Unidades (até 20 ativas), salas (até 30 ativas por unidade), horários, fechamentos e seleção de unidade, todos com autorização, auditoria e trava otimista; API pública para F04, F06, F08, F11 e F12 |
| 4 — Telas | `ddddf27`, `47153c2` | Lista de unidades, página da unidade com as abas Dados, Horário de funcionamento, Salas e Fechamentos (somente leitura para quem não pode alterar), seletor no topo, item "Unidades" no menu e a jornada E2E |

Ao final: 22 testes de integração contra PostgreSQL real, 10 testes unitários (horários e CEP) e uma jornada E2E completa no navegador (criar unidade → horário → sala → fechamento → seletor mostrando a unidade).

### 8.4 Problemas encontrados na F02

| Problema | Causa | Solução |
|---|---|---|
| Erro de tipos ao dar valor padrão a um objeto do schema | No Zod 4, `.default()` em um objeto com transformação exige o valor **já transformado** | `.prefault({})`, que aplica o padrão **antes** da validação |
| O pacote do navegador puxava o módulo de identidade inteiro | O formulário (código do navegador) importava a lista de fusos horários do `index.ts` do módulo de identidade, que carrega código de servidor | A lista de fusos foi movida para o núcleo compartilhado (`shared/kernel/time-zones.ts`) |
| O instalador de componentes do shadcn/ui parou esperando uma resposta | Ao adicionar abas, interruptor e diálogos, ele perguntou se podia sobrescrever o `button.tsx`, que já tinha sido ajustado | Responder "não" automaticamente (`printf 'n\n' \| npx shadcn add ...`) |
| O teste E2E clicava no lugar errado | O texto "Unidades" aparecia em mais de um elemento da página | O seletor foi restrito ao menu lateral (`[data-sidebar=menu-button]`) |

### 8.5 O que a F02 deixou pronto

- **Mensagens com números** (`{count}`), que a F03 já reaproveitou.
- **Portas com padrão zero** como forma de construir uma funcionalidade antes de outra da qual ela depende, sem simular nada em produção.
- **Fuso por unidade** como regra para tudo que envolve calendário.

---

## 9. Terceira funcionalidade: F03 — Catálogo de Serviços

A F03 cadastra os serviços da clínica: nome, categoria, duração, preço, cor na agenda, se exige sala, quais salas são permitidas e se está ativo. Os profissionais (F04), a agenda (F06), as cobranças (F09) e os pacotes (F10) vão usar esse catálogo. O fluxo foi o mesmo da F02: branch `feat/F03-service-catalog`, spec e plano primeiro (commit `c7ec239`), um commit por etapa e PR no final.

### 9.1 A entrevista técnica

Cinco perguntas, uma por vez, cada uma com uma recomendação aceita:

| Decisão | Resultado |
|---|---|
| Categorias: tabela própria ou texto livre? | **Tabela própria**, com até 50 categorias, ordem configurável e exclusão só quando a categoria não tem serviços. Com texto livre, "Consulta" e "Consultas" virariam dois grupos |
| Salas permitidas com várias unidades | **Restrição por unidade**: numa unidade sem salas marcadas, qualquer sala ativa serve. Uma regra global faria a restrição de uma unidade bloquear o serviço nas outras |
| Quando o novo preço vale? | **Na hora**, sem reajuste agendado. Cada mudança grava preço anterior, preço novo, data e autor |
| As 16 cores da paleta | **Chaves estáveis** no banco (`blue`, `emerald`...), com CHECK; a interface converte a chave em cores. Trocar os tons não exige migração |
| Excluir serviços? | **Não**: só desativar e reativar. O nome continua único mesmo entre serviços inativos |

Outras decisões vieram das regras do projeto, sem precisar de pergunta:
- **`Money`**: as regras do projeto exigem dinheiro em centavos inteiros por meio de um objeto `Money`, que ainda não existia. A F03 criou esse objeto e um campo de valor com máscara de reais (`R$ 1.234,56`), que as próximas funcionalidades vão reaproveitar.
- **Categorias iniciais por evento**: quando uma clínica é criada, o módulo de identidade publica o evento "organização criada", e o módulo de serviços cria "Consultas", "Procedimentos" e "Terapias" na mesma transação. Assim o módulo de fundação não depende de um módulo de negócio. Para as clínicas que já existiam, a própria migração criou as três categorias.
- **Registro central** (`src/composition.ts`): um único lugar liga os eventos entre módulos. Ele é chamado pelo servidor web, pelo worker, pelo comando `setup:admin` e pelos testes.

A especificação e o plano estão em [F03-service-catalog/](F03-service-catalog/).

### 9.2 Implementação em 5 etapas

| Etapa | Commit | O que entrou |
|---|---|---|
| 1 — Fundações | `2f1167b` | `Money` e campo de valor em reais; evento "organização criada"; registro central; leitura de salas no módulo de unidades; nomes de usuários no módulo de identidade |
| 2 — Banco e domínio | `e9a5a33` | Migração `0004_services` com quatro tabelas, CHECKs de duração, preço e cor, nomes únicos sem diferenciar maiúsculas e **histórico de preços em que a aplicação só pode inserir e ler**; regras puras de duração, preço e salas; paleta; portas com padrão zero para agendamentos (F06) e profissionais habilitados (F04) |
| 3 — Casos de uso | `de4e12a` | Categorias (criar, renomear, reordenar, excluir vazias) e serviços (listar com filtros, criar, editar, desativar), com autorização, auditoria e trava otimista; API pública para F04, F06, F09 e F10; 22 testes de integração |
| 4 — Telas | `7214d94` | Página `/settings/services` com filtros na URL e lista agrupada por categoria; painel lateral com o formulário, o seletor de cores, as salas por unidade, o diálogo de confirmação de preço e a aba "Histórico de preços"; diálogo de categorias; item "Serviços" no menu |
| 5 — Testes | `4fca520` | Jornada E2E: criar serviço, trocar o preço confirmando, ver duas entradas no histórico e desativar |

Verificação final: lint e tipos sem erros, 43 testes unitários, 100 testes de integração e 7 jornadas E2E passando.

### 9.3 Problemas encontrados na F03

| Problema | Causa | Solução |
|---|---|---|
| A spec contava com uma função que não existia | A spec supôs que o módulo de identidade já devolvia o nome de um usuário pelo ID, para mostrar o autor de cada mudança de preço | A função `getUserNames` foi criada no módulo de identidade. **Lição:** o que a spec supõe deve ser conferido no código antes de implementar |
| O evento podia se perder no servidor web | O Next.js pode carregar o mesmo arquivo mais de uma vez (inicialização e rotas), e cada cópia teria sua lista de inscrições | O barramento de eventos passou a ser único por processo (guardado em `globalThis`, como já era feito com o cliente do banco) |
| Aviso do React Compiler no formulário | `form.watch()` do react-hook-form não pode ser otimizado pelo compilador | `useWatch()`, a forma compatível |
| O E2E não encontrava as linhas da tabela | O painel lateral é modal e esconde o resto da página da árvore de acessibilidade, que é o que `getByRole` consulta | As linhas são buscadas por CSS (`locator("tr", { hasText })`) |
| O E2E achava dois elementos para "Preço" | `getByLabel("Preço")` também encontrava a aba "Histórico de **preços**" | Busca exata pelo papel do campo: `getByRole("textbox", { name: "Preço" })` |

### 9.4 O que a F03 deixou pronto

- **`Money`** e o **campo de valor em reais**, para cobranças (F09), pacotes (F10) e caixa (F11).
- **Eventos entre módulos** com um **registro central**, onde a F04 e a F06 vão ligar as suas implementações das portas.
- **Histórico que nem a aplicação consegue alterar**, garantido por permissão no banco, como já acontecia com a auditoria.

---

## 10. Design system antes das telas mais pesadas

Depois da F03, e antes da agenda (F06), a identidade visual foi definida. As telas existentes ainda eram poucas e usavam o visual padrão do shadcn/ui; as próximas (agenda, prontuário, caixa, painel) são as mais densas do sistema. Mudar a estrutura visual depois delas custaria muito mais.

### 10.1 Como foi feito

1. **Pedido com papel e critérios claros:** "atue como um designer de produto sênior", com a lista do que o documento precisa ter (cores, tipografia, layout, componentes, conteúdo, acessibilidade, tokens, exemplos) e o que evitar: gradientes sem propósito, excesso de cards, efeito de vidro, sombras e cantos exagerados, ícones decorativos.
2. **Contexto tirado do PRD**, não inventado: público sob pressão de tempo, letramento digital moderado, recepção no desktop e profissionais no tablet ou celular, convenções brasileiras.
3. **Contraste calculado, não estimado:** cada par de cores citado no documento teve a razão de contraste calculada pela fórmula da WCAG 2.2 antes de entrar. Todos passam no nível AA.
4. **Revisão contra as regras do projeto:** a primeira versão tinha tokens com nomes em português (`--papel-0`, `--azul-tinta`). Como a regra do projeto é código em inglês, os tokens viraram `--paper-0`, `--ink-blue` etc.; os nomes em português ficaram só no texto.
5. **Documento bilíngue** ([design-system.pt-BR.md](design-system.pt-BR.md) e [design-system.en.md](design-system.en.md)), registrado como **ADR-020** e citado no README, na arquitetura (estrutura de código e definição de pronto) e no `CLAUDE.md`.

### 10.2 A identidade: "Tinta e Papel"

A ideia vem dos objetos que as clínicas usavam antes dos sistemas: a ficha do paciente, o livro de agenda e o livro-caixa.

| Elemento | Regra |
|---|---|
| Papel e tinta | Fundos em papel levemente quente (`#FBFAF7`), texto em tinta escura, azul-tinta (`#22406E`) como cor primária |
| Lápis vermelho | Terracota só para o "agora" na agenda e para "atrasado" |
| Carimbos | Estados sempre escritos (CONFIRMADO, FALTOU, PAGO), nunca só uma cor |
| Livro-caixa | Tabelas com linhas finas no lugar de grades de cards; dupla linha só no cabeçalho de página e nos totais |
| Tipografia | Source Serif 4 nos títulos, Source Sans 3 na interface, servidas pelo próprio sistema |
| Contenção | Raios de no máximo 8 px, uma única sombra (só no que flutua), sem gradientes |

Os tokens mantêm os nomes de variável do shadcn/ui, então aplicar o design system é trocar valores no `globals.css` e ajustar as variantes dos componentes, sem reescrever as telas. Cada tela nova passa por um checklist de 6 perguntas (seção 11 do documento), que também entrou na definição de pronto.

### 10.3 Aplicação no código

- **Tokens no `globals.css`** com os nomes do shadcn/ui, mais o tema do Tailwind ajustado para que os próprios componentes sigam as regras: raios limitados a 8 px, sombras pequenas zeradas, peso 500 renderizado como 600 e texto base de 15 px.
- **Fontes servidas pelo sistema** com os pacotes `@fontsource-variable`.
- **Componentes revisados:** botão (36 px, 44 px no toque), campos, tabela com cabeçalho em caixa alta, abas sublinhadas, painel lateral de 560 px, diálogos, menu lateral com barra azul no item ativo e avisos flutuantes com faixa colorida. O antigo `Badge` em pílula virou o **carimbo** (`Stamp`).
- **Telas:** cabeçalho de página com a dupla linha em todas as páginas, listas com linhas finas e estados vazios em texto.
- **Verificação:** capturas de tela no desktop e em 375 px, que revelaram dois ajustes (o carimbo herdando a fonte serifada e a tabela alargando a página no celular), e a suíte completa (lint, tipos, 43 unitários, 100 de integração, 7 E2E).
- **Lição sobre o ambiente:** com a CPU da máquina em 77% (navegador, editor e antivírus), testes E2E com limite de 5 segundos falharam de forma intermitente. Rodar a mesma suíte de novo, com os processos de desenvolvimento parados, separou o problema de ambiente de um problema de código.

---

## 11. Quarta funcionalidade: F04 — Profissionais e Horários de Atendimento

A F04 cadastra os profissionais da clínica: identificação, registro no conselho ("CRM 123456/SP"), cor na agenda, vínculo opcional com um usuário, os serviços que cada um realiza, o horário semanal de atendimento por unidade e as ausências. A agenda (F06) vai usar esses dados para saber quem pode ser agendado, onde e quando; os documentos (F08) vão imprimir o nome e o registro. O fluxo foi o mesmo: branch `feat/F04-professionals-and-working-hours`, especificação e plano primeiro (commit `17ed233`), um commit por etapa e um PR no fim.

Uma coisa mudou: a especificação foi escrita **em modo autônomo**, sem entrevista ao vivo. O assistente aplicou a própria recomendação a cada questão em aberto e registrou cada uma como premissa explícita na especificação, para que a pessoa responsável pelo produto possa revisá-las e alterá-las.

### 11.1 Decisões tomadas na especificação

| Decisão | Resultado |
|---|---|
| Como funciona "uma mudança futura de horário"? | Um **horário** cobre todas as unidades e tem data de início e data de término opcional. Salvar um horário que começa no futuro **encerra o atual na véspera**. Uma restrição de exclusão no banco (`btree_gist`) garante que um profissional nunca tenha dois horários sobrepostos, mesmo com gravações simultâneas |
| Unidades em fusos diferentes | Os intervalos de unidades diferentes são comparados **no horário real**, convertendo o horário local de cada unidade pelo seu deslocamento UTC. Registrado como **ADR-021** |
| Vínculo entre usuário e profissional | O módulo identity declara uma porta e o módulo professionals a implementa; assim o contexto da requisição conhece o profissional vinculado sem dependência circular. O vínculo só dá permissões enquanto o perfil do usuário permite e o profissional está ativo |
| O que o perfil Profissional vê | **Apenas o próprio cadastro**, só leitura, e as próprias ausências. Uma permissão nova, `professional:read-all`, cobre os outros perfis |
| Cor na agenda | A **mesma paleta de 16 cores** dos serviços, como um círculo antes do nome, nunca como fundo. O design system ganhou essa regra e o padrão da grade semanal de horários |
| CPF | Um objeto de valor `Cpf` compartilhado e um campo de CPF com máscara, que o cadastro de pacientes (F05) vai reutilizar |

A especificação e o plano estão em [F04-professionals-and-working-hours/](F04-professionals-and-working-hours/).

### 11.2 Implementação em 4 etapas

| Etapa | Commit | O que entrou |
|---|---|---|
| 1 — Fundamentos | `389b9f8` | ADR-021 e os acréscimos ao design system nos dois idiomas; `Cpf` e o campo de CPF; a permissão `professional:read-all`; a porta que preenche o profissional vinculado no contexto da requisição e a coluna "Profissional vinculado" na tela de Usuários |
| 2 — Banco e domínio | `bed323d` | Migração `0005_professionals` com cinco tabelas, a restrição de exclusão dos horários, CHECKs do conselho e índices únicos parciais para CPF e registro no conselho; regras puras de intervalos, horário de funcionamento, conflito entre unidades, vigência e ausências; a porta de agendamentos para a F06 |
| 3 — Casos de uso | `ccdc521` | Cadastro, serviços habilitados, horários e ausências, com autorização, auditoria e bloqueio otimista; a API pública para a F06 e a F08; 31 testes de integração, incluindo gravações simultâneas |
| 4 — Telas | `8bd6aa2` | A lista, a página de novo profissional e a página do profissional com as abas Dados, Serviços, Horários e Ausências; a grade semanal marca intervalos fora do funcionamento antes de salvar; duas jornadas E2E; o registro de portas (ADR-022) |

Verificação final: lint e tipos limpos, 62 testes unitários, 131 testes de integração e 9 jornadas E2E passando.

### 11.3 Problemas encontrados na F04

| Problema | Causa | Solução |
|---|---|---|
| **O servidor web nunca via o profissional vinculado** (encontrado pelo teste E2E) | O Next.js carrega cópias separadas de um módulo no mesmo processo. A raiz de composição registrava a porta em uma cópia, e as rotas usavam outra, que continuava com o padrão | As portas entre módulos passaram para um registro guardado em `globalThis` (`definePort`, **ADR-022**). Isso também corrigiu a contagem de profissionais na lista de serviços, que tinha o mesmo defeito desde a F03 mas nunca tinha sido exercitada por uma requisição web |
| O seletor de cores ficava dentro do módulo de serviços | Uma tela de outro módulo que importasse a entrada do módulo de serviços levaria código de servidor para o pacote do navegador | A paleta foi para o núcleo compartilhado e o seletor para os componentes de interface compartilhados |
| As regras de visualização e de ausências não podiam ficar em `domain/` | A regra de lint mantém `domain/` livre de tudo que está fora do núcleo compartilhado, inclusive a matriz de permissões | As políticas ficam em `application/`, com testes unitários próprios |
| Uma verificação E2E procurava "ATIVO" e falhava | O carimbo é escrito "Ativo" e o CSS o deixa em maiúsculas; os testes leem o texto, não a renderização | O teste confere o texto real |
| Testes falhavam por motivos alheios ao código | A máquina estava sobrecarregada: o contêiner do banco de testes não respondia a tempo e o build de produção passou do limite de 10 minutos do E2E | Nova execução depois que a carga caiu, com o build rodado antes, separado. As falhas nunca chegaram a um teste, então não diziam nada sobre o código |

### 11.4 O que a F04 deixou pronto

- **A API pública para a agenda (F06):** profissionais agendáveis por serviço e unidade, a verificação de serviço habilitado e um calendário de atendimento por data, com a vigência aplicada e as ausências incluídas.
- **Nome e registro para os documentos (F08).**
- **O profissional vinculado no contexto da requisição**, do qual dependem as permissões do prontuário (F07).
- **O registro de portas**, onde a F06 vai registrar as portas de agendamentos.
- **`Cpf` e o campo de CPF** para o cadastro de pacientes (F05).

---

## 12. Quinta funcionalidade: F05 — Cadastro de Pacientes

A F05 cadastra os pacientes da clínica: identificação, contato, endereço, responsável para menores, origem, etiquetas e observações administrativas, além do consentimento LGPD aos termos de privacidade da clínica. A agenda (F06), os documentos (F08), os pacotes (F10), o painel (F12) e a linha do tempo do paciente (F14) vão ler esses dados. O fluxo foi o mesmo: branch `feat/F05-patient-registry` criada antes de tudo, especificação e plano primeiro (commit `b7aad48`), um commit por etapa e um PR no fim. Como na F04, a especificação foi escrita em modo autônomo, com cada decisão registrada como premissa explícita.

### 12.1 Decisões tomadas na especificação

| Decisão | Resultado |
|---|---|
| Busca em 100 mil pacientes | A aplicação grava o nome sem acentos e em minúsculas, e os dois telefones só com dígitos. Índices GIN de trigramas (`pg_trgm`) respondem às buscas por trecho. A busca é SQL direto, então filtra a organização explicitamente; uma consulta por tipo de termo (nome, CPF ou telefone) mantém cada uma no seu índice |
| Duplicidade | O CPF igual bloqueia o cadastro, e a mensagem mostra o nome abreviado ("Maria S. Oliveira") com um link. Nome e data de nascimento iguais devolvem os candidatos sem salvar; a pessoa confirma com "Criar mesmo assim" |
| Edição simultânea | Quem salva por último recebe "Este cadastro foi alterado por João às 14:32", e o formulário lista os campos que mudaram |
| Consentimento | Termos de privacidade versionados, publicados pelo Administrador, e registros de consentimento por paciente. Os dois são "só acrescentar": o usuário de banco da aplicação não consegue alterá-los nem apagá-los, porque são prova legal |
| Envio do termo assinado | Pelo servidor da aplicação, até 10 MB, com o tipo conferido pelos bytes iniciais do arquivo. A CSP estrita não deixa o navegador enviar arquivos direto ao armazenamento. Registrado como **ADR-023** |
| O que o Profissional vê | Só pacientes que têm agendamento com ele. Até a F06 existir, a lista fica vazia |
| Peças compartilhadas | Um objeto de valor `PhoneNumber`, e a validação, os campos e a formatação de endereço da F02 movidos para o código compartilhado |

A especificação e o plano estão em [F05-patient-registry/](F05-patient-registry/).

### 12.2 Implementação em 4 etapas

| Etapa | Commit | O que entrou |
|---|---|---|
| 1 — Fundamentos | `2e9e525` | ADR-023 e o padrão de busca global do design system nos dois idiomas; `PhoneNumber` e um campo de telefone; a validação e os campos de endereço movidos para o código compartilhado (F02 e F04 passaram a usá-los); `head()` no armazenamento de objetos |
| 2 — Banco e domínio | `0793c85` | Migração `0006_patients` com sete tabelas, índices de trigramas para nome e telefone, índice único parcial de CPF, CHECKs de valores e permissões de "só acrescentar" em termos e consentimentos; regras puras de nomes, idades, termos de busca, situação do consentimento e máscara de CPF; a porta de agendamentos para a F06 |
| 3 — Casos de uso | `06f3121` | Cadastro completo e rápido, responsável para menores, duplicidade, edição simultânea, inativação, busca, listas, termos, consentimento com envio de arquivo e links de download de 5 minutos auditados, limpeza diária de envios não usados; a API pública; 18 testes de integração, incluindo 100 mil pacientes |
| 4 — Telas | `f14ee37` | A página de pacientes com busca e paginação; a busca global no cabeçalho com o atalho "/"; os formulários completo e rápido; a página do paciente com a seção de consentimento; as configurações de listas e termos de privacidade; duas jornadas E2E |

Verificação final: lint e tipos limpos, 71 testes unitários, 149 testes de integração e 11 jornadas E2E passando. Com 100 mil pacientes, o `EXPLAIN ANALYZE` mostrou todas as buscas no seu índice, entre 2 e 14 ms.

### 12.3 Problemas encontrados na F05

| Problema | Causa | Solução |
|---|---|---|
| O Prisma apontava os índices de busca como divergência do schema | Índices GIN criados só em SQL ficam invisíveis para o schema do Prisma, e o CI confere divergências | Os índices passaram a ser declarados no schema com `type: Gin` e `ops: raw("gin_trgm_ops")` |
| Os campos do responsável perdiam a tipagem no formulário | Um `z.preprocess` que transformava a seção vazia em `null` deixava o tipo de entrada do schema como `unknown` | O responsável virou um objeto comum, validado com `superRefine` e transformado em `null` com `transform` quando vem vazio |
| O lint recusou o componente de busca global | Ele chamava `setState` direto dentro de um efeito para mostrar "Digite pelo menos 3 caracteres" | Os estados "vazio" e "curto demais" são derivados do texto durante a renderização; o efeito só faz as buscas de fato |
| Uma refatoração removeu mais do que devia | Recortar a validação de endereço do módulo de unidades levou junto uma função ainda em uso | O typecheck pegou antes do commit, e a função foi restaurada |

### 12.4 O que a F05 deixou pronto

- **Identidade e cadastro completo do paciente** para F06, F08, F10, F12 e F14, com o nome social tendo precedência.
- **O formulário de cadastro rápido**, pronto para entrar no modal de agendamento (F06).
- **Consentimento LGPD com termos versionados**, que a linha do tempo e a exportação de dados (F14) vão ler.
- **A porta de agendamentos**, que a F06 vai registrar para bloquear a inativação, mostrar o último agendamento e limitar o que os profissionais veem.
- **Endereço e telefone compartilhados** para qualquer formulário futuro.

---

## 13. Problemas encontrados e como foram resolvidos

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

## 14. Como reproduzir o ambiente do zero

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

## 15. Lições aprendidas

1. **Entrevista antes de documento.** Uma pergunta por vez, sempre com uma recomendação, resolve mais do que um documento longo escrito no escuro.
2. **IDs de ponta a ponta** (F01 → história → critério → teste → commit) tornam o projeto rastreável sem esforço extra.
3. **"O quê" e "como" em documentos separados.** O PRD não escolhe biblioteca; a arquitetura não inventa requisito.
4. **Ler a documentação da versão instalada**, não a que se lembra de cabeça. Next.js 16, Prisma 7 e Better Auth 1.7 mudaram APIs importantes.
5. **"Escrevi o código" não é "está pronto".** Quatro bugs reais (sessão caindo, conflito de versão após o upload do logotipo, permissão do pg-boss, rascunho não restaurado) só apareceram ao executar de verdade: servidor, navegador e banco.
6. **Testar contra infraestrutura real.** O banco nunca é simulado nos testes de regra de dados: restrições, permissões e concorrência só são testáveis nele.
7. **Registrar as mudanças de rumo como ADRs novos.** O histórico de decisões conta a história do projeto melhor do que qualquer resumo.
8. **Portas com padrão zero destravam a ordem de construção.** A F02 já tem as regras que dependem de agendamentos, com testes, antes de a agenda existir; quando a F06 chegar, só a implementação da porta muda.
9. **Conferir no código o que a spec supõe.** A spec da F03 contava com uma função que não existia; a diferença apareceu na implementação, foi resolvida e ficou registrada.
10. **Definir o visual antes das telas densas.** Com poucas telas prontas, o design system custa um documento e uma troca de tokens; depois da agenda e do prontuário, custaria refazer as telas mais complexas.
11. **Corrigir a classe inteira do problema, não só o caso encontrado.** A F03 levou o barramento de eventos para `globalThis` porque o Next.js carrega módulos mais de uma vez, mas deixou as portas em variáveis de módulo. A mesma causa voltou na F04.
12. **Decisões tomadas sem a pessoa usuária precisam ficar escritas.** Quando a especificação foi escrita sem entrevista ao vivo, cada recomendação aplicada virou uma premissa explícita, para que a pessoa responsável pelo produto possa revisá-la e alterá-la depois.
13. **Medir a meta de desempenho, não supor.** O teste de busca da F05 insere 100 mil pacientes e confere o p95, e o `EXPLAIN ANALYZE` mostra qual índice cada consulta usa. Um índice faltando teria sido pego pelo teste, não em produção.
