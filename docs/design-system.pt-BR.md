# Design system do GCli — "Tinta e Papel"

Este documento define a identidade visual e as regras de interface do GCli. É a referência para qualquer tela nova: quem seguir estas regras deve chegar ao mesmo resultado que qualquer outra pessoa do time.

Fonte do contexto: [PRD](prd.pt-BR.md) (seções 1 a 4) e a stack descrita na [arquitetura](architecture.pt-BR.md) (ADR-011 e ADR-020).

English version: [design-system.en.md](design-system.en.md).

---

## 0. Contexto e premissas

| Campo | Definição |
|---|---|
| Produto | GCli — plataforma web de gestão de clínicas: pacientes, agenda multiprofissional entre unidades e salas, atendimento clínico, documentos, pacotes, cobrança, caixa e indicadores |
| Público | Proprietário/Administrador, Gestor, Recepção e Profissional de saúde. Letramento digital moderado, uso sob pressão de tempo, muitas vezes com um paciente à frente |
| Plataforma | Web responsiva. Desktop na recepção; notebook, tablet e celular nas salas e em trânsito |
| Stack | Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui (Radix), ícones Lucide |
| Idioma e convenções | pt-BR, DD/MM/AAAA, `R$ 1.234,56`, CPF, PIX |

**Premissas adotadas** (o briefing não define marca nem referências visuais):
1. **Personalidade:** confiável, precisa, calma e calorosa sem ser informal. A clínica lida com saúde e dinheiro; a interface não pode parecer improvisada nem fria como um hospital.
2. **Sem logotipo definido.** O logotipo da clínica (enviado na F01) aparece no topo do menu; o GCli em si se apresenta só pelo nome, em texto.
3. **Modo claro é o principal.** Recepções são ambientes iluminados e as telas passam o dia ligadas. O modo escuro é suportado, mas desenhado como derivado.
4. **Fontes servidas pelo próprio sistema** (pacotes npm), sem requisições ao Google: mantém a decisão já tomada na F01 por privacidade (LGPD) e por funcionar em redes que interceptam HTTPS.

---

## 1. Direção visual

### 1.1 Conceito: "Tinta e Papel"

Antes dos sistemas, as clínicas funcionavam com três objetos: a **ficha do paciente**, o **livro de agenda** e o **livro-caixa**. Os três têm qualidades que a interface deve herdar:

- **Papel levemente quente**, não branco de tela: cansa menos a vista num turno de 8 horas.
- **Tinta azul-escura** para o que é ação e informação oficial, como a caneta-tinteiro que assina um documento.
- **Linhas finas** que organizam sem ocupar espaço: as pautas da agenda, as colunas do livro-caixa.
- **Lápis vermelho** só para o que exige atenção agora: o "agora" na agenda, o que está atrasado.
- **Carimbos** para estados: CONFIRMADO, FALTOU, PAGO. Retangulares, com borda, legíveis de longe.
- **Dupla sublinha** nos totais, como na contabilidade.

O resultado é uma interface com cara de **documento bem diagramado**, e não de painel de aplicativo genérico.

### 1.2 Princípios

| Princípio | O que significa na prática |
|---|---|
| **1. A informação é a interface** | Listas e tabelas com linhas finas no lugar de cards. Um card só existe quando agrupa algo que se move junto (um indicador do painel, um bloco da agenda). |
| **2. O tempo é a estrutura** | Agenda, histórico de preços, linha do tempo do paciente e caixa são lidos de cima para baixo, em ordem de tempo. Horários e datas ficam sempre na mesma coluna, à esquerda, com algarismos tabulares. |
| **3. Uma ação principal por tela** | Cada tela tem no máximo um botão primário (azul-tinta cheio). Todo o resto é secundário, discreto ou link. |
| **4. Estado sempre escrito** | Cor nunca aparece sozinha: todo estado tem um texto ("Faltou", "Pago") e, quando há espaço, um ícone. Daltônicos e telas ruins de recepção também precisam entender. |
| **5. Calma por padrão, alerta por exceção** | 90% da tela é papel e tinta. Cores de alerta são raras para manter o peso: se tudo é vermelho, nada é urgente. |
| **6. Velocidade percebida** | Nada se move sem motivo. Transições curtas (120–200 ms), sem animações de entrada em listas, foco do teclado sempre no lugar certo após cada ação. |

---

## 2. Cores

Os nomes dos tokens estão em inglês, como todo identificador de código do projeto: `paper` é o papel, `ink` é a tinta, `rule` é a linha fina, `ink-blue` é o azul-tinta e `terracotta` é a terracota. No texto deste documento, as cores são chamadas pelo nome em português.

### 2.1 Neutros: papel e tinta

| Token | Hex | Uso |
|---|---|---|
| `paper-0` | `#FBFAF7` | Superfície principal: área de conteúdo, tabelas, formulários, painéis |
| `paper-1` | `#F4F2EC` | Fundo da aplicação e do menu lateral; cabeçalho de tabela |
| `paper-2` | `#ECE9E1` | Hover de linha, item de menu ativo, fundo de campo desabilitado |
| `rule` | `#DCD8CE` | Linhas finas: divisórias, bordas de tabela e de painel |
| `rule-strong` | `#8F897C` | Borda de campos de formulário e de checkboxes (precisa de 3:1) |
| `ink-0` | `#1A1916` | Títulos |
| `ink-1` | `#2B2925` | Texto principal |
| `ink-2` | `#5F5B53` | Texto secundário: rótulos de coluna, metadados, ajuda, placeholders |
| `ink-3` | `#8A857A` | Somente texto desabilitado (isento de contraste pela WCAG) |

### 2.2 Cores da marca

| Token | Hex | Uso |
|---|---|---|
| `ink-blue` | `#22406E` | Cor primária: botão principal, links, item de menu ativo, foco, seleção |
| `ink-blue-hover` | `#1A3358` | Hover e pressionado do botão primário |
| `ink-blue-soft` | `#E6ECF5` | Fundo de seleção (linha selecionada, dia selecionado), destaque informativo |
| `ink-blue-border` | `#A9BBD8` | Borda de alertas informativos |
| `terracotta` | `#B4532A` | "Lápis vermelho": linha do agora na agenda, marcador de atrasado. Só em linhas e marcadores |
| `terracotta-text` | `#9C4423` | Texto em terracota (rótulo "agora", "atrasado 12 min") |

