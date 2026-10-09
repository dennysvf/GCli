# Diário de bordo — como o GCli foi construído

Este diário registra, em ordem, tudo o que foi feito no projeto desde a leitura do briefing até a implementação das primeiras funcionalidades (F01 a F09 e F16). A ideia é que qualquer pessoa consiga **entender as decisões** e **repetir o processo** em outro projeto.

O trabalho foi feito em dupla: uma pessoa responsável pelo produto e um assistente de programação com IA. A pessoa respondeu perguntas, tomou as decisões de negócio e aprovou cada etapa; o assistente conduziu entrevistas, escreveu documentos e código, rodou os testes e registrou o que encontrou pelo caminho.

> **Resumo do caminho:** briefing → entrevista → PRD → documentação bilíngue → repositório público → arquitetura e ADRs → especificação técnica e plano da F01 → implementação em 6 etapas, com testes e commit a cada etapa → F02 com branch, PR e CI → F03 → design system → F04 → F05 → F06 → F16 (idiomas e países) → F07 → ambientes separados para operação → F08 → F09.

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
13. [Sexta funcionalidade: F06 — Agenda e Agendamentos](#13-sexta-funcionalidade-f06--agenda-e-agendamentos)
14. [F16 — Internacionalização e Perfis de País](#14-f16--internacionalização-e-perfis-de-país)
15. [Sétima funcionalidade: F07 — Registro do Atendimento Clínico](#15-sétima-funcionalidade-f07--registro-do-atendimento-clínico)
16. [Ambientes: desenvolvimento e produção](#16-ambientes-desenvolvimento-e-produção)
17. [Oitava funcionalidade: F08 — Documentos do Paciente](#17-oitava-funcionalidade-f08--documentos-do-paciente)
18. [Nona funcionalidade: F09 — Cobrança e Pagamentos](#18-nona-funcionalidade-f09--cobrança-e-pagamentos)
19. [Décima funcionalidade: F10 — Pacotes de Sessões](#19-décima-funcionalidade-f10--pacotes-de-sessões)
20. [Décima primeira funcionalidade: F11 — Caixa e Despesas](#20-décima-primeira-funcionalidade-f11--caixa-e-despesas)
21. [Problemas encontrados e como foram resolvidos](#21-problemas-encontrados-e-como-foram-resolvidos)
22. [Como reproduzir o ambiente do zero](#22-como-reproduzir-o-ambiente-do-zero)
23. [Lições aprendidas](#23-lições-aprendidas)

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

## 13. Sexta funcionalidade: F06 — Agenda e Agendamentos

A F06 é o centro do produto: a recepção agenda, confirma, registra a chegada, reagenda e cancela; os profissionais veem a própria agenda e marcam o atendimento como iniciado e concluído. O prontuário (F07), as cobranças (F09), os pacotes (F10), o painel (F12), os relatórios (F13) e a linha do tempo do paciente (F14) partem de um agendamento. O fluxo foi o mesmo: branch `feat/F06-scheduling-and-agenda` criada antes de tudo, especificação e plano primeiro (commit `694e1b5`), um commit por etapa e um PR no fim. Desta vez a especificação saiu de uma entrevista ao vivo, uma pergunta por vez, sempre com uma recomendação.

### 13.1 Decisões tomadas na entrevista

| Decisão | Resultado |
|---|---|
| Escopo | Core e Full Scope juntos: além de agendamento, ciclo de status, reagendamento e as três visões, também séries recorrentes, arrastar e soltar, visão por sala e agenda imprimível |
| Quais status ocupam o horário | Todos, menos Cancelado e Faltou: depois de uma falta, o horário pode ser usado por outro paciente sem encaixe |
| Reverter Concluído | O PRD não permitia, mas a F10 pressupõe ("reverter Concluído devolve a sessão"). Decisão: o profissional pode desfazer em até 30 minutos; Gerente e Administrador a qualquer momento, com justificativa. O PRD foi atualizado nos dois idiomas |
| Editar depois de agendar | Serviço, duração, sala e observações mudam até a chegada; trocar o serviço tira um novo snapshot do preço |
| Editar uma série | "Este e os seguintes" divide a série: a antiga termina e uma nova recebe as sessões alteradas, cada uma verificada de novo |
| Motivos de cancelamento | Uma lista configurável no módulo de agenda, com quatro motivos padrão |
| Bibliotecas novas | TanStack Query para a atualização a cada 30 segundos (já prevista no ADR-011), dnd-kit para arrastar e soltar e `@react-pdf/renderer` para a agenda impressa, que vira a base de PDF compartilhada da F08, F09 e F13 |

A especificação e o plano estão em [F06-scheduling-and-agenda/](F06-scheduling-and-agenda/). As decisões viraram o **ADR-024** (PDF compartilhado), o **ADR-025** (atualização da agenda e arrastar e soltar) e o **ADR-026** (modelo de conflitos e ciclo de vida).

### 13.2 Como o agendamento duplo é impedido

O PRD exige que dois salvamentos simultâneos para o mesmo horário gerem exatamente um agendamento. A aplicação verifica todas as regras antes, para que a pessoa receba uma mensagem precisa ("Dra. Ana já possui atendimento das 14:00 às 14:50. Deseja registrar como encaixe?"). A garantia, porém, vem do PostgreSQL: duas **exclusion constraints** recusam qualquer sobreposição de horários do mesmo profissional ou da mesma sala, exceto agendamentos cancelados ou com falta e, só para o profissional, o encaixe. Uma violação vira "Este horário acabou de ser ocupado por outro agendamento". O teste de integração dispara seis agendamentos ao mesmo tempo e espera que exatamente um dê certo.

Cada regra de conflito (profissional, sala, horário de atendimento, ausência, funcionamento da unidade, fechamento, horário passado, paciente) é uma função pequena e pura que diz se bloqueia, se aceita encaixe, se aceita exceção justificada ou se só avisa. As mesmas regras servem para salvar, para a prévia no painel, para as séries e para a busca "Próximo horário livre".

### 13.3 Implementação em 5 etapas

| Etapa | Commit | O que entrou |
|---|---|---|
| 1 — Documentação e base compartilhada | `f911906` | Atualização do PRD, ADR-024 a ADR-026 e os padrões de agenda do design system nos dois idiomas; `DateTimeRange` e os helpers de fuso no kernel compartilhado; detalhes de erro no retorno das ações; a base de PDF compartilhada e o provider do TanStack Query |
| 2 — Banco e domínio | `70139dd` | Migration `0007_scheduling` com cinco tabelas, as duas exclusion constraints, CHECKs e histórico só de inclusão; o agendamento como entidade de domínio com sua máquina de estados, as regras de conflito, a recorrência e a busca de horários livres, com testes unitários |
| 3 — Casos de uso | `4eeb3b3` | Agendar, editar, reagendar, mudar status, cancelar (também por série), séries, leituras da agenda com o feed de atualização, exportação do PDF; as implementações reais das portas de agendamentos da F02 à F05; 34 testes de integração |
| 4 — Telas | `5e88091` | A agenda com as visões Dia, Semana e Lista, o painel de agendamento (com cadastro rápido de paciente), o painel do agendamento, arrastar e soltar e movimento pelo teclado, "Próximo horário livre"; quatro jornadas E2E |
| 5 — Integrações | `4a63754` | A agenda imprimível, a aba Agendamentos na página do paciente e as configurações de motivos de cancelamento |

Verificação final: lint e tipos sem erros, 103 testes unitários, 184 testes de integração e 15 jornadas E2E passando.

### 13.4 Problemas encontrados na F06

| Problema | Causa | Solução |
|---|---|---|
| O build de produção falhou depois do painel de agendamento | Um Client Component importava o ponto de entrada público do módulo de pacientes, que também monta o banco e o Argon2, e o código de servidor foi parar no bundle do navegador | Cada módulo pode expor um ponto de entrada de cliente só com UI segura (`@/modules/patients/client`), liberado pela regra de lint. Registrado no **ADR-027** |
| O worker e o script de configuração pararam de iniciar | O `tsx` não resolvia os exports do pacote `@react-pdf` por import estático | O documento PDF é carregado sob demanda, só quando um PDF é gerado |
| Todas as jornadas E2E falharam depois da primeira | A primeira jornada espera 30 s pelo e-mail de convite, e o worker (iniciado pelo setup do E2E) levava cerca de 27 s para subir nesta máquina | O setup do E2E espera o job de inicialização do worker antes de começar as jornadas |
| Arrastar pelo teclado não fazia nada | O sensor de teclado do dnd-kit rola a página em vez de mover o bloco quando a página pode rolar | A própria grade da agenda trata o teclado: Espaço pega, setas movem, Espaço solta, Esc cancela, e cada passo é anunciado (ADR-025 atualizado) |
| Duas jornadas E2E "falharam" com o comportamento correto | O teste supunha que a profissional atendia até 18:00; a jornada da F04 tinha definido 08:00–12:00, e uma sessão caía nas férias dela | As jornadas agendam dentro do horário dela e pulam a sessão em conflito, o que também cobre o critério das séries |
| O Turbopack travou no segundo build | Cache deixado por um build interrompido | Apagar `.next` e compilar de novo |

### 13.5 O que a F06 deixou pronto

- **Agendamentos com histórico de status, histórico de reagendamentos e snapshot de preço**, lidos pela F07, F09, F10, F12, F13 e F14.
- **Eventos de domínio publicados dentro da transação**: chegada (para a cobrança da F09), conclusão e sua reversão (para o débito de pacote da F10), cancelamento e os demais.
- **As portas reais de agendamentos** para unidades, serviços, profissionais e pacientes: fechamentos, inativações e ausências agora contam agendamentos reais, e os profissionais veem os pacientes que atendem.
- **A base de PDF compartilhada** para documentos (F08), recibos (F09) e relatórios (F13).
- **Pontos de entrada de cliente** para módulos cuja UI é reaproveitada por outros módulos.

---

## 14. F16 — Internacionalização e Perfis de País

Antes de seguir para o prontuário e o financeiro, o produto ganhou uma funcionalidade nova no PRD: a **F16**. A interface passa a existir em português do Brasil, inglês e espanhol, e cada unidade segue as convenções do seu país (moeda, documentos, telefone, endereço, conselhos profissionais e fusos) para Brasil, Portugal, Espanha, México, Argentina, Chile, Colômbia e Estados Unidos. As regras legais continuam validadas só para o Brasil. Ela veio **antes** da F07 de propósito: extrair os textos e colocar moeda em cada valor custa pouco com seis funcionalidades prontas, e custaria uma migração de registros financeiros depois da F09.

### 14.1 Decisões tomadas na entrevista

| Decisão | Resultado |
|---|---|
| Biblioteca | next-intl, sem prefixo de idioma na URL: o idioma é `user.locale ?? organization.defaultLocale` e vai no `RequestContext` |
| Onde ficam os textos | Um catálogo por módulo e idioma (`src/modules/<módulo>/messages/{pt-BR,en,es}.json`) e catálogos compartilhados (`common`, `validation`, `shell`, `countries`, `email`) |
| Casos de uso sem texto | Erros e validações carregam **chaves** de mensagem e parâmetros; a fronteira (Server Action, rota, worker, PDF) traduz |
| Dinheiro | `amount_minor` inteiro + `currency` em toda coluna de valor; `Money` recusa somar moedas diferentes e os totais são agrupados por moeda |
| Países | Um registro tipado por país em `src/shared/kernel/countries/` (documentos, identificação fiscal, telefone, endereço, conselhos, meios de pagamento, fusos) |
| Fusos com horário de verão | Toda conversão de hora local para instante passa por `zonedTimeToUtc`, com testes nas transições reais de 2026 e 2027 |
| Traduções | Feitas junto com a extração, seguindo um glossário do design system; en e es foram revisadas e aceitas pela pessoa responsável pelo produto |

As decisões viraram o **ADR-028** (catálogos com next-intl), o **ADR-029** (perfis de país e dinheiro com moeda) e o **ADR-030** (calendário correto com horário de verão, substituindo o ADR-021). A especificação e o plano estão em [F16-internationalization-and-country-profiles/](F16-internationalization-and-country-profiles/).

### 14.2 Implementação

| Etapa | Commit | O que entrou |
|---|---|---|
| PRD e especificação | `5276be5`, `f480feb` | F16 no PRD nos dois idiomas; spec e plano |
| 1 — Núcleo de idiomas | `a89d228` | ADRs 028–030, resolução do idioma, tradutor no servidor, formatadores, shell traduzido e seletor de idioma |
| 2 — Kernel de países | `c9ad64d` | Perfis dos oito países, documentos, telefones (libphonenumber-js), endereços genéricos, `Money` e as conversões de fuso |
| 3 — Modelo de dados | `fe8f9be` | Migration `0008_internationalization`: país e moeda por unidade, `service_price` por moeda, `professional_registration` por país, documentos e telefones genéricos |
| 4 — Tudo traduzido | `12d9f9a` | Todas as telas, e-mails e o PDF da agenda nos três idiomas; regra de lint que recusa texto literal em JSX; teste que falha quando uma chave, uma mensagem ICU ou um parâmetro difere entre os idiomas |
| Ajustes | `6f66ec7`, `c3e2638` | Teste do idioma do PDF da agenda; índices declarados no schema do Prisma para o `migrate dev` não tentar removê-los |

Foi a maior mudança até aqui (345 arquivos), porque tocou todas as telas existentes. Em seguida, os **dados de demonstração** (`npm run seed:demo`, PR #19) foram atualizados para o modelo novo: serviços com preço por moeda, profissionais com registro no conselho, pacientes e uma semana de agendamentos, com duas usuárias de exemplo.

### 14.3 O que a F16 deixou pronto

- **Catálogos por módulo** e a regra de que nenhum texto de interface é literal no código: cada funcionalidade nova já nasce em três idiomas.
- **Perfis de país** usados nos formulários e, depois, nos documentos (F08), recibos (F09) e relatórios (F13).
- **Dinheiro com moeda** antes de existir qualquer cobrança.

---

## 15. Sétima funcionalidade: F07 — Registro do Atendimento Clínico

A F07 é o prontuário: o profissional escreve o registro de cada atendimento, anexa exames e fotos, lê o histórico do paciente e, depois de 24 horas, só pode complementar com adendos. É o dado mais sensível do produto, então a especificação começou pelo que o banco precisa garantir mesmo que a aplicação tenha um bug.

### 15.1 Decisões tomadas na entrevista

| Decisão | Resultado |
|---|---|
| Upload dos anexos | Direto do navegador para o bucket por URL pré-assinada, com tipo e tamanho assinados; o servidor confirma lendo os primeiros bytes do arquivo (**ADR-031**) |
| Formato do texto | Editor Tiptap e HTML sanitizado no servidor com uma lista curta de tags permitidas (**ADR-032**) |
| Quando o relógio de 24 horas começa | Na criação do rascunho, ou seja, no primeiro salvamento com texto |
| Rascunho nunca finalizado | É finalizado automaticamente ao fim das 24 horas e marcado "Finalizado automaticamente" (PRD atualizado) |
| Editar um registro finalizado | Um rascunho de edição que só o autor vê; "Salvar alterações" guarda o conteúdo anterior como versão |
| Alertas clínicos | Um campo por paciente ("Alergia a dipirona"), com histórico, mostrado só nas telas clínicas |
| Cópia no navegador | Só quando um salvamento falha, removida ao sair do sistema |
| Anexos | Só enquanto o registro pode ser editado; o que chegar depois vai para os documentos do paciente (F08) |

### 15.2 O que o banco garante

- **Bloqueio de 24 horas:** um *trigger* recusa qualquer alteração de conteúdo depois de `locks_at`.
- **Um registro por agendamento:** índice único parcial.
- **Histórico só de inclusão:** versões, adendos e o histórico de alertas não têm `UPDATE` nem `DELETE` para o usuário da aplicação, e nenhuma tabela clínica tem `DELETE`.

Toda leitura de registro é auditada, e toda tentativa sem permissão gera 403 e um evento de permissão negada.

### 15.3 Implementação em 5 etapas

| Etapa | Commit | O que entrou |
|---|---|---|
| 1 — Documentação e base | `dfc67a5` | PRD, ADR-031 e ADR-032, padrões do design system; armazenamento com leitura parcial, URL pública do storage e CSP |
| 2 — Banco e domínio | `52be141` | Migration `0009_clinical_records` com sete tabelas, o trigger de bloqueio e as permissões; o ciclo de vida do registro como entidade de domínio |
| 3 — Casos de uso e jobs | `83af942` | Rascunho, finalização, edição, adendos, anexos, alertas; conversão de HEIC, finalização automática e limpeza de uploads no worker |
| 4 — Telas | `a987efa` | Tela dividida do prontuário, editor com salvamento automático e cópia local, anexos com progresso e miniaturas |
| 5 — Integrações | `d2085bf` | Aba Prontuário no paciente, "Abrir prontuário" e o lembrete na agenda, jornadas E2E |
| Correções do CI | `d0f3739` | Ver 15.4 |

Depois do merge (PR #20), um segundo PR (#21) trouxe o script que aplica a regra de CORS no bucket (`npm run setup:storage-cors`) e o teste de conversão de HEIC com uma foto real.

### 15.4 Problemas encontrados na F07

| Problema | Causa | Solução |
|---|---|---|
| O upload pré-assinado voltava com `400 BadDigest` | O SDK da AWS calcula um checksum por padrão, e o checksum assinado não batia com o arquivo enviado pelo navegador | `requestChecksumCalculation: "WHEN_REQUIRED"` no cliente S3 |
| Texto digitado logo depois de clicar em Negrito sumia (só no CI) | O clique no botão tirava o foco do editor | Os botões da barra não tiram o foco (`preventDefault` no `mousedown`), e o teste espera o editor focado |
| Teste de agendamentos simultâneos falhou no CI | Com seis reservas ao mesmo tempo, o PostgreSQL às vezes resolve o conflito com *deadlock* em vez da violação da constraint | *Deadlock* e erro de serialização também viram "Este horário acabou de ser ocupado" |
| A cópia local do rascunho continuava depois de criar o registro | Ela ficava sob a chave do rascunho "novo", e só a chave do registro era apagada | Limpar as duas chaves ao confirmar o salvamento |
| O PR foi mergeado antes do último commit | O commit foi enviado depois do merge e ficou fora da `main` | Branch nova a partir da `main` com o commit e um PR separado (#21) |

### 15.5 O que a F07 deixou pronto

- **Registros clínicos, versões, adendos e anexos** lidos pela linha do tempo e pela exportação LGPD (F14).
- **Upload direto ao bucket** com confirmação pelos bytes, reaproveitado pelos documentos (F08).
- **A regra de acesso clínico** (`canAccessPatientRecords`), que a F08 usa nas categorias clínicas.

---

## 16. Ambientes: desenvolvimento e produção

Ao planejar como a regra de CORS será aplicada no R2 quando houver produção, apareceu um risco: os scripts de operação liam sempre o `.env`, que aponta para o ambiente local. A separação ficou pronta antes do primeiro deploy (que ainda não aconteceu):

- **`.env`**: desenvolvimento local, sem mudança.
- **Produção**: a aplicação e o worker recebem as variáveis dos *secrets* da hospedagem; nenhum `.env*` entra na imagem Docker.
- **`.env.prod`** (modelo em `.env.prod.example`, ignorado pelo git): só para rodar da própria máquina `npm run setup:storage-cors:prod` e `npm run setup:admin:prod`. Os scripts mostram o destino (host do banco, bucket, URL), sem credenciais, antes de gravar.

O nome não é `.env.production` de propósito: o Next.js carrega esse arquivo em todo `next build`, e um build local passaria a usar o banco e o bucket de produção sem ninguém perceber.

---

## 17. Oitava funcionalidade: F08 — Documentos do Paciente

A F08 guarda os arquivos do paciente (exames, cópias de documentos, termos assinados) e emite documentos a partir de modelos (atestado, declaração de comparecimento, receituário). Como a F07, ela lida com dado de saúde, então a especificação começou pelo que o banco precisa garantir e pelo que a recepção pode ou não ver.

### 17.1 Decisões tomadas na entrevista

| Decisão | Resultado |
|---|---|
| Escopo | Essencial e Completo juntos: envio, categorias, cota, arquivamento, modelos e PDF |
| Cota de 50 GB | Conta só os arquivos da F08 (enviados e gerados) e bloqueia só os envios; PDFs gerados somam, mas nunca são bloqueados |
| Categorias clínicas | Exame e Laudo externo nascem clínicas; a recepção pode enviar para elas, mas depois não vê o arquivo |
| Indicador clínico | Só pode ser ligado, nunca desligado, e um gatilho do banco garante isso |
| Correções | Gerente e Administrador restauram arquivados; quem enviou, ou um gestor, corrige título e categoria; documento emitido não muda |
| Alerta de 80% | Aviso no diálogo de envio, uso nas configurações e um e-mail aos administradores a cada vez que o uso cruza 80% |
| Quem assina | Em modelo clínico, só o profissional do próprio usuário; em modelo comum, qualquer profissional ativo |

As decisões viraram o **ADR-033** (código compartilhado entre F07 e F08, contador de cota sob trava e `frame-src` para a pré-visualização) e uma seção nova no design system (5.13). A especificação e o plano estão em [F08-patient-documents/](F08-patient-documents/).

### 17.2 O que o banco garante

- **Cota sem corrida:** uma linha por organização guarda o total de bytes e é atualizada sob trava na mesma transação do documento; dois envios que terminam juntos não passam ambos do limite.
- **Indicador clínico irreversível:** um gatilho recusa a mudança de verdadeiro para falso.
- **Sem exclusão:** documentos, categorias e modelos não têm `DELETE`; arquivar e desativar escondem sem apagar.
- **Padrões criados uma vez:** índices únicos parciais e `ON CONFLICT DO NOTHING` fazem duas primeiras utilizações simultâneas criarem um só conjunto de categorias e modelos.

### 17.3 Implementação em 5 etapas

| Etapa | O que entrou |
|---|---|
| 1 — Documentação e base | PRD, ADR-033 e design system; detecção de tipo pelos bytes (com DOCX), conversão de HEIC, sanitizador e editor Tiptap movidos para `src/shared`; conversor de HTML para PDF; permissões, fila e e-mail da cota |
| 2 — Banco e módulo | Migration `0010_patient_documents`, domínio puro (limites, cota, variáveis de modelo), portas, políticas e catálogos nos três idiomas |
| 3 — Envio e correções | Categorias, cota, envio direto ao bucket com confirmação, HEIC no worker, listagem com regra clínica, abertura auditada, arquivar e restaurar, aba Documentos |
| 4 — Modelos e PDF | Modelos com variáveis e campos livres, resolvedores, prévia, geração sem documento parcial, diálogo "Emitir documento" e a página de configurações |
| 5 — Acabamento | Dados de demonstração, jornadas E2E, revisão do design system e este diário |

O trabalho foi para o PR #24, e os quatro jobs do CI (qualidade, integração, E2E e imagem Docker) passaram no commit da implementação.

### 17.4 Problemas encontrados na F08

| Problema | Causa | Solução |
|---|---|---|
| Os arquivos começavam a subir assim que eram soltos | O PRD pede escolher a categoria de cada arquivo antes do envio | A fila ganhou o estado "aguardando": o envio só começa em "Enviar" |
| O PDF falharia com negrito e itálico no texto do modelo | A fonte do PDF só tinha o itálico em woff2 variável, que o motor não lê | Fonte estática itálica (OFL) junto das outras |
| Um receituário não cabia no campo livre | O limite de 200 caracteres era pequeno demais para uma prescrição | Campos livres com até 1.000 caracteres e várias linhas |
| Os testes precisavam trocar o renderizador e o armazenamento | A regra de lint proíbe importar arquivos internos de outro módulo, inclusive em testes | `createDocuments(adjust)` na API pública troca um adaptador sem expor o módulo |
| O teste de renderização do PDF não rodava como unitário | O `tsx` não resolve os exports do `@react-pdf` por import estático | O analisador do HTML foi separado (unitário) e a renderização ficou no teste de integração |
| O alerta de 80% não aparecia no teste | A conta do teste deixava o uso abaixo do limite depois do envio | Teste corrigido; a regra de cruzamento tem teste próprio |
| Os envios do navegador falharam em todas as jornadas E2E, inclusive as do F07 | Rodar `setup:storage-cors` no ambiente local gravou no bucket uma regra só para `localhost:3001`, que substitui as origens liberadas pelo servidor SeaweedFS (3000, 3001 e 3101) | O script aceita várias origens separadas por vírgula, e o bucket local recebeu as três; a regra vale por bucket, então cada ambiente precisa listar todas as suas origens |

### 17.5 O que a F08 deixou pronto

- **Registros de documento** (tipo, categoria, título, data, autor, arquivo e indicador clínico) lidos pela linha do tempo e pela exportação LGPD (F14).
- **Código compartilhado** de envio direto, conversão de imagem, sanitização e edição de texto rico, usado também pelo prontuário.
- **Base de PDF** com texto rico e assinatura, reaproveitável por recibos (F09) e relatórios (F13).

---

## 18. Nona funcionalidade: F09 — Cobrança e Pagamentos

A F09 transforma a chegada do paciente em dinheiro a receber: cria a cobrança, aceita descontos, recebe pagamentos (inteiros ou parciais), estorna, cancela e emite o recibo. É a primeira funcionalidade que **escreve dinheiro**, então a especificação começou pelo que o banco precisa recusar mesmo que a aplicação erre. A F10 (pacotes), a F11 (caixa), a F12 e a F13 (painel e relatórios) e a F14 (linha do tempo) leem estas tabelas.

### 18.1 Decisões tomadas na entrevista

| Decisão | Resultado |
|---|---|
| Aprovação de desconto acima de 20% | O gestor digita um **PIN pessoal de 6 dígitos**, definido por ele no menu do usuário (pede a senha atual); 5 erros bloqueiam o PIN por 15 minutos. Ou a recepção envia para a lista de aprovações |
| Cálculo do desconto | Sobre o valor bruto, percentual arredondado para baixo; só muda enquanto não houver pagamento; rejeitar remove o desconto e reabre a cobrança |
| Formas de pagamento | Códigos fixos do perfil de país; a clínica só liga e desliga por país, e ao menos uma fica ativa |
| Desfazer a chegada | Recusado se já houver pagamento; sem pagamento, a cobrança é apagada (fica na auditoria) |
| Recibo | Um PDF por cobrança, gerado na hora no idioma da organização, sem guardar |
| Moeda | O pagamento só entra em unidade com a moeda da cobrança |
| Itens | Um item por cobrança (serviço ou descrição livre) |
| Estorno | Total ou parcial, na unidade selecionada, com a forma do pagamento original |

As decisões viraram o **ADR-034** (recusa por handler de evento, PIN e regras de dinheiro no banco) e a seção 5.14 do design system. A especificação e o plano estão em [F09-billing-and-payments/](F09-billing-and-payments/).

### 18.2 O que o banco garante

- **Sem pagamento a maior:** uma restrição `CHECK` mantém o valor pago entre zero e o líquido; dois recebimentos simultâneos passam por uma trava de linha da cobrança.
- **Uma cobrança viva por agendamento:** índice único parcial; cobrança cancelada não conta.
- **Moeda coerente:** o pagamento aponta para a cobrança por uma chave estrangeira composta que inclui a moeda.
- **Envio duplicado:** a chave de idempotência é chave primária; repetir o envio devolve o que foi gravado.
- **Sem apagar dinheiro:** pagamentos, envios e decisões de desconto não têm `DELETE`; uma cobrança com pagamento não pode ser apagada.

### 18.3 Implementação em 5 etapas

| Etapa | O que entrou |
|---|---|
| 1 — Documentação e base | PRD, ADR-034 e design system; `EventRejection` (um handler pode recusar a operação que o publicou); PIN de aprovação no módulo de identidade; porta que impede mudar o país de uma unidade com cobranças |
| 2 — Banco e domínio | Migrations `0011_approval_pin` e `0012_billing`; agregado `Charge` com desconto, status derivado, pagamentos, estorno e cancelamento; repositórios, leituras e catálogos nos três idiomas |
| 3 — Cobranças e pagamentos | Cobrança automática na chegada e remoção ao desfazer, cobrança avulsa e de pacote, descontos e aprovações, pagamentos idempotentes, estornos, cancelamento, consultas, formas de pagamento e recibo em PDF |
| 4 — Telas | Seção "Cobrança" no painel da agenda, modal "Receber", aba Financeiro do paciente, Financeiro > Cobranças, detalhe, Aprovações e a página de configurações |
| 5 — Acabamento | Dados de demonstração, jornadas E2E, revisão do design system e este diário |

O trabalho foi para o PR #25. Os jobs de qualidade, integração e imagem Docker passaram de primeira; o de migrations/E2E acusou desvio entre o `schema.prisma` e o banco (ver 18.4) e passou depois da correção.

### 18.4 Problemas encontrados na F09

| Problema | Causa | Solução |
|---|---|---|
| O desfazer da chegada precisava ser recusado pela cobrança | O módulo de agenda não conhece cobranças, e uma porta que "pergunta antes" abriria uma corrida com o recebimento | `EventRejection`: o handler lança um erro de domínio, a transação desfaz tudo e o chamador recebe o erro como resultado (ADR-034) |
| A contagem de PINs errados sumia quando a operação falhava | Uma transação que retorna falha é desfeita, inclusive o contador | A verificação do PIN roda em transação própria, antes da operação de cobrança |
| Dois recebimentos simultâneos de 150 sobre 200 | Sem trava, os dois leem o saldo de 200 | Trava de linha (`FOR UPDATE`) na cobrança; o segundo recebe "maior que o saldo"; a restrição do banco é a segunda barreira |
| A mensagem de saldo mostrava centavos | Os erros carregam valores em unidades menores, sem idioma | A camada de aplicação formata os valores no idioma e no formato do país da unidade antes do limite com a interface |
| O PIN não podia viver no cadastro de senha | O menu do usuário é compartilhado e não pode importar o módulo de identidade | O menu recebe `extraItems` e o layout da aplicação compõe o item do PIN |
| O CI acusou desvio do esquema (`prisma migrate diff`) | As chaves estrangeiras e o índice único escritos à mão na migration não estavam declarados no `schema.prisma` | Relações e `@@unique` declarados no esquema, com `onUpdate: NoAction`; o desvio agora é conferido localmente antes do PR |
| O painel da agenda não podia importar a cobrança | Cobrança depende da agenda (eventos), e o inverso criaria um ciclo | A agenda aceita um componente de seção; a página da agenda o compõe |

### 18.5 O que a F09 deixou pronto

- **Registros de cobrança e pagamento** (paciente, origem, serviço, profissional, unidade, valores, status, forma, data e usuário) para a F11, F12, F13 e F14.
- **Portas para a F10 e a F11:** `ChargeExemptionPolicy` (pacote cobre o atendimento) e `CashRegisterGate` (caixa fechado), ambas com padrão inerte, mais a criação de cobrança de pacote.
- **Eventos** `ChargeCreated`, `PaymentRegistered` e `PaymentRefunded`, publicados dentro da transação, para o caixa.
- **Recibo em PDF** sobre a base compartilhada.

---

## 19. Décima funcionalidade: F10 — Pacotes de Sessões

A F10 vende um pacote de sessões (por exemplo, 10 sessões de fisioterapia), vincula agendamentos a ele e debita uma sessão a cada atendimento concluído. Ela atravessa três módulos que não podem se conhecer (agenda, cobrança e o novo `packages`), então a especificação partiu de **quem é dono de cada fato**: a agenda é dona do agendamento, a cobrança é dona do dinheiro, o pacote é dono do saldo.

### 19.1 Decisões tomadas na entrevista

| Decisão | Resultado |
|---|---|
| Como a agenda fala com o pacote | Leva no evento um id de pacote **opaco** e um modo (`STRICT` para um agendamento, `UP_TO_BALANCE` para uma série); o tratador de pacotes vincula dentro da transação da agenda ou recusa com `EventRejection` (ADR-034) |
| Saldo livre | Total − usadas − perdidas − vínculos abertos; vincular além disso é recusado |
| Quando debita | Na conclusão; desfazer a conclusão devolve a sessão. Falta debita só se a organização ligou essa configuração; caso contrário o vínculo é liberado. Cancelar libera |
| Venda | A cobrança (origem PACOTE) e o pacote nascem em **uma só transação**. Preço abaixo do modelo vira desconto da F09 (com as mesmas regras de 10% e 20%); preço acima é recusado |
| Validade | Dias corridos, o dia da venda conta como dia 1; o gestor prorroga até 365 dias no total, só com o pacote ativo |
| Expiração | Uma tarefa diária, depois de 00:10 no fuso de cada organização, perde as sessões não usadas; cada execução é registrada para poder repetir com segurança |
| Cancelamento | A cobrança da venda sem pagamento é anulada na mesma transação; cobrança paga continua para o fluxo de estorno da F09 |
| Permissões | Nenhuma ação nova: `setup:manage` para modelos, `billing:operate` para vender e vincular, `billing:approve` para prorrogar e cancelar; Profissional não tem acesso |

As decisões viraram o **ADR-035** (vínculo opaco, venda atômica, razão só de inclusão) e a seção 5.15 do design system. A especificação e o plano estão em [F10-session-packages/](F10-session-packages/).

### 19.2 O que o banco garante

- **Sem débito duplo:** um índice único parcial permite um vínculo vivo (`LINKED` ou `DEBITED`) por agendamento.
- **Saldos coerentes:** restrições `CHECK` sobre sessões usadas, perdidas e totais, sobre a validade e o status.
- **O razão nunca muda:** `package_movement` não tem `UPDATE` nem `DELETE`; pacotes, modelos e vínculos não podem ser apagados.
- **Dois vínculos simultâneos:** a linha do pacote é travada, então dois agendamentos não levam a última sessão.

### 19.3 Implementação em 5 estágios

| Estágio | O que entrou |
|---|---|
| 1 — Documentação e pontos de integração | Esclarecimentos do PRD, ADR-035, design system; a agenda carrega o vínculo e o mostra; funções da cobrança que entram na transação de quem chama (cobrança, desconto, anulação) |
| 2 — Banco e domínio | Migração `0013_packages`; o agregado `SessionPackage` (vender, vincular, debitar, devolver, expirar, prorrogar, cancelar) com seu razão |
| 3 — Casos de uso | Modelos, venda atômica, tratadores dos eventos do agendamento, prorrogação, cancelamento, expiração e consultas |
| 4 — Telas | Configurações > Pacotes, os cartões de pacote do paciente com o diálogo de venda, "Usar pacote" nos formulários de agendar e editar, e a marca "Sessão 4/10" na agenda |
| 5 — Acabamento | A tarefa de expiração no worker, dados de demonstração, jornadas E2E, revisão do design system e este diário |

### 19.4 Problemas encontrados na F10

| Problema | Causa | Solução |
|---|---|---|
| Declarar toda chave estrangeira no `schema.prisma` | O desvio no CI da F09 veio de chaves estrangeiras escritas à mão | Todas as relações da migração foram declaradas com `onUpdate: NoAction` e a checagem de desvio rodou localmente antes do PR |
| `charge` e `patient_package` apontariam um para o outro | A cobrança conhece o pacote e o pacote conhece a cobrança | O pacote guarda a chave estrangeira para a cobrança; a cobrança guarda só o id, sem chave estrangeira |
| A agenda não pode importar pacotes | Pacotes já dependem de eventos da agenda | Uma porta `PackageLinkLookup` na agenda com padrão inerte; pacotes registram a real na inicialização |
| Testes falharam com "proibido" e "cedo demais" | A recepção não inicia nem conclui atendimento, e a falta exige que o atendimento já tenha começado | Os testes agem como o profissional, e um auxiliar leva o agendamento para o passado |

### 19.5 O que a F10 deixou pronto

- **Dados de pacote e razão** (vendido, usado, perdido, expirado, com preço e unidade) para F11, F12 e F13.
- **Um caminho de recusa** (`EventRejection`) usado pela segunda vez, agora para proteger o saldo.
- **A marca na agenda** e a porta `PackageLinkLookup`, que outros módulos podem reusar para decorar agendamentos.

---

## 20. Décima primeira funcionalidade: F11 — Caixa e Despesas

A F11 fecha o dia do dinheiro: o caixa da unidade (o que entrou, o que saiu da gaveta, o que foi contado), as despesas e outras receitas da clínica, e o extrato que junta tudo. A pergunta central da especificação foi **onde mora a verdade sobre os pagamentos**: na cobrança, que o caixa apenas lê.

### 20.1 Decisões tomadas na entrevista

| Decisão | Resultado |
|---|---|
| Escopo | Núcleo e completo juntos: o caixa, despesas, receitas manuais, recorrência mensal e o extrato |
| Pagamentos no caixa | **Lidos da cobrança, nunca copiados**; o fechamento guarda um retrato dos totais por forma de pagamento |
| Pagamento antes de abrir o caixa | Aceito, e aparece quando o caixa abrir; só um caixa **fechado** bloqueia |
| Saldo de abertura | Sugerido a partir do dinheiro contado no último fechamento da unidade; alterá-lo exige motivo |
| Dias passados | A recepção abre só o de hoje; o gestor abre uma data passada; ninguém abre o futuro; a recepção pode fechar um dia esquecido |
| Corrigir uma movimentação | Nunca editada nem apagada: é **estornada** com motivo e continua visível, riscada |
| Categorias | Uma tabela configurável de categorias de despesa, receita e transferência; "Transferência" move dinheiro para dentro e para fora da gaveta e fica fora do extrato |
| Extrato | Inclui as movimentações manuais do caixa, começa em um saldo anterior e usa uma moeda por vez |
| Recorrência | Uma despesa mensal cria 12 ocorrências e um job diário mantém 12 à frente até um gestor encerrar a série |
| Permissões | Ações novas: `cash:operate` (recepção e gestores), `cash:reopen` e `finance:manage` (gestores) |

As decisões viraram o **ADR-036** e a seção 5.16 do design system. A especificação e o plano estão em [F11-cash-register-and-expenses/](F11-cash-register-and-expenses/).

### 20.2 O que o banco garante

- **Um caixa por unidade e dia:** um índice único; abrir um dia que já tem caixa devolve o existente.
- **Fechamentos são imutáveis:** sem `UPDATE` nem `DELETE`; um `CHECK` liga a diferença ao dinheiro contado e ao esperado e exige justificativa de 10 caracteres quando ela não é zero.
- **Nada é apagado:** caixas, movimentações, lançamentos e pagamentos não têm `DELETE`; o estorno de uma movimentação e de um pagamento são `CHECK`s de tudo ou nada; só um lançamento pendente pode ser excluído logicamente.
- **Fechamento e pagamentos não se cruzam:** o fechamento trava a linha do caixa (`FOR UPDATE`); o gate que a cobrança chama em todo pagamento pega a mesma linha `FOR SHARE`.

### 20.3 Implementação em 5 estágios

| Estágio | O que entrou |
|---|---|
| 1 — Documentação e pontos de integração | PRD, ADR-036, design system; o gate virou uma pergunta de sim ou não, com a cobrança mantendo sua mensagem; a leitura de pagamentos; as três permissões |
| 2 — Banco e domínio | Migração `0014_cash`; o agregado do caixa, o dinheiro esperado, lançamentos, datas da recorrência e o extrato, tudo puro e com testes unitários |
| 3 — Casos de uso | Abertura, movimentações, fechamento, reabertura, lançamentos, séries, categorias, extrato, comprovantes e os jobs de sistema |
| 4 — Telas | Financeiro > Caixa, Despesas, Receitas e Extrato, e as categorias financeiras em Configurações |
| 5 — Acabamento | Os jobs do worker, dados de demonstração, jornadas E2E, revisão do design system e este diário |

### 20.4 Problemas encontrados na F11

| Problema | Causa | Solução |
|---|---|---|
| Um pagamento podia entrar em um dia que estava sendo fechado | Duas transações, uma lendo o dia e outra gravando um pagamento | O gate pega a linha do caixa `FOR SHARE` dentro do pagamento; o fechamento lê os pagamentos só depois de segurar a linha `FOR UPDATE` |
| O gate devolvia um erro do caixa para a cobrança | A mensagem pertence à operação que falha, não ao caixa | `isClosed` responde um booleano e a cobrança monta o próprio erro com o nome da unidade |
| O job de recorrência recriaria uma ocorrência que o usuário excluiu | A ocorrência excluída mantém o índice, mas uma lista ingênua a ignorava | A lista de índices existentes inclui as ocorrências excluídas |
| Uma transferência inflava o extrato | Levar dinheiro ao banco não é receita | Transferências contam no dinheiro esperado e são filtradas do extrato |
| Nomes do seed colidiram | O seed já tinha `categories` e `categoryOf` para serviços | As variáveis financeiras ganharam nomes próprios |

### 20.5 O que a F11 deixou pronto

- **Caixas, fechamentos e lançamentos** (com unidade, categoria, moeda e datas) para a F12 e a F13.
- **Uma porta com implementação real:** `CashRegisterGate`, então um dia fechado recusa pagamentos e estornos.
- **Envio de comprovantes** no mesmo caminho do armazenamento privado dos documentos.

---

## 21. Problemas encontrados e como foram resolvidos

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

## 22. Como reproduzir o ambiente do zero

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

# 7. Opcional, depois de aceitar o convite: serviços, profissionais, pacientes e agendamentos
#    de demonstração (usuários rita@ e beatriz@clinicademo.com.br, senha Demo2026senha)
npm run seed:demo
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

### Operação em produção

Os scripts de operação têm uma versão `:prod`, que lê o `.env.prod` (copie de `.env.prod.example`). Cada um mostra o destino antes de gravar:

```bash
npm run setup:storage-cors:prod -- --dry-run   # confira bucket e origem
npm run setup:storage-cors:prod                # regra de CORS do bucket (ADR-031)
npm run setup:admin:prod -- --org-name "..." --admin-name "..." --admin-email ...
```

---

## 23. Lições aprendidas

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
14. **Teste unitário verde não é tela funcionando.** Três problemas reais da F06 (build de produção quebrado, worker que não subia mais, arrastar pelo teclado que não fazia nada) só apareceram no build de produção e nas jornadas no navegador.
15. **Quando um teste falha, confira primeiro se o produto está certo.** Duas falhas de E2E eram a agenda recusando corretamente um agendamento fora do horário da profissional e durante as férias dela; a correção estava nas premissas do teste, não no código.
16. **Um merge não espera o último push.** O PR da F07 foi mergeado enquanto um commit de correção ainda subia, e o commit ficou fora da `main`. Antes de mergear, conferir se o CI verde é do último commit da branch.
17. **Todo script de operação deve dizer onde vai gravar.** Rodar o script do CORS "para produção" teria gravado no ambiente local, sem erro nenhum. Mostrar o destino antes e ter um `--dry-run` evita esse engano.
18. **Compartilhe o que duas funcionalidades usam antes de copiar.** O envio direto, a conversão de HEIC, o sanitizador e o editor nasceram no prontuário; a F08 os moveu para `src/shared` no primeiro estágio, e o prontuário continuou passando nos mesmos testes. Copiar teria feito as duas versões se afastarem.
19. **Regra de dados sensíveis vira regra do banco.** O indicador clínico que nunca desliga e a cota sem corrida estão em gatilho e trava de linha, não só no código: um erro de aplicação não os quebra.
