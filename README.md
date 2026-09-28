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
- **Documentação como artefato de trabalho:** PRD e briefing mantidos em português e inglês, com rastreabilidade entre problema → funcionalidade → história de usuário → critério de aceitação.

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

- **Frontend/Backend:** Next.js
- **ORM:** Prisma
- **Banco de dados:** PostgreSQL
- **Idioma da interface:** pt-BR · **Moeda:** BRL

## Documentação

| Documento | Português | English |
|---|---|---|
| PRD (requisitos completos) | [docs/prd.pt-BR.md](docs/prd.pt-BR.md) | [docs/prd.en.md](docs/prd.en.md) |
| Briefing do produto | [docs/briefing.pt-BR.md](docs/briefing.pt-BR.md) | [docs/briefing.en.md](docs/briefing.en.md) |

O PRD é a fonte de verdade sobre escopo, funcionalidades (F01–F15), dependências entre elas e critérios de aceitação.

## Estrutura do repositório

```
docs/     PRD e briefing do produto (pt-BR e en)
```

## Status e roadmap

- [x] Briefing e PRD completo
- [ ] Especificação técnica por funcionalidade
- [ ] Implementação (Next.js + Prisma)
- [ ] Deploy de uma versão de demonstração

## Como rodar localmente

Ainda não há código de aplicação neste repositório — o projeto está na fase de especificação. Esta seção será atualizada com instruções de setup, variáveis de ambiente e scripts assim que o scaffold do Next.js for criado.