O azul-tinta foi escolhido em vez do azul-claro ou verde-água comuns em sistemas de saúde: é mais escuro e mais sério, combina com o papel quente e deixa o verde livre para significar "sucesso".

### 2.3 Cores semânticas

Cada cor semântica tem três tons: **texto**, **fundo** e **borda**. Elas aparecem em alertas, carimbos de estado e mensagens; nunca como fundo de áreas grandes.

| Função | Texto | Fundo | Borda | Exemplos |
|---|---|---|---|---|
| Sucesso | `#1E6B3F` | `#E5F2EA` | `#9CCBAE` | Confirmado, Pago, Caixa conferido |
| Aviso | `#7A4E00` | `#FBF0D5` | `#E2C47A` | Pagamento parcial, desconto aguardando aprovação |
| Erro / perigo | `#A8231C` | `#FBE7E4` | `#E8A9A2` | Faltou, erro de validação, diferença no caixa, ação destrutiva |
| Informação | `#22406E` | `#E6ECF5` | `#A9BBD8` | Avisos neutros, dicas, "12 agendamentos futuros foram mantidos" |

Botão destrutivo: fundo `#A8231C`, texto branco.

### 2.4 Cores dos serviços na agenda

A paleta de 16 cores dos serviços (F03) continua como está: chaves estáveis (`blue`, `emerald`...) convertidas em tons do Tailwind. Para que essas cores convivam com a identidade:
- Na agenda, um agendamento é um bloco **em papel** (`paper-0`), com **faixa de 4 px à esquerda** na cor do serviço e texto em tinta. A cor identifica, mas não carrega o texto.
- Em listas, a cor aparece como um círculo de 12 px antes do nome do serviço.
- Nunca usar a cor do serviço como fundo cheio com texto por cima.

**Cores dos profissionais (F04).** Cada profissional tem uma cor de agenda escolhida entre as mesmas 16 chaves. Ela aparece apenas como um círculo de 12 px antes do nome do profissional (listas, cabeçalhos de coluna da agenda, seletores), nunca como fundo de avatar ou de coluna. O avatar é um círculo com as iniciais em `ink-1` sobre `paper-2`.

### 2.5 Combinações permitidas e contraste

Razões de contraste calculadas (WCAG 2.2). Mínimos: 4,5:1 para texto, 3:1 para texto grande (≥ 18,66 px em negrito ou ≥ 24 px) e para bordas de componentes.

| Combinação | Contraste | Permitido para |
|---|---|---|
| `ink-0` sobre `paper-0` | 16,84:1 | Títulos |
| `ink-1` sobre `paper-0` | 13,91:1 | Todo texto |
| `ink-1` sobre `paper-1` | 12,97:1 | Todo texto |
| `ink-2` sobre `paper-0` | 6,47:1 | Texto secundário |
| `ink-2` sobre `paper-2` | 5,57:1 | Texto secundário em linha com hover |
| `ink-3` sobre `paper-0` | 3,52:1 | **Somente** texto desabilitado |
| `rule-strong` sobre `paper-0` | 3,33:1 | Bordas de campos e checkboxes |
| `ink-blue` sobre `paper-0` | 9,93:1 | Links, texto de destaque |
| Branco sobre `ink-blue` | 10,36:1 | Botão primário |
| `ink-blue` sobre `ink-blue-soft` | 8,72:1 | Seleção, alerta informativo |
| `terracotta` sobre `paper-0` | 4,78:1 | Linha do agora, marcadores |
| `terracotta-text` sobre `paper-0` | 6,16:1 | Rótulo "agora", "atrasado" |
| Texto de sucesso sobre fundo de sucesso | 5,64:1 | Carimbos e alertas |
| Texto de aviso sobre fundo de aviso | 6,35:1 | Carimbos e alertas |
| Texto de erro sobre fundo de erro | 6,04:1 | Carimbos e alertas |
| Branco sobre erro (`#A8231C`) | 7,19:1 | Botão destrutivo |

**Combinações proibidas:** `rule` como cor de texto (1,36:1); texto colorido sobre fundo colorido de outra família (verde sobre azul-suave, por exemplo); terracota como fundo de botão.

### 2.6 Modo escuro

Mesma lógica, invertida: um "papel noturno" quente, não preto puro.

| Token | Claro | Escuro |
|---|---|---|
| `paper-0` | `#FBFAF7` | `#1C1A17` |
| `paper-1` | `#F4F2EC` | `#161513` |
| `paper-2` | `#ECE9E1` | `#2A2824` |
| `rule` | `#DCD8CE` | `#34312C` |
| `rule-strong` | `#8F897C` | `#6E685D` |
| `ink-0` | `#1A1916` | `#F5F2EA` |
| `ink-1` | `#2B2925` | `#ECE8DF` |
| `ink-2` | `#5F5B53` | `#A8A296` |
| `ink-blue` | `#22406E` | `#9DB7E3` (texto sobre ele: `#161513`) |
| `terracotta` | `#B4532A` | `#E08A63` |
| Sucesso texto / fundo | `#1E6B3F` / `#E5F2EA` | `#8FD1A8` / `#132A1C` |
| Aviso texto / fundo | `#7A4E00` / `#FBF0D5` | `#E9C46A` / `#2B2210` |
| Erro texto / fundo | `#A8231C` / `#FBE7E4` | `#F2A097` / `#33150F` |

Contrastes no escuro: texto principal 14,92:1; texto secundário 7,19:1; azul-tinta 8,96:1; terracota 6,94:1; carimbos entre 8,17:1 e 9,39:1; bordas de campo 3,30:1.

---

## 3. Tipografia

### 3.1 Famílias

| Papel | Fonte | Pacote | Por quê |
|---|---|---|---|
| Títulos | **Source Serif 4** (variável, com tamanho óptico) | `@fontsource-variable/source-serif-4` | Dá o tom editorial de documento. Desenhada para tela, legível em tamanhos médios, acentuação completa do português |
| Interface e texto | **Source Sans 3** (variável) | `@fontsource-variable/source-sans-3` | Sóbria, alta legibilidade em tamanhos pequenos, algarismos tabulares (`tnum`), da mesma família de desenho da serifada |
| Códigos e IDs | **Geist Mono** (já instalada) | `geist` | Protocolos, IDs de auditoria, chaves PIX |

A serifada fica **só nos títulos** (de página, de seção e o nome do paciente na ficha). Tudo que se lê rápido, como botões, campos, tabelas e menus, usa a sem serifa.

### 3.2 Escala

Base de 15 px no desktop (interface densa para a recepção) e 16 px em telas menores que 768 px (evita o zoom automático do iOS nos campos).

| Estilo | Fonte | Tamanho / entrelinha | Peso | Uso |
|---|---|---|---|---|
| `page-title` | Serif | 28 / 34 px | 600 | Título de cada página ("Serviços", "Agenda") |
| `section-title` | Serif | 20 / 28 px | 600 | Seções dentro da página, título de painel lateral e de diálogo |
| `group-title` | Sans | 15 / 22 px | 600 | Grupo de lista (categoria de serviço), título de bloco de formulário |
| `body` | Sans | 15 / 22 px | 400 | Texto padrão, células de tabela, valores de campo |
| `body-strong` | Sans | 15 / 22 px | 600 | Nome do paciente em listas, valor principal de uma linha |
| `label` | Sans | 13 / 18 px | 600 | Rótulo de campo, rótulo de item de menu agrupado |
| `meta` | Sans | 13 / 18 px | 400 | Ajuda, metadados ("Alterado por Ana em 05/10/2026"), legendas |
| `column-label` | Sans | 12 / 16 px | 600, caixa alta, espaçamento 0,04 em | Cabeçalho de coluna de tabela e carimbos de estado |
| `figure` | Sans | 32 / 36 px | 600, tabular | Indicadores do painel e total do caixa |

### 3.3 Regras

- **Algarismos tabulares** (`font-variant-numeric: tabular-nums`) em tabelas, valores, horários, datas e qualquer coluna de números, para alinhar os dígitos.
- **Valores monetários** alinhados à direita, sempre com `R$` e duas casas.
- **Caixa alta** só nos cabeçalhos de coluna e nos carimbos. Nunca em botões, títulos ou frases.
- **Medida de linha:** no máximo 72 caracteres em textos corridos (ajuda, termos, notas clínicas).
- **Itálico** só para citação do paciente ou observação, nunca para ênfase de interface.
- **Peso 700 não existe** no sistema: 400 e 600 bastam. Hierarquia vem de tamanho, família e espaço.

---

## 4. Layout

### 4.1 Espaçamento

Base de 4 px. Só estes valores são usados:

| Token | Valor | Uso típico |
|---|---|---|
| `space-1` | 4 px | Entre ícone e texto pequeno |
| `space-2` | 8 px | Entre ícone e texto, entre botões lado a lado |
| `space-3` | 12 px | Padding vertical de linha de tabela compacta, entre rótulo e campo (6 px + 6 px) |
| `space-4` | 16 px | Padding de célula, entre campos de formulário, margem lateral no celular |
| `space-6` | 24 px | Entre blocos dentro de uma seção, gutter do grid |
| `space-8` | 32 px | Entre seções da página, margem lateral no desktop |
| `space-12` | 48 px | Antes de um título de página, estados vazios |

### 4.2 Estrutura da aplicação

```
┌───────────┬──────────────────────────────────────────────────────┐
│ Menu      │ Cabeçalho (56 px): seletor de unidade · usuário      │
│ lateral   ├──────────────────────────────────────────────────────┤
│ 248 px    │ Título da página (serif)              [Ação primária]│
│ paper-1   │ meta da página                                       │
│           │ ════════════════════════════════════════════════════ │ ← dupla linha
│           │ Filtros                                              │
│           │ Conteúdo (paper-0), máx. 1280 px                     │
└───────────┴──────────────────────────────────────────────────────┘
```

- **Menu lateral:** 248 px no desktop; recolhe para 56 px (só ícones, com dica) entre 1024 e 1279 px; vira gaveta abaixo de 1024 px.
- **Conteúdo:** largura máxima de 1280 px, alinhado à esquerda (não centralizado: o olho volta sempre ao mesmo ponto). A agenda é a exceção e usa a largura toda.
- **Grid:** 12 colunas com gutter de 24 px no desktop, 8 colunas no tablet, 4 colunas com gutter de 16 px no celular.
- **Cabeçalho de página ("cabeçalho de ficha"):** título em serif, uma linha de metadados opcional e, abaixo, a **dupla linha**: 1 px `rule` + 2 px de espaço + 1 px `rule`. É a assinatura visual do sistema e aparece só aqui e nos totais.
- **Formulários:** uma coluna, no máximo 640 px. Campos curtos relacionados (duração e preço, cidade e UF) podem dividir a linha a partir de 640 px.
- **Painel lateral (sheet):** 560 px no desktop, tela cheia abaixo de 768 px.

### 4.3 Densidade

| Contexto | Altura da linha | Quando |
|---|---|---|
| Compacta | 32 px | Agenda (blocos de 15 min), caixa, relatórios |
| Padrão | 40 px | Tabelas, menus, listas |
| Toque | 44 px | Todo elemento clicável abaixo de 1024 px |

Abaixo de 1024 px, todo alvo de toque tem no mínimo 44 × 44 px, mesmo que o desenho visual seja menor (área clicável expandida com padding).

### 4.4 Responsividade

| Largura | Comportamento |
|---|---|
| ≥ 1280 px | Layout completo; tabelas com todas as colunas |
| 1024–1279 px | Menu recolhido em ícones; colunas secundárias podem sair (ex.: "Profissionais" na lista de serviços) |
| 768–1023 px | Menu em gaveta; agenda mostra um profissional por vez com troca por abas |
| < 768 px | Tabelas viram listas de duas linhas (principal em `body-strong`, detalhes em `meta`); botão primário fixo no rodapé; painéis em tela cheia |

---

## 5. Componentes

Todos partem do shadcn/ui já instalado (`src/shared/ui/components`). As regras abaixo ajustam variantes e estados; nenhuma tela cria um componente visual próprio sem passar por aqui.

### 5.1 Botões

| Variante | Visual | Uso |
|---|---|---|
| **Primário** | Fundo `ink-blue`, texto branco 600 | A ação principal da tela. **Um por tela** |
| **Secundário** | Fundo `paper-0`, borda 1 px `rule-strong`, texto `ink-1` | Ações de apoio ("Categorias", "Exportar") |
| **Discreto** (ghost) | Sem fundo nem borda, texto `ink-1`; hover `paper-2` | Ações em linhas de tabela, ícones, "Cancelar" |
| **Destrutivo** | Fundo `#A8231C`, texto branco | Só dentro de um diálogo de confirmação. Na tela, a ação destrutiva é secundária com texto de erro |
| **Link** | Texto `ink-blue`, sublinhado ao passar o mouse | Navegação dentro de frases |

| Tamanho | Altura | Padding horizontal | Texto |
|---|---|---|---|
| `sm` | 32 px | 12 px | 13 px |
| `md` (padrão) | 36 px | 16 px | 15 px |
| `lg` | 44 px | 20 px | 15 px |

Raio de 4 px. Ícone de 16 px à esquerda do texto, a 8 px.

**Estados:**
- *Hover:* primário `ink-blue-hover`; secundário fundo `paper-2`.
- *Pressionado:* desloca 1 px para baixo (`translateY(1px)`), sem mudar a cor de novo.
- *Foco:* anel de 2 px `ink-blue` com 2 px de afastamento em `paper-0` (ver seção 8).
- *Desabilitado:* opacidade 0,5, cursor padrão. Sempre com a razão explicada perto ("Selecione uma categoria para salvar").
- *Carregando:* o texto muda para o gerúndio ("Salvando..."), o botão fica desabilitado e mantém a largura. Sem spinner girando sozinho no lugar do texto.

### 5.2 Campos de formulário

- **Estrutura:** rótulo (`label`, `ink-1`) acima; campo; ajuda ou erro abaixo (`meta`). Espaço de 6 px entre rótulo e campo, 16 px entre campos.
- **Campo:** altura de 36 px (44 px abaixo de 1024 px), fundo `paper-0`, borda 1 px `rule-strong`, raio 4 px, texto `body`.
- **Opcional, não obrigatório:** campos opcionais levam "(opcional)" no rótulo. Não há asterisco: a maioria dos campos é obrigatória.
- **Placeholder:** só com exemplo de formato ("00000-000"), nunca no lugar do rótulo. Cor `ink-2`.
- **Hover:** borda `ink-2`. **Foco:** borda `ink-blue` + anel de foco. **Erro:** borda `#A8231C`, mensagem em texto de erro abaixo com ícone de alerta de 14 px, `aria-invalid` e `aria-describedby`.
- **Desabilitado / somente leitura:** fundo `paper-2`, texto `ink-2`. Somente leitura mantém a seleção de texto (o usuário pode copiar um CPF).
- **Máscaras:** CPF, CEP, telefone e dinheiro formatam enquanto se digita. O campo de dinheiro é preenchido da direita para a esquerda ("18000" → `R$ 180,00`) e alinhado à direita.
- **Interruptor (switch):** só para configurações que valem na hora ou dentro de um formulário com efeito claro ("Exige sala"). Sempre com rótulo à esquerda e descrição curta abaixo.
- **Checkbox:** 16 px, borda `rule-strong`, marcado em `ink-blue`.

### 5.3 Navegação

- **Menu lateral:** fundo `paper-1`, sem borda forte (separação por `rule` de 1 px à direita). Grupos com rótulo `column-label` em `ink-2` ("OPERAÇÃO", "CONFIGURAÇÕES").
- **Item:** 40 px de altura, ícone de 20 px + texto `body`. Hover `paper-2`.
- **Item ativo:** fundo `paper-0`, texto `ink-0` em 600 e **barra vertical de 3 px em `ink-blue`** à esquerda. É o mesmo gesto da faixa lateral dos blocos da agenda.
- **Seletor de unidade** no cabeçalho: sempre visível; mostra o nome da unidade, nunca só um ícone.
- **Abas:** texto `body` em `ink-2`; aba ativa em `ink-0` 600 com sublinhado de 2 px `ink-blue`. Sem fundo em "pílula".
- **Trilha (breadcrumb):** só em páginas de segundo nível ("Unidades / Unidade Centro"), com o primeiro nível como link.

### 5.4 Tabelas e listas

São o componente mais importante do sistema.

- **Sem bordas verticais.** Linhas horizontais de 1 px `rule` entre as linhas da tabela; a última linha não tem borda.
- **Cabeçalho:** fundo `paper-1`, texto `column-label` em `ink-2`, altura de 36 px.
- **Linha:** 40 px; hover `paper-2`; selecionada `ink-blue-soft` com barra de 3 px `ink-blue` à esquerda.
- **Alinhamento:** texto à esquerda; números, valores e quantidades à direita; datas e horários à esquerda em algarismos tabulares.
- **Primeira coluna** é o identificador (nome do paciente, do serviço), em `body-strong`, e é o link que abre o detalhe.
- **Ações por linha:** botões discretos de ícone, visíveis no hover e no foco do teclado (sempre visíveis em telas de toque).
- **Grupos** (ex.: serviços por categoria): título do grupo em `group-title` com a contagem em `meta` ("Procedimentos (4)"), acima da tabela.
- **Totais:** última linha com texto 600 e **dupla linha** acima (1 px + 2 px + 1 px), como no livro-caixa.
- **Linha inativa** (serviço desativado, paciente arquivado): texto `ink-2`, carimbo "INATIVO".

### 5.5 Carimbos de estado

Estados de agendamento, pagamento e cadastro usam o **carimbo**: retângulo com borda de 1 px, raio de 2 px, texto `column-label` (12 px, caixa alta), padding de 2 × 6 px, nas três cores da sua função semântica.

| Estado | Função | Texto |
|---|---|---|
| Agendado | Neutro (borda `rule-strong`, texto `ink-2`, fundo `paper-0`) | AGENDADO |
| Confirmado | Sucesso | CONFIRMADO |
| Em atendimento | Informação | EM ATENDIMENTO |
| Concluído | Neutro escuro (texto `ink-1`) | CONCLUÍDO |
| Faltou | Erro | FALTOU |
| Cancelado | Neutro, texto riscado | ~~CANCELADO~~ |
| Pago | Sucesso | PAGO |
| Parcial | Aviso | PARCIAL |
| Em aberto | Aviso | EM ABERTO |
| Ativo / Inativo | Sucesso / Neutro | ATIVO / INATIVO |

Carimbos não têm ícone, não são clicáveis e não são pílulas arredondadas.

### 5.6 Cards

Cards são **exceção**. Só existem em:
- **Indicadores do painel (F12):** fundo `paper-0`, borda 1 px `rule`, raio 8 px, sem sombra. Rótulo em `column-label`, número em `figure`, variação em `meta` ("+4% vs. mês anterior", com seta e cor só se a variação for significativa).
- **Blocos da agenda** (seção 10.1).
- **Unidades** na lista de unidades, porque cada uma tem endereço, salas e status agrupados.

Fora disso, a informação vai em lista ou tabela. Nunca colocar um card dentro de outro.

### 5.7 Diálogos e painéis

- **Painel lateral (sheet):** para criar e editar registros sem perder a lista de vista (serviço, paciente, agendamento). 560 px, entra pela direita, fundo `paper-0`, borda esquerda 1 px `rule` e a sombra de camada flutuante. Título em `section-title`; botão primário no rodapé fixo do painel.
- **Diálogo de confirmação (alert dialog):** para ações irreversíveis ou com consequência que o usuário precisa saber (mudança de preço, cancelar série recorrente, reabrir caixa). Até 440 px, raio 8 px. Título em forma de pergunta ou de ação ("Alterar preço"), texto explicando a consequência, botões "Cancelar" (secundário, à esquerda) e a ação nomeada (à direita: "Salvar novo preço", nunca só "OK" ou "Confirmar").
- **Diálogo comum:** para tarefas curtas e isoladas (gerenciar categorias, convidar usuário).
- **Fundo escurecido:** `rgb(26 25 22 / 0.4)`, sem desfoque.
- O foco vai para o primeiro campo ao abrir e volta para quem abriu ao fechar. `Esc` fecha, exceto com alterações não salvas (pergunta antes).

### 5.8 Feedback

| Tipo | Quando | Visual |
|---|---|---|
| **Aviso flutuante (toast)** | Confirmação de uma ação que deu certo ("Serviço salvo"), avisos sem decisão ("12 agendamentos futuros deste serviço foram mantidos.") | Canto inferior direito, fundo `paper-0`, borda `rule`, faixa de 3 px à esquerda na cor da função, some em 5 s (avisos: 8 s; erros: só ao fechar) |
| **Alerta na página** | Situação que continua valendo ("Esta unidade está desativada") | Fundo e borda da função, ícone de 16 px, largura do conteúdo |
| **Erro de campo** | Validação | Abaixo do campo, texto de erro + ícone. No envio, foco no primeiro campo com erro |
| **Carregamento** | Mais de 300 ms | Esqueleto com as formas reais do conteúdo em `paper-2`, sem brilho animado. Abaixo de 300 ms, nada |
| **Estado vazio** | Lista sem itens | Texto explicando o motivo + a ação que resolve (seção 7.4). Sem ilustração |

---

### 5.9 Grade semanal de horários

Usada no horário de funcionamento das unidades (F02) e nos horários de atendimento dos profissionais (F04).
- Uma linha por dia da semana, começando na segunda, com o nome do dia em `body-strong` à esquerda. Abaixo de 768 px cada dia vira um bloco com os intervalos empilhados.
- Cada intervalo é um par de seletores de horário em passos de 5 minutos ("08:00 até 12:00") com um botão de ícone fantasma "Remover". "Adicionar intervalo" é um botão fantasma com aparência de link, oculto quando o dia atinge o limite.
- Horários de referência (o funcionamento da unidade na grade do profissional) aparecem em `meta` abaixo do nome do dia: "Funcionamento: 08:00–18:00" ou "Unidade fechada".
- Um intervalo que quebra uma regra antes de salvar recebe a aparência de erro de campo (borda de perigo) e o motivo escrito abaixo, por exemplo "Fora do funcionamento da unidade (08:00–18:00)". A cor nunca carrega a regra sozinha.
- "Copiar para os dias úteis" é um botão fantasma por linha; o botão de salvar é a única ação primária da tela.

## 6. Detalhes visuais

### 6.1 Bordas e raios

| Elemento | Raio |
|---|---|
| Carimbos, checkboxes | 2 px |
| Botões, campos, selects, menus suspensos | 4 px |
| Cards, diálogos, avisos flutuantes | 8 px |
| Painel lateral, tabelas, menu lateral | 0 |
| Interruptor (switch) | Trilho e botão arredondados: única exceção, porque um interruptor quadrado não é reconhecido como interruptor |

Nada passa de 8 px. Círculos (`50%`) só em avatar e no marcador de cor do serviço.

Bordas: 1 px `rule` para separar; 1 px `rule-strong` para delimitar um controle; 3 px de cor só para marcar estado ou seleção (barra lateral).

### 6.2 Sombras

Uma única sombra, só para o que flutua acima da página (menus suspensos, diálogos, painel lateral, avisos):

```css
--elevation-floating: 0 1px 2px rgb(26 25 22 / 0.06), 0 8px 24px -8px rgb(26 25 22 / 0.18);
```

Cards, botões, campos e tabelas não têm sombra.

### 6.3 Ícones

- **Lucide**, traço de 1,75 px.
- 16 px em botões, tabelas e campos; 20 px no menu lateral; 24 px no máximo em estados vazios.
- Ícone **sempre acompanhado de texto**, exceto em botões de ícone dentro de linhas de tabela, que têm `aria-label` e dica (tooltip).
- Sem ícones decorativos em títulos de página, cards de indicador ou ao lado de cada item de lista.
- Cor: herda a cor do texto ao lado.

### 6.4 Movimento

| Token | Duração | Uso |
|---|---|---|
| `motion-fast` | 120 ms | Hover, foco, troca de aba |
| `motion-default` | 200 ms | Abrir menu suspenso, diálogo, aviso flutuante |
| `motion-panel` | 240 ms | Painel lateral |

Curva única: `cubic-bezier(0.2, 0, 0, 1)` (desaceleração). Sem bounce, sem animações em sequência de itens de lista, sem transições de página.

A linha do "agora" na agenda se move a cada minuto sem animação (salta para a nova posição).

---

## 7. Conteúdo

### 7.1 Tom de voz

**Como uma colega de recepção experiente:** direta, educada, nunca apressada nem robótica.

| Regra | Sim | Não |
|---|---|---|
| Frases curtas, voz ativa | "Paciente cadastrado." | "O cadastro do paciente foi efetuado com sucesso!" |
| Sem exclamações | "Pagamento registrado." | "Pagamento registrado com sucesso!!" |
| Diga o que aconteceu e o que fazer | "Este horário já está ocupado. Escolha outro horário ou outra sala." | "Erro 409: conflito." |
| Use os termos da clínica | "Faltou", "Atendimento", "Caixa" | "No-show", "Encounter", "Ledger" |
| Números com algarismos | "3 pacientes", "12 agendamentos" | "três pacientes" |
| Formatos brasileiros | "05/10/2026", "14:30", "R$ 1.234,56" | "Oct 5", "2:30 PM", "R$1234.56" |
| Durações curtas | "30 min", "1h 30min" | "1,5 hora" |
| Nunca culpe o usuário | "Não encontramos este CEP." | "Você digitou um CEP inválido." |

### 7.2 Ações (botões e links)

- **Verbo no infinitivo + objeto quando houver ambiguidade:** "Salvar", "Agendar consulta", "Registrar pagamento", "Fechar caixa".
- **O botão diz o que vai acontecer:** "Salvar novo preço", "Cancelar 8 sessões", não "Confirmar".
- **Cancelar ação ≠ cancelar agendamento.** Em diálogos sobre agendamentos, o botão de sair é "Voltar", para não confundir com "Cancelar agendamento".

### 7.3 Erros

Estrutura: **o que aconteceu** + **o que fazer**, quando houver o que fazer.

- "Já existe um serviço com este nome."
- "A duração deve ser entre 5 e 480 minutos, em múltiplos de 5."
- "Estes dados foram alterados por outra pessoa. Recarregue a página e tente novamente."
- "Sua sessão expirou. Entre novamente para continuar." (o formulário é restaurado depois)
- "Não foi possível consultar o CEP agora. Preencha o endereço manualmente."

As mensagens exatas do PRD prevalecem sobre qualquer reescrita.

### 7.4 Estados vazios

Estrutura: **o que não há** + **por que** (se não for óbvio) + **a ação**.

- Lista de serviços sem filtro: "Nenhum serviço cadastrado ainda. Os serviços definem duração e preço dos agendamentos." + botão "Novo serviço".
- Lista com filtro: "Nenhum serviço encontrado para "derma"." + link "Limpar busca".
- Agenda do dia sem agendamentos: "Nenhum agendamento para hoje nesta unidade." + "Agendar consulta".
- Para quem não pode criar: só a primeira frase, sem botão.

---

## 8. Acessibilidade

Alvo: **WCAG 2.2 nível AA** em todas as telas.

- **Contraste:** todas as combinações da seção 2.5 passam. Qualquer nova combinação precisa ser medida antes de entrar.
- **Foco visível:** anel de 2 px `ink-blue` com afastamento de 2 px na cor do fundo (`outline: 2px solid var(--ring); outline-offset: 2px`), só com `:focus-visible`. Nunca remover o contorno sem substituto.
- **Teclado:** toda ação possível com o mouse é possível com o teclado.
  - `Tab` segue a ordem visual; o primeiro item da página é o link "Pular para o conteúdo".
  - Grupos de opções (paleta de cores, abas, menus) usam as setas, com um único ponto de `Tab`.
  - Agenda: setas movem entre horários e dias; `Enter` abre o agendamento; `N` cria um novo no horário focado.
  - Busca global: `/` foca o campo de busca de pacientes.
- **Leitores de tela:** rótulos reais em todos os campos; erros ligados com `aria-describedby`; avisos flutuantes em região `aria-live="polite"` (erros em `assertive`); carimbos lidos como texto; cor de serviço com o nome da cor no `aria-label`.
- **Cor nunca sozinha:** estados com texto; erros com ícone e texto; a linha do agora com o rótulo "agora".
- **Movimento reduzido:** com `prefers-reduced-motion: reduce`, todas as durações caem para 0 ms; o painel lateral aparece sem deslizar.
- **Zoom:** a interface funciona a 200% de zoom sem rolagem horizontal (exceto a grade da agenda).
- **Alvos de toque:** 44 × 44 px abaixo de 1024 px; no mínimo 24 × 24 px no desktop (WCAG 2.5.8).
- **Idioma:** `<html lang="pt-BR">`, já configurado.

---

## 9. Design tokens

### 9.1 Variáveis CSS

Os nomes seguem os do shadcn/ui, para substituir os valores atuais de [src/app/globals.css](../src/app/globals.css) sem mudar os componentes. Os tokens próprios do GCli vêm depois.

```css
:root {
  /* shadcn/ui */
  --background: #f4f2ec;            /* paper-1: app background */
  --foreground: #2b2925;            /* ink-1 */
  --card: #fbfaf7;                  /* paper-0 */
  --card-foreground: #2b2925;
  --popover: #fbfaf7;
  --popover-foreground: #2b2925;
  --primary: #22406e;               /* ink-blue */
  --primary-foreground: #ffffff;
  --secondary: #fbfaf7;
  --secondary-foreground: #2b2925;
  --muted: #ece9e1;                 /* paper-2 */
  --muted-foreground: #5f5b53;      /* ink-2 */
  --accent: #ece9e1;
  --accent-foreground: #1a1916;
  --destructive: #a8231c;
  --border: #dcd8ce;                /* rule */
  --input: #8f897c;                 /* rule-strong */
  --ring: #22406e;
  --radius: 0.25rem;                /* 4 px: buttons and fields */
  --sidebar: #f4f2ec;
  --sidebar-foreground: #2b2925;
  --sidebar-primary: #22406e;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #fbfaf7;
  --sidebar-accent-foreground: #1a1916;
  --sidebar-border: #dcd8ce;
  --sidebar-ring: #22406e;
  --chart-1: #22406e;
  --chart-2: #4f7cae;
  --chart-3: #b4532a;
  --chart-4: #1e6b3f;
  --chart-5: #8f897c;

  /* GCli: paper and ink */
  --paper-0: #fbfaf7;
  --paper-1: #f4f2ec;
  --paper-2: #ece9e1;
  --rule: #dcd8ce;
  --rule-strong: #8f897c;
  --ink-0: #1a1916;
  --ink-1: #2b2925;
  --ink-2: #5f5b53;
  --ink-3: #8a857a;

  /* GCli: brand */
  --ink-blue: #22406e;
  --ink-blue-hover: #1a3358;
  --ink-blue-soft: #e6ecf5;
  --ink-blue-border: #a9bbd8;
  --terracotta: #b4532a;
  --terracotta-text: #9c4423;

  /* GCli: semantic (text / background / border) */
  --success: #1e6b3f;
  --success-bg: #e5f2ea;
  --success-border: #9ccbae;
  --warning: #7a4e00;
  --warning-bg: #fbf0d5;
  --warning-border: #e2c47a;
  --danger: #a8231c;
  --danger-bg: #fbe7e4;
  --danger-border: #e8a9a2;
  --info: #22406e;
  --info-bg: #e6ecf5;
  --info-border: #a9bbd8;

  /* GCli: typography */
  --typeface-heading: "Source Serif 4 Variable", Georgia, serif;
  --typeface-body: "Source Sans 3 Variable", system-ui, sans-serif;
  --typeface-code: var(--font-geist-mono), ui-monospace, monospace;
  --text-base-size: 0.9375rem;      /* 15 px */

  /* GCli: radius, elevation, motion, layout */
  --radius-stamp: 2px;
  --radius-control: 4px;
  --radius-layer: 8px;
  --elevation-floating: 0 1px 2px rgb(26 25 22 / 0.06), 0 8px 24px -8px rgb(26 25 22 / 0.18);
  --motion-fast: 120ms;
  --motion-default: 200ms;
  --motion-panel: 240ms;
  --motion-curve: cubic-bezier(0.2, 0, 0, 1);
  --sidebar-width: 248px;
  --content-max-width: 1280px;
  --sheet-width: 560px;
}

.dark {
  --background: #161513;
  --foreground: #ece8df;
  --card: #1c1a17;
  --card-foreground: #ece8df;
  --popover: #1c1a17;
  --popover-foreground: #ece8df;
  --primary: #9db7e3;
  --primary-foreground: #161513;
  --secondary: #1c1a17;
  --secondary-foreground: #ece8df;
  --muted: #2a2824;
  --muted-foreground: #a8a296;
  --accent: #2a2824;
  --accent-foreground: #f5f2ea;
  --destructive: #f2a097;
  --border: #34312c;
  --input: #6e685d;
  --ring: #9db7e3;
  --sidebar: #161513;
  --sidebar-foreground: #ece8df;
  --sidebar-primary: #9db7e3;
  --sidebar-primary-foreground: #161513;
  --sidebar-accent: #1c1a17;
  --sidebar-accent-foreground: #f5f2ea;
  --sidebar-border: #34312c;
  --sidebar-ring: #9db7e3;

  --paper-0: #1c1a17;
  --paper-1: #161513;
  --paper-2: #2a2824;
  --rule: #34312c;
  --rule-strong: #6e685d;
  --ink-0: #f5f2ea;
  --ink-1: #ece8df;
  --ink-2: #a8a296;
  --ink-blue: #9db7e3;
  --ink-blue-hover: #b6c9ea;
  --ink-blue-soft: #1d2a3f;
  --terracotta: #e08a63;
  --terracotta-text: #e08a63;
  --success: #8fd1a8;
  --success-bg: #132a1c;
  --warning: #e9c46a;
  --warning-bg: #2b2210;
  --danger: #f2a097;
  --danger-bg: #33150f;
  --info: #9db7e3;
  --info-bg: #1d2a3f;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-fast: 0ms;
    --motion-default: 0ms;
    --motion-panel: 0ms;
  }
}
```

### 9.2 Ligação com o Tailwind

No bloco `@theme inline` do `globals.css`, os tokens próprios viram utilitários (`bg-paper-1`, `text-ink-2`, `border-rule`, `text-success`...):

```css
@theme inline {
  --font-sans: var(--typeface-body);
  --font-heading: var(--typeface-heading);
  --font-mono: var(--typeface-code);
  --color-paper-0: var(--paper-0);
  --color-paper-1: var(--paper-1);
  --color-paper-2: var(--paper-2);
  --color-rule: var(--rule);
  --color-rule-strong: var(--rule-strong);
  --color-ink-0: var(--ink-0);
  --color-ink-1: var(--ink-1);
  --color-ink-2: var(--ink-2);
  --color-ink-blue: var(--ink-blue);
  --color-ink-blue-soft: var(--ink-blue-soft);
  --color-terracotta: var(--terracotta);
  --color-success: var(--success);
  --color-success-bg: var(--success-bg);
  --color-warning: var(--warning);
  --color-warning-bg: var(--warning-bg);
  --color-danger: var(--danger);
  --color-danger-bg: var(--danger-bg);
  /* shadcn/ui uses rounded-lg on controls and rounded-xl on layers */
  --radius-sm: var(--radius-stamp);
  --radius-md: var(--radius-control);
  --radius-lg: var(--radius-control);
  --radius-xl: var(--radius-layer);
  --radius-2xl: var(--radius-layer);
  --radius-4xl: var(--radius-layer);
  /* one shadow: the small ones disappear, the large ones become the floating shadow */
  --shadow-sm: 0 0 #0000;
  --shadow-md: var(--elevation-floating);
  --shadow-lg: var(--elevation-floating);
  --shadow-floating: var(--elevation-floating);
  /* weights 400 and 600 only: the 500 used by shadcn/ui renders as 600 */
  --font-weight-medium: 600;
  --ease-standard: var(--motion-curve);
}

body {
  font-size: var(--text-base-size);
  line-height: 1.4667; /* 22 px */
  font-variant-numeric: tabular-nums;
}

@media (max-width: 767px) {
  body { font-size: 1rem; line-height: 1.5; }
}
```

A dupla linha do cabeçalho e dos totais:

```css
/* 4 px "double" = 1 px rule + 2 px gap + 1 px rule */
.double-rule {
  border-bottom: 4px double var(--rule);
}
```

### 9.3 Como adotar

1. Instalar as fontes: `npm i @fontsource-variable/source-serif-4 @fontsource-variable/source-sans-3` e importá-las no layout raiz.
2. Trocar os valores de `:root` e `.dark` em `globals.css` pelos da seção 9.1 e ampliar o `@theme inline` com a seção 9.2.
3. Ajustar as variantes dos componentes do shadcn/ui (botão, campo, tabela, badge → carimbo, abas, sheet) conforme a seção 5.
4. Revisar as telas existentes (F01 a F03) e rodar os testes E2E.
5. A decisão está registrada no ADR-020 da [arquitetura](architecture.pt-BR.md).

---

## 10. Exemplos de aplicação

### 10.1 Tela principal: Agenda do dia (recepção)

A tela mais usada do sistema, aberta o dia todo no computador da recepção.

```
Agenda                                                  [Agendar consulta]
Unidade Centro · terça-feira, 06/10/2026 · 34 agendamentos
══════════════════════════════════════════════════════════════════════════
‹ Hoje ›  [Dia | Semana]   Profissionais: Todos ▾   Salas: Todas ▾

        │ Dra. Ana Lima         │ Dr. Bruno Reis        │ Carla Souza (fisio)
────────┼───────────────────────┼───────────────────────┼────────────────────
 08:00  │▌Maria Oliveira        │                       │▌João Pereira
        │▌Consulta · Sala 1     │                       │▌Sessão 4/10 · Sala 3
        │▌CONFIRMADO            │                       │▌EM ATENDIMENTO
 08:30  │                       │▌Pedro Alves           │
- - - - │- - - - - - - - - - - -│▌Retorno · Sala 2      │- - - - - - - - - -
 09:00  │                       │▌FALTOU                │
━━━━━━━━┿━━━━ agora 09:12 ━━━━━━┿━━━━━━━━━━━━━━━━━━━━━━━┿━━━━━━━━━━━━━━━━━━━━  ← terracota
 09:30  │▌Luiza Martins         │                       │
```

Como as regras se combinam:
- **Cabeçalho de ficha:** título "Agenda" em serif, metadados com unidade, data por extenso e total, dupla linha. A única ação primária é "Agendar consulta".
- **Régua do tempo:** horários na coluna da esquerda em algarismos tabulares, `ink-2`. Linha de 1 px `rule` em cada hora cheia e tracejada a cada 30 min. Fundo `paper-0`; horários fora do expediente da unidade em `paper-1`; fechamentos com hachura diagonal em `paper-2` e o motivo escrito.
- **Linha do agora:** 2 px `terracotta` atravessando todas as colunas, com o rótulo "agora 09:12" em `terracotta-text` 13 px. É o único elemento terracota da tela.
- **Blocos de agendamento** (os únicos cards da tela): fundo `paper-0`, borda 1 px `rule`, raio 4 px, **faixa de 4 px na cor do serviço** à esquerda. Linha 1: nome do paciente em `body-strong`. Linha 2: serviço e sala em `meta`. Linha 3: carimbo de estado. Blocos de 15 min mostram só o nome e o carimbo; o resto aparece na dica e no painel.
- **Atraso:** paciente agendado há mais de 10 min sem entrada ganha o texto "atrasado 12 min" em `terracotta-text`, ao lado do carimbo.
- **Teclado:** setas percorrem os horários, `Enter` abre o agendamento no painel lateral, `N` agenda no horário focado.
- **Celular:** um profissional por vez, trocado por abas no topo; blocos ocupam a largura toda; "Agendar consulta" fixo no rodapé.

### 10.2 Fluxo: agendar uma consulta em menos de 60 segundos

Meta do PRD: um paciente existente é agendado em até 60 s, com o paciente ao telefone.

1. **Iniciar.** A recepcionista clica no horário livre (ou foca e aperta `N`). O painel lateral abre em 240 ms, já com profissional, data, hora e unidade preenchidos a partir do horário escolhido. O foco vai direto para "Paciente".
2. **Paciente.** Busca enquanto digita (nome, CPF ou telefone), resultados em até 1 s. Cada resultado mostra nome em `body-strong` e, em `meta`, data de nascimento e os 4 últimos dígitos do telefone, para diferenciar homônimos sem expor dados. Setas + `Enter` escolhem.
3. **Serviço.** Lista só com serviços ativos que o profissional atende, agrupados por categoria, cada um com o marcador de cor, a duração e o preço. Escolher o serviço ajusta o fim do horário.
4. **Sala.** Se o serviço exige sala, o campo aparece já com as salas permitidas e livres da unidade. Se só uma serve, já vem selecionada.
5. **Conflito.** Se o horário colidiu enquanto isso (outra recepcionista agendou), a mensagem aparece no topo do painel, em alerta de erro: "Este horário já está ocupado. Escolha outro horário ou outra sala.", com os próximos três horários livres como botões discretos. Nada do que foi preenchido se perde.
6. **Salvar.** Botão primário "Agendar" no rodapé do painel. Enquanto salva: "Agendando...". Ao concluir, o painel fecha, o bloco aparece na agenda com o carimbo AGENDADO e o aviso flutuante diz "Consulta agendada para 06/10 às 14:30.". O foco volta para o horário na agenda.

Nenhuma tela nova é aberta no fluxo inteiro, e todos os passos podem ser feitos sem mouse.

---

## 11. Faça e evite

| Faça | Evite |
|---|---|
| Use tabelas com linhas finas para listar registros | Grades de cards para o que é lista |
| Um botão primário por tela, nomeado pela ação | Dois ou três botões azuis competindo |
| Escreva o estado em texto (carimbo) e use cor como reforço | Bolinhas coloridas sem legenda |
| Títulos de página e de seção em serif; o resto em sans | Serif em botões, tabelas ou campos |
| Algarismos tabulares e valores alinhados à direita | Valores centralizados ou sem `R$` |
| A dupla linha só no cabeçalho de página e nos totais | Dupla linha como enfeite em qualquer separador |
| Terracota só para "agora" e "atrasado" | Terracota em botões, ícones ou títulos |
| Raios de 2, 4 ou 8 px | Cantos de 12, 16 px ou mais; pílulas em botões |
| Uma sombra, só no que flutua | Sombras em cards, botões e campos |
| Ícone junto do texto, com função | Ícone decorativo em título ou em cada item de lista |
| Fundos `paper-*` e tinta escura | Gradientes, vidro fosco, branco puro chapado |
| Mensagens do PRD como estão | Reescrever mensagens já aprovadas |
| Medir o contraste de toda combinação nova | Supor que "parece legível" |
| Testar a tela com teclado e a 200% de zoom | Validar só com mouse num monitor grande |

**Antes de entregar uma tela nova, confira:**
1. Há no máximo um botão primário?
2. Todo estado tem texto?
3. Os números estão em algarismos tabulares e alinhados?
4. O foco aparece e segue a ordem visual?
5. A tela funciona em 375 px de largura?
6. Algum card, sombra, gradiente ou ícone poderia sair sem perder informação? Se sim, tire.
