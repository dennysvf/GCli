# GCli design system — "Ink and Paper" ("Tinta e Papel")

This document defines GCli's visual identity and interface rules. It is the reference for every new screen: anyone who follows these rules should reach the same result as anyone else on the team.

Context sources: the [PRD](prd.en.md) (sections 1 to 4) and the stack described in the [architecture](architecture.en.md) (ADR-011 and ADR-020).

Versão em português: [design-system.pt-BR.md](design-system.pt-BR.md).

User-facing text in this document (buttons, messages, status labels) stays in pt-BR, exactly as it appears in the product.

---

## 0. Context and assumptions

| Field | Definition |
|---|---|
| Product | GCli — a web platform for clinic management: patients, a multi-professional agenda across units and rooms, clinical care, documents, packages, billing, cash register and indicators |
| Audience | Owner/Administrator, Manager, Front Desk and Healthcare Professional. Moderate digital literacy, working under time pressure, often with a patient in front of them |
| Platform | Responsive web. Desktops at the front desk; laptops, tablets and phones in treatment rooms and on the move |
| Stack | Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui (Radix), Lucide icons |
| Language and conventions | pt-BR, DD/MM/AAAA, `R$ 1.234,56`, CPF, PIX |

**Assumptions** (the briefing defines no brand or visual references):
1. **Personality:** trustworthy, precise, calm and warm without being casual. A clinic deals with health and money; the interface can neither look improvised nor feel as cold as a hospital.
2. **No logo defined.** The clinic's logo (uploaded in F01) appears at the top of the sidebar; GCli itself appears only as its name, in text.
3. **Light mode is primary.** Front desks are brightly lit and screens stay on all day. Dark mode is supported, but designed as a derivative.
4. **Fonts served by the application** (npm packages), with no requests to Google: this keeps the decision made in F01 for privacy (LGPD) and for networks that intercept HTTPS.

---

## 1. Visual direction

### 1.1 Concept: "Ink and Paper"

Before software, clinics ran on three objects: the **patient record card**, the **appointment book** and the **cash ledger**. All three have qualities the interface should inherit:

- **Slightly warm paper**, not screen white: it tires the eyes less over an 8-hour shift.
- **Dark blue ink** for actions and official information, like the fountain pen that signs a document.
- **Fine rules** that organize without taking space: the lines of the appointment book, the columns of the ledger.
- **Red pencil** only for what needs attention now: "now" on the agenda, what is late.
- **Stamps** for states: CONFIRMADO, FALTOU, PAGO. Rectangular, bordered, readable from a distance.
- **Double underline** under totals, as in accounting.

The result is an interface that looks like a **well-typeset document**, not a generic app dashboard.

### 1.2 Principles

| Principle | What it means in practice |
|---|---|
| **1. Information is the interface** | Lists and tables with fine rules instead of cards. A card exists only when it groups something that moves together (a dashboard indicator, an agenda block). |
| **2. Time is the structure** | The agenda, price history, patient timeline and cash register read top to bottom, in time order. Times and dates always sit in the same left column, in tabular figures. |
| **3. One main action per screen** | Each screen has at most one primary button (solid ink blue). Everything else is secondary, ghost or a link. |
| **4. State is always written** | Color never appears alone: every state has a text ("Faltou", "Pago") and, when there is room, an icon. Color-blind users and poor front-desk monitors must understand it too. |
| **5. Calm by default, alert by exception** | 90% of the screen is paper and ink. Alert colors are rare so they keep their weight: if everything is red, nothing is urgent. |
| **6. Perceived speed** | Nothing moves without a reason. Short transitions (120–200 ms), no entrance animations on lists, keyboard focus always in the right place after each action. |

---

## 2. Color

Token names are in English, like every code identifier in the project: `paper`, `ink`, `rule` (fine line), `ink-blue` and `terracotta`.

### 2.1 Neutrals: paper and ink

| Token | Hex | Use |
|---|---|---|
| `paper-0` | `#FBFAF7` | Main surface: content area, tables, forms, panels |
| `paper-1` | `#F4F2EC` | Application and sidebar background; table header |
| `paper-2` | `#ECE9E1` | Row hover, active menu item, disabled field background |
| `rule` | `#DCD8CE` | Fine rules: dividers, table and panel borders |
| `rule-strong` | `#8F897C` | Form field and checkbox borders (needs 3:1) |
| `ink-0` | `#1A1916` | Headings |
| `ink-1` | `#2B2925` | Body text |
| `ink-2` | `#5F5B53` | Secondary text: column labels, metadata, help, placeholders |
| `ink-3` | `#8A857A` | Disabled text only (exempt from WCAG contrast) |

### 2.2 Brand colors

| Token | Hex | Use |
|---|---|---|
| `ink-blue` | `#22406E` | Primary color: primary button, links, active menu item, focus, selection |
| `ink-blue-hover` | `#1A3358` | Primary button hover and pressed |
| `ink-blue-soft` | `#E6ECF5` | Selection background (selected row, selected day), informational highlight |
| `ink-blue-border` | `#A9BBD8` | Informational alert border |
| `terracotta` | `#B4532A` | "Red pencil": the now line on the agenda, the late marker. Lines and markers only |
| `terracotta-text` | `#9C4423` | Terracotta text ("agora" label, "atrasado 12 min") |

Ink blue was chosen over the light blue or teal common in healthcare software: it is darker and more serious, it pairs with warm paper, and it leaves green free to mean "success".

### 2.3 Semantic colors

Each semantic color has three tones: **text**, **background** and **border**. They appear in alerts, status stamps and messages, never as the background of large areas.

| Function | Text | Background | Border | Examples |
|---|---|---|---|---|
| Success | `#1E6B3F` | `#E5F2EA` | `#9CCBAE` | Confirmed, Paid, Cash register reconciled |
| Warning | `#7A4E00` | `#FBF0D5` | `#E2C47A` | Partial payment, discount awaiting approval |
| Danger | `#A8231C` | `#FBE7E4` | `#E8A9A2` | No-show, validation error, cash difference, destructive action |
| Info | `#22406E` | `#E6ECF5` | `#A9BBD8` | Neutral notices, tips, "12 agendamentos futuros foram mantidos" |

Destructive button: background `#A8231C`, white text.

### 2.4 Service colors on the agenda

The 16-color service palette (F03) stays as it is: stable keys (`blue`, `emerald`...) mapped to Tailwind tones. For those colors to live with the identity:
- On the agenda, an appointment is a **paper** block (`paper-0`) with a **4 px left stripe** in the service color and ink text. The color identifies; it does not carry text.
- In lists, the color appears as a 12 px dot before the service name.
- Never use a service color as a solid background with text on top.

**Professional colors (F04).** Each professional has an agenda color from the same 16 keys. It appears only as a 12 px dot before the professional's name (lists, agenda column headers, selects), never as an avatar or column background. The avatar itself is a circle with the initials in `ink-1` on `paper-2`.

### 2.5 Allowed combinations and contrast

Computed contrast ratios (WCAG 2.2). Minimums: 4.5:1 for text, 3:1 for large text (≥ 18.66 px bold or ≥ 24 px) and for component borders.

| Combination | Contrast | Allowed for |
|---|---|---|
| `ink-0` on `paper-0` | 16.84:1 | Headings |
| `ink-1` on `paper-0` | 13.91:1 | All text |
| `ink-1` on `paper-1` | 12.97:1 | All text |
| `ink-2` on `paper-0` | 6.47:1 | Secondary text |
| `ink-2` on `paper-2` | 5.57:1 | Secondary text on a hovered row |
| `ink-3` on `paper-0` | 3.52:1 | Disabled text **only** |
| `rule-strong` on `paper-0` | 3.33:1 | Field and checkbox borders |
| `ink-blue` on `paper-0` | 9.93:1 | Links, emphasized text |
| White on `ink-blue` | 10.36:1 | Primary button |
| `ink-blue` on `ink-blue-soft` | 8.72:1 | Selection, informational alert |
| `terracotta` on `paper-0` | 4.78:1 | Now line, markers |
| `terracotta-text` on `paper-0` | 6.16:1 | "agora" and "atrasado" labels |
| Success text on success background | 5.64:1 | Stamps and alerts |
| Warning text on warning background | 6.35:1 | Stamps and alerts |
| Danger text on danger background | 6.04:1 | Stamps and alerts |
| White on danger (`#A8231C`) | 7.19:1 | Destructive button |

**Forbidden combinations:** `rule` as a text color (1.36:1); colored text on a colored background of another family (green on soft blue, for example); terracotta as a button background.

### 2.6 Dark mode

Same logic, inverted: a warm "night paper", not pure black.

| Token | Light | Dark |
|---|---|---|
| `paper-0` | `#FBFAF7` | `#1C1A17` |
| `paper-1` | `#F4F2EC` | `#161513` |
| `paper-2` | `#ECE9E1` | `#2A2824` |
| `rule` | `#DCD8CE` | `#34312C` |
| `rule-strong` | `#8F897C` | `#6E685D` |
| `ink-0` | `#1A1916` | `#F5F2EA` |
| `ink-1` | `#2B2925` | `#ECE8DF` |
| `ink-2` | `#5F5B53` | `#A8A296` |
| `ink-blue` | `#22406E` | `#9DB7E3` (text on it: `#161513`) |
| `terracotta` | `#B4532A` | `#E08A63` |
| Success text / background | `#1E6B3F` / `#E5F2EA` | `#8FD1A8` / `#132A1C` |
| Warning text / background | `#7A4E00` / `#FBF0D5` | `#E9C46A` / `#2B2210` |
| Danger text / background | `#A8231C` / `#FBE7E4` | `#F2A097` / `#33150F` |

Dark-mode contrast: body text 14.92:1; secondary text 7.19:1; ink blue 8.96:1; terracotta 6.94:1; stamps between 8.17:1 and 9.39:1; field borders 3.30:1.

---

## 3. Typography

### 3.1 Families

| Role | Typeface | Package | Why |
|---|---|---|---|
| Headings | **Source Serif 4** (variable, with optical size) | `@fontsource-variable/source-serif-4` | Gives the editorial, document-like tone. Designed for screens, legible at medium sizes, full Portuguese accent coverage |
| Interface and text | **Source Sans 3** (variable) | `@fontsource-variable/source-sans-3` | Sober, highly legible at small sizes, tabular figures (`tnum`), designed alongside the serif |
| Codes and IDs | **Geist Mono** (already installed) | `geist` | Protocol numbers, audit IDs, PIX keys |

The serif is **for headings only** (page and section titles, and the patient's name on their record). Everything read quickly, such as buttons, fields, tables and menus, uses the sans.

### 3.2 Scale

15 px base on desktop (a dense interface for the front desk) and 16 px below 768 px (avoids iOS auto-zoom on fields).

| Style | Typeface | Size / line height | Weight | Use |
|---|---|---|---|---|
| `page-title` | Serif | 28 / 34 px | 600 | Each page title ("Serviços", "Agenda") |
| `section-title` | Serif | 20 / 28 px | 600 | Sections within a page, side panel and dialog titles |
| `group-title` | Sans | 15 / 22 px | 600 | List group (service category), form block title |
| `body` | Sans | 15 / 22 px | 400 | Default text, table cells, field values |
| `body-strong` | Sans | 15 / 22 px | 600 | Patient name in lists, the main value of a row |
| `label` | Sans | 13 / 18 px | 600 | Field label, grouped menu item label |
| `meta` | Sans | 13 / 18 px | 400 | Help, metadata ("Alterado por Ana em 05/10/2026"), captions |
| `column-label` | Sans | 12 / 16 px | 600, uppercase, 0.04 em tracking | Table column headers and status stamps |
| `figure` | Sans | 32 / 36 px | 600, tabular | Dashboard indicators and the cash register total |

### 3.3 Rules

- **Tabular figures** (`font-variant-numeric: tabular-nums`) in tables, amounts, times, dates and any column of numbers, so digits align.
- **Money** right-aligned, always with `R$` and two decimals.
- **Uppercase** only in column headers and stamps. Never in buttons, headings or sentences.
- **Line length:** at most 72 characters in running text (help, terms, clinical notes).
- **Italic** only for a patient quote or a remark, never for interface emphasis.
- **Weight 700 does not exist** in the system: 400 and 600 are enough. Hierarchy comes from size, typeface and space.

---

## 4. Layout

### 4.1 Spacing

4 px base. Only these values are used:

| Token | Value | Typical use |
|---|---|---|
| `space-1` | 4 px | Between an icon and small text |
| `space-2` | 8 px | Between an icon and text, between adjacent buttons |
| `space-3` | 12 px | Vertical padding of a compact table row, between label and field (6 px + 6 px) |
| `space-4` | 16 px | Cell padding, between form fields, side margin on phones |
| `space-6` | 24 px | Between blocks within a section, grid gutter |
| `space-8` | 32 px | Between page sections, side margin on desktop |
| `space-12` | 48 px | Before a page title, empty states |

### 4.2 Application structure

```
┌───────────┬──────────────────────────────────────────────────────┐
│ Sidebar   │ Header (56 px): unit selector · user                 │
│ 248 px    ├──────────────────────────────────────────────────────┤
│ paper-1   │ Page title (serif)                   [Primary action]│
│           │ page metadata                                        │
│           │ ════════════════════════════════════════════════════ │ ← double rule
│           │ Filters                                              │
│           │ Content (paper-0), max 1280 px                       │
└───────────┴──────────────────────────────────────────────────────┘
```

- **Sidebar:** 248 px on desktop; collapses to 56 px (icons with tooltips) between 1024 and 1279 px; becomes a drawer below 1024 px.
- **Content:** max width 1280 px, left-aligned (not centered: the eye always returns to the same point). The agenda is the exception and uses the full width.
- **Grid:** 12 columns with a 24 px gutter on desktop, 8 columns on tablets, 4 columns with a 16 px gutter on phones.
- **Page header ("record header"):** serif title, an optional metadata line and, below it, the **double rule**: 1 px `rule` + 2 px gap + 1 px `rule`. It is the system's visual signature and appears only here and above totals.
- **Forms:** one column, at most 640 px. Short related fields (duration and price, city and state) may share a row from 640 px up.
- **Side panel (sheet):** 560 px on desktop, full screen below 768 px.

### 4.3 Density

| Context | Row height | When |
|---|---|---|
| Compact | 32 px | Agenda (15-minute slots), cash register, reports |
| Default | 40 px | Tables, menus, lists |
| Touch | 44 px | Every clickable element below 1024 px |

Below 1024 px, every touch target is at least 44 × 44 px, even if the visual element is smaller (hit area expanded with padding).

### 4.4 Responsive behavior

| Width | Behavior |
|---|---|
| ≥ 1280 px | Full layout; tables show every column |
| 1024–1279 px | Sidebar collapsed to icons; secondary columns may hide (e.g. "Profissionais" in the services list) |
| 768–1023 px | Sidebar as a drawer; the agenda shows one professional at a time with tabs to switch |
| < 768 px | Tables become two-line lists (main value in `body-strong`, details in `meta`); primary button fixed at the bottom; panels full screen |

---

## 5. Components

All of them start from the shadcn/ui components already installed (`src/shared/ui/components`). The rules below adjust variants and states; no screen creates its own visual component without going through this section.

### 5.1 Buttons

| Variant | Look | Use |
|---|---|---|
| **Primary** | `ink-blue` background, white 600 text | The screen's main action. **One per screen** |
| **Secondary** | `paper-0` background, 1 px `rule-strong` border, `ink-1` text | Supporting actions ("Categorias", "Exportar") |
| **Ghost** | No background or border, `ink-1` text; `paper-2` on hover | Table row actions, icons, "Cancelar" |
| **Destructive** | `#A8231C` background, white text | Only inside a confirmation dialog. On the screen, the destructive action is a secondary button with danger text |
| **Link** | `ink-blue` text, underlined on hover | Navigation within sentences |

| Size | Height | Horizontal padding | Text |
|---|---|---|---|
| `sm` | 32 px | 12 px | 13 px |
| `md` (default) | 36 px | 16 px | 15 px |
| `lg` | 44 px | 20 px | 15 px |

4 px radius. 16 px icon to the left of the text, 8 px apart.

**States:**
- *Hover:* primary `ink-blue-hover`; secondary background `paper-2`.
- *Pressed:* moves 1 px down (`translateY(1px)`), with no further color change.
- *Focus:* 2 px `ink-blue` ring with a 2 px offset in `paper-0` (see section 8).
- *Disabled:* 0.5 opacity, default cursor. Always with the reason explained nearby ("Selecione uma categoria para salvar").
- *Loading:* the label changes to the gerund ("Salvando..."), the button is disabled and keeps its width. No spinner replacing the label.

### 5.2 Form fields

- **Structure:** label (`label`, `ink-1`) above; field; help or error below (`meta`). 6 px between label and field, 16 px between fields.
- **Field:** 36 px high (44 px below 1024 px), `paper-0` background, 1 px `rule-strong` border, 4 px radius, `body` text.
- **Optional, not required:** optional fields carry "(opcional)" in the label. There is no asterisk: most fields are required.
- **Placeholder:** only a format example ("00000-000"), never instead of the label. Color `ink-2`.
- **Hover:** `ink-2` border. **Focus:** `ink-blue` border + focus ring. **Error:** `#A8231C` border, message in danger text below with a 14 px alert icon, `aria-invalid` and `aria-describedby`.
- **Disabled / read-only:** `paper-2` background, `ink-2` text. Read-only keeps text selectable (the user may copy a CPF).
- **Masks:** CPF, CEP, phone and money format while typing. The money field fills right to left ("18000" → `R$ 180,00`) and is right-aligned.
- **Switch:** only for settings that apply immediately or for a form option with a clear effect ("Exige sala"). Always with the label on the left and a short description below.
- **Checkbox:** 16 px, `rule-strong` border, `ink-blue` when checked.

### 5.3 Navigation

- **Sidebar:** `paper-1` background, no heavy border (a 1 px `rule` on the right). Groups with a `column-label` heading in `ink-2` ("OPERAÇÃO", "CONFIGURAÇÕES").
- **Item:** 40 px high, 20 px icon + `body` text. `paper-2` on hover.
- **Active item:** `paper-0` background, `ink-0` text at 600 and a **3 px vertical `ink-blue` bar** on the left. It is the same gesture as the side stripe of agenda blocks.
- **Unit selector** in the header: always visible; shows the unit name, never just an icon.
- **Tabs:** `body` text in `ink-2`; active tab in `ink-0` 600 with a 2 px `ink-blue` underline. No pill backgrounds.
- **Breadcrumb:** only on second-level pages ("Unidades / Unidade Centro"), with the first level as a link.

### 5.4 Tables and lists

The most important component in the system.

- **No vertical borders.** 1 px `rule` horizontal lines between rows; the last row has no border.
- **Header:** `paper-1` background, `column-label` text in `ink-2`, 36 px high.
- **Row:** 40 px; `paper-2` on hover; selected `ink-blue-soft` with a 3 px `ink-blue` bar on the left.
- **Alignment:** text left; numbers, amounts and quantities right; dates and times left, in tabular figures.
- **First column** is the identifier (patient or service name), in `body-strong`, and is the link that opens the detail.
- **Row actions:** ghost icon buttons, visible on hover and keyboard focus (always visible on touch screens).
- **Groups** (e.g. services by category): group title in `group-title` with the count in `meta` ("Procedimentos (4)"), above the table.
- **Totals:** last row in 600 weight with the **double rule** above (1 px + 2 px + 1 px), as in a ledger.
- **Inactive row** (deactivated service, archived patient): `ink-2` text, "INATIVO" stamp.

### 5.5 Status stamps

Appointment, payment and record states use the **stamp**: a rectangle with a 1 px border, 2 px radius, `column-label` text (12 px, uppercase), 2 × 6 px padding, in the three tones of its semantic function.

| State | Function | Text |
|---|---|---|
| Scheduled | Neutral (`rule-strong` border, `ink-2` text, `paper-0` background) | AGENDADO |
| Confirmed | Success | CONFIRMADO |
| In progress | Info | EM ATENDIMENTO |
| Completed | Dark neutral (`ink-1` text) | CONCLUÍDO |
| No-show | Danger | FALTOU |
| Cancelled | Neutral, struck through | ~~CANCELADO~~ |
| Paid | Success | PAGO |
| Partial | Warning | PARCIAL |
| Outstanding | Warning | EM ABERTO |
| Active / Inactive | Success / Neutral | ATIVO / INATIVO |

Stamps have no icon, are not clickable and are never rounded pills.

### 5.6 Cards

Cards are the **exception**. They exist only for:
- **Dashboard indicators (F12):** `paper-0` background, 1 px `rule` border, 8 px radius, no shadow. Label in `column-label`, number in `figure`, change in `meta` ("+4% vs. mês anterior", with an arrow and color only when the change is significant).
- **Agenda blocks** (section 10.1).
- **Units** in the units list, because each groups an address, rooms and status.

Everywhere else, information goes into a list or table. Never put a card inside another card.

### 5.7 Dialogs and panels

- **Side panel (sheet):** to create and edit records without losing sight of the list (service, patient, appointment). 560 px, slides in from the right, `paper-0` background, 1 px `rule` left border and the floating-layer shadow. Title in `section-title`; primary button in the panel's fixed footer.
- **Confirmation dialog (alert dialog):** for irreversible actions or actions with consequences the user must know (price change, cancelling a recurring series, reopening a cash register). Up to 440 px, 8 px radius. Title phrased as a question or the action ("Alterar preço"), text explaining the consequence, buttons "Cancelar" (secondary, left) and the named action (right: "Salvar novo preço", never just "OK" or "Confirmar").
- **Regular dialog:** for short, self-contained tasks (managing categories, inviting a user).
- **Backdrop:** `rgb(26 25 22 / 0.4)`, no blur.
- Focus moves to the first field on open and returns to the trigger on close. `Esc` closes, except with unsaved changes (ask first).

### 5.8 Feedback

| Type | When | Look |
|---|---|---|
| **Toast** | Confirmation of a successful action ("Serviço salvo"), notices with no decision ("12 agendamentos futuros deste serviço foram mantidos.") | Bottom right, `paper-0` background, `rule` border, 3 px left stripe in the function color; hides after 5 s (warnings: 8 s; errors: only when dismissed) |
| **Page alert** | A situation that remains true ("Esta unidade está desativada") | Function background and border, 16 px icon, content width |
| **Field error** | Validation | Below the field, danger text + icon. On submit, focus the first field with an error |
| **Loading** | Over 300 ms | Skeleton with the real content shapes in `paper-2`, no shimmer. Under 300 ms, nothing |
| **Empty state** | List with no items | Text explaining why + the action that solves it (section 7.4). No illustration |

---

### 5.9 Weekly hours grid

Used for unit business hours (F02) and professional working hours (F04).
- One row per weekday, Monday first, with the day name in `body-strong` on the left. Below 768 px each day becomes a block with the intervals stacked.
- Each interval is a pair of time selects in 5-minute steps ("08:00 até 12:00") with a ghost "Remover" icon button. "Adicionar intervalo" is a link-style ghost button, hidden when the day reaches its limit.
- Reference hours (the unit's business hours in the professional grid) are written in `meta` under the day name: "Funcionamento: 08:00–18:00" or "Unidade fechada".
- An interval that breaks a rule before saving gets the field error look (danger border) and the reason written below it, for example "Fora do funcionamento da unidade (08:00–18:00)". Color never carries the rule alone.
- "Copiar para os dias úteis" is a ghost button per row; the save button is the screen's single primary action.

### 5.10 Global search

The patient search in the header (F05), available on every screen.
- A field of at most 360 px with the search icon and the placeholder "Buscar paciente (/)". On phones it collapses to an icon button that opens the field full width.
- The `/` key focuses it, except while typing in another field. `Esc` clears and leaves it.
- Results open below as a floating list (the only shadow), at most 8 rows of 40 px: the name in `body-strong` and, in `meta`, the age, the masked CPF or the last 4 phone digits. Arrow keys move, `Enter` opens.
- Below 3 characters the list says "Digite pelo menos 3 caracteres."; with no result, "Nenhum paciente encontrado para "{busca}"." and, for those who may register, a "Cadastrar paciente" link. The last row is always "Ver todos os resultados".

### 5.11 Agenda

The agenda (F06) builds on section 10.1. These rules cover the parts that section does not show.
- **Week view:** seven day columns (Monday first) for one professional or one room, with the same time ruler, rules, now line and blocks as the day view. The column header is the weekday and date in `column-label`; today's header is in `ink-1` with a 2 px `ink-blue` underline.
- **Room view:** the day view with one column per active room of the unit. Column headers carry no color dot; blocks still carry the service stripe.
- **Encaixe:** an overbooked block keeps its status stamp and adds a second stamp "ENCAIXE" in the warning tone. Two blocks that overlap in the same column share its width side by side.
- **Drag and resize:** a draggable block shows the `grab` cursor; while dragging, a dashed `ink-blue` outline marks the target slot and the original block stays in place at 40% opacity until the move is confirmed. The resize handle is the bottom 6 px of the block (a 2 px `rule-strong` line appears on hover and focus). Keyboard: `Space` picks up, arrows move one slot (up and down) or one column (left and right), `Space` drops, `Esc` cancels; each step is announced. Dropping always opens a confirmation dialog ("Reagendar para qui, 14:30 com Dra. Ana?").
- **Conflicts in the booking panel:** findings appear above the panel footer, in the order blocking, overridable, warning. Blocking uses the danger page alert; overridable uses the warning alert with the action inside it ("Confirmar encaixe" as a secondary button, or the "Justificar exceção" field); the patient warning uses the info alert. The primary button only reads "Agendar" again after every overridable finding has been accepted.
- **Series conflicts:** a summary line in `body-strong` ("4 de 20 sessões possuem conflito.") above a compact table: Sessão, Data, Horário, Conflito, Ação. The action column holds the ghost buttons "Pular" and "Escolher outro horário"; choosing another time opens an inline time select with up to 3 suggested times. Resolved rows show the decision as text ("Pulada", "Novo horário 11:00").
- **Próximo horário livre:** a regular dialog with Serviço (required) and Profissional (optional), and the results as a table of up to 10 rows (Data, Horário, Profissional, Sala) with a ghost "Agendar" button per row.
- **Lateness and history:** lateness follows section 10.1. The appointment panel lists the status history as a compact table (Status as a stamp, Data e hora, Por), newest first.
- **Printed agenda (PDF):** A4 portrait on white, clinic name and logo at the top left, the professional, unit and date as the title in the serif face, the double rule below it, then a table with fine horizontal rules (Horário, Paciente, Telefone, Serviço, Sala, Status, Observações). Footer: "Gerado em {data hora} por {usuário}" on the left and the page number on the right, in `meta` size. No color besides ink.

### 5.12 Clinical record

The clinical record (F07) is the one place where the interface behaves like a document. These rules cover what the other sections do not show.
- **Split screen:** a left column of 360 px with the patient header and the list of previous notes, and the editor or reader in the right column, in the reading column of section 3.3 (72 characters). Below the `md` breakpoint the columns stack with the editor first and the list below it.
- **Patient header:** the name in the serif face, the age in `meta`, and the clinical alert as a danger stamp that carries the alert text. "Editar alertas" is a ghost button that opens a dialog with a textarea and a character counter.
- **Notes list:** a compact table (Data, Profissional, Serviço, first 150 characters as `meta`). State is written as text in stamps ("Rascunho", "Bloqueado", "3 adendos"), never by color alone. The selected row has the `paper-1` background and a 2 px `ink-blue` rule on its left edge.
- **Editor:** the toolbar sits above the text on a `paper-1` strip. Buttons are text-and-icon ghost buttons with the shortcut in the tooltip (Negrito, Itálico, Título, Lista, Lista numerada). The character counter is `meta`, turns to the warning tone at 90% and to the danger tone at the limit. "Finalizar registro" is the only primary button of the screen; in edit mode "Salvar alterações" takes its place and "Descartar alterações" is a ghost button.
- **Save status line:** above the editor in `meta`: "Rascunho salvo às 14:32", "Salvando…", "Finalizado — editável até 29/09 14:10" or "Bloqueado". The offline and stale conditions use the warning page alert below it, with the text of the PRD. The status is a live region (`aria-live="polite"`).
- **Locked and read-only notes:** the text is shown in the reading column without a border, and an info alert states when the note was locked. "Adicionar adendo" is a secondary button under the text.
- **Addenda:** below the original text, separated by a fine rule, each with "Adendo de {autor} em {data hora}" in `body-strong` followed by the text. No actions are shown on them, because they cannot change.
- **Attachments:** a dashed `rule-strong` drop zone with the text "Arraste arquivos ou escolha" and a secondary button as the keyboard alternative. Each file is a row with a thumbnail (or a PDF icon), name, size, a text status ("Enviando 45%", "Processando", "Pronto", "Falhou") and a progress bar. Attachments marked as mistakes are hidden until "Mostrar anexos ocultos" is checked, and then carry the neutral stamp "Anexado por engano".

### 5.13 Patient documents

Documents (F08) live in a tab of the patient page and in one settings page. These rules cover what the other sections do not show.
- **Documents tab:** a table with fine rules (Data, Título, Categoria, Autor, Tamanho). The title carries the state as written stamps ("Clínico", "Arquivado", "Processando"), never by color alone. Filters above the table are a category select and a type select ("Todas", "Enviados", "Emitidos"), plus a "Mostrar arquivados" checkbox. "Enviar arquivos" is the single primary button of the tab and "Emitir documento" is an outline button next to it. Row actions (Visualizar, Baixar, Editar, Arquivar, Restaurar) are ghost buttons shown only when the server says the user may use them.
- **Upload dialog:** a dashed `rule-strong` drop zone with "Arraste arquivos ou escolha" and a secondary button as the keyboard alternative. Each file is a row with the name, size, a category select, an editable title, a text status ("Na fila", "Enviando 45%", "Enviado", "Falha no envio") and a progress bar. A row whose category is clinical shows "Visível apenas para profissionais autorizados" under the select when the user cannot read clinical documents. A failed row shows "Tentar novamente" as a ghost button and the other rows are not affected. The quota notice is a page alert of the warning tone at 80% and of the danger tone when full.
- **Preview modal:** an `<img>` for images and a frame for PDFs, with the title and metadata in `meta` above and "Baixar" as the only action. DOCX files have no preview and show only the download button.
- **Emission dialog:** one column of fields (Modelo, Profissional, Unidade, then one input per free field) and, beside it on wide screens or below it on narrow ones, the live preview as a sheet. The sheet is white with A4 proportions, a serif title and the body in the reading column; a missing value is highlighted with an underline in the warning tone and the text of the missing item, so it does not rely on color alone. For clinical templates the professional select is locked. "Gerar PDF" is the primary button; when values are missing the same button reads "Gerar mesmo assim" after the confirmation text appears.
- **Settings page:** three blocks separated by section titles: storage usage ("{used} de 50 GB usados ({percent}%)" with a bar and the warning and danger tones at 80% and 100%), the categories table (Nome, Clínico as a checkbox, Ativo) and the templates table (Nome, Tipo, Clínico, Ativo) with "Novo modelo".
- **Template editor:** the shared rich text editor with two extra toolbar buttons, "Inserir variável" (a menu grouped by patient, professional, unit, clinic and date) and "Campo livre" (asks for a field name). Variables in the text are shown as tokens in `mono`, on a `paper-1` background.

### 5.14 Billing

Billing (F09) lives in the agenda side panel, a tab of the patient page, the Financeiro pages and one settings page. These rules cover what the other sections do not show.
- **Status stamps:** a charge status is always written ("Aguardando aprovação de desconto", "Em aberto", "Parcialmente pago", "Pago", "Cancelado") as a stamp with the semantic tone (warning, neutral, info, success, muted). A refunded payment adds "Estornado" or "Estornado parcialmente". Never color alone.
- **Agenda section "Cobrança":** under the appointment data after check-in, one line with the status stamp, the net amount and the balance, then "Receber" (primary only while the charge can receive) and "Recibo" (ghost).
- **Receive modal:** the charge summary on top (item, gross, discount field with a percent/amount toggle, net), then one row per payment line (method select, amount, installments for credit card), "Adicionar forma de pagamento" as a ghost button, and the remaining balance as a live line that turns to the danger tone, with text, when the lines exceed the balance. "Confirmar recebimento" is the only primary button. A discount above 20% shows a warning alert with two choices: a manager select with a PIN field ("Aprovar agora com PIN") and "Enviar para aprovação". Managers also see the payment date field.
- **Tables:** charge lists use fine rules, amounts right-aligned in `mono` with the currency symbol, and a totals footer row per currency (Bruto, Desconto, Líquido, Recebido, Saldo).
- **Patient tab:** open charges come first inside a `paper-1` block with the total due per currency, followed by the history table.
- **Dialogs with a reason:** refund, void and rejection ask for a required reason in a text area, state the consequence in one sentence and use the danger button.
- **Approval PIN:** a six-digit field with `inputMode="numeric"`, masked, never shown in toasts or logs.

### 5.15 Session packages

Packages (F10) live in a settings page, a section of the patient's Financeiro tab and two marks in the agenda. These rules cover what the other sections do not show.
- **Package card:** a bordered block with the package name and service, the status written as a stamp ("Ativo", "Expirado", "Cancelado"), a progress bar with the text "{used} de {total} sessões", the expiry date ("Válido até {date}"), the payment stamp of the sale charge, and under it the linked appointments as a short table (date, professional, status). Active packages come first.
- **Sale dialog:** template select, the price field pre-filled with the template price, the per-session price as a live line, and, when the price is lower, the discount fields of the receive modal (reason above 10%, manager PIN or "Enviar para aprovação" above 20%). "Vender pacote" is the primary button. After the sale, the dialog offers "Receber agora".
- **"Usar pacote" choice:** a radio group in the booking and edit forms, above the notes, with "Usar pacote ({remaining} de {total} sessões restantes)" and "Não usar pacote". When exactly one package fits, it comes selected. In a series, a line says how many sessions the package covers.
- **Agenda mark:** a text stamp "Sessão 4/10" on the block and in the side panel, in the neutral tone; "Pacote expirado" in the warning tone when the appointment was unlinked by an expiry or a cancellation, until it is checked in or cancelled.
- **Notice:** "Pacote com saldo financeiro em aberto" is a warning alert at the top of the patient page.
- **Dialogs with a reason:** extending and cancelling ask for a required reason; cancelling with linked appointments shows the confirmation sentence before the danger button.

## 6. Visual details

### 6.1 Borders and radii

| Element | Radius |
|---|---|
| Stamps, checkboxes | 2 px |
| Buttons, fields, selects, dropdown menus | 4 px |
| Cards, dialogs, toasts | 8 px |
| Side panel, tables, sidebar | 0 |
| Switch | Rounded track and thumb: the only exception, because a square switch is not recognized as a switch |

Nothing exceeds 8 px. Circles (`50%`) only for avatars and the service color dot.

Borders: 1 px `rule` to separate; 1 px `rule-strong` to delimit a control; 3 px of color only to mark state or selection (side bar).

### 6.2 Shadows

A single shadow, only for what floats above the page (dropdown menus, dialogs, side panel, toasts):

```css
--elevation-floating: 0 1px 2px rgb(26 25 22 / 0.06), 0 8px 24px -8px rgb(26 25 22 / 0.18);
```

Cards, buttons, fields and tables have no shadow.

### 6.3 Icons

- **Lucide**, 1.75 px stroke.
- 16 px in buttons, tables and fields; 20 px in the sidebar; 24 px at most in empty states.
- An icon is **always accompanied by text**, except for icon buttons in table rows, which have an `aria-label` and a tooltip.
- No decorative icons in page titles, indicator cards or next to every list item.
- Color: inherits the adjacent text color.

### 6.4 Motion

| Token | Duration | Use |
|---|---|---|
| `motion-fast` | 120 ms | Hover, focus, tab change |
| `motion-default` | 200 ms | Opening a dropdown, dialog, toast |
| `motion-panel` | 240 ms | Side panel |

A single curve: `cubic-bezier(0.2, 0, 0, 1)` (deceleration). No bounce, no staggered list animations, no page transitions.

The "now" line on the agenda moves every minute without animation (it jumps to the new position).

---

## 7. Content

### 7.1 Voice and tone

**Like an experienced front-desk colleague:** direct, polite, never rushed or robotic. Examples below are in pt-BR, the product language.

| Rule | Yes | No |
|---|---|---|
| Short sentences, active voice | "Paciente cadastrado." | "O cadastro do paciente foi efetuado com sucesso!" |
| No exclamation marks | "Pagamento registrado." | "Pagamento registrado com sucesso!!" |
| Say what happened and what to do | "Este horário já está ocupado. Escolha outro horário ou outra sala." | "Erro 409: conflito." |
| Use the clinic's terms | "Faltou", "Atendimento", "Caixa" | "No-show", "Encounter", "Ledger" |
| Numbers as digits | "3 pacientes", "12 agendamentos" | "três pacientes" |
| Formats of the user's language and country (7.5) | pt-BR: "05/10/2026", "14:30", "R$ 1.234,56" | "Oct 5", "2:30 PM", "R$1234.56" |
| Short durations | "30 min", "1h 30min" | "1,5 hora" |
| Never blame the user | "Não encontramos este CEP." | "Você digitou um CEP inválido." |

### 7.2 Actions (buttons and links)

- **Infinitive verb + object when ambiguous:** "Salvar", "Agendar consulta", "Registrar pagamento", "Fechar caixa".
- **The button says what will happen:** "Salvar novo preço", "Cancelar 8 sessões", not "Confirmar".
- **Cancelling a dialog ≠ cancelling an appointment.** In dialogs about appointments, the exit button is "Voltar", so it is never confused with "Cancelar agendamento".

### 7.3 Errors

Structure: **what happened** + **what to do**, when there is something to do.

- "Já existe um serviço com este nome."
- "A duração deve ser entre 5 e 480 minutos, em múltiplos de 5."
- "Estes dados foram alterados por outra pessoa. Recarregue a página e tente novamente."
- "Sua sessão expirou. Entre novamente para continuar." (the form is restored afterwards)
- "Não foi possível consultar o CEP agora. Preencha o endereço manualmente."

The exact PRD messages take precedence over any rewrite.

### 7.4 Empty states

Structure: **what is missing** + **why** (if not obvious) + **the action**.

- Services list with no filter: "Nenhum serviço cadastrado ainda. Os serviços definem duração e preço dos agendamentos." + "Novo serviço" button.
- Filtered list: "Nenhum serviço encontrado para "derma"." + "Limpar busca" link.
- Day agenda with no appointments: "Nenhum agendamento para hoje nesta unidade." + "Agendar consulta".
- For users who cannot create: the first sentence only, no button.

### 7.5 Languages, glossary and number formats

The interface exists in `pt-BR` (the source text), `en` and `es` (neutral Latin American Spanish, "ustedes"). Text lives in catalogs (ADR-028); the rules above apply to every language, and the examples in this section stay in pt-BR unless noted.

- **One key per text.** Never concatenate sentences from pieces; use a message with parameters, because word order changes between languages.
- **Glossary.** The same term in all screens and languages:

| pt-BR | en | es |
|---|---|---|
| Agendamento | Appointment | Cita |
| Encaixe | Overbooking | Sobrecupo |
| Prontuário | Clinical record | Historia clínica |
| Caixa | Cash register | Caja |
| Faltou | No-show | No asistió |
| Recepção | Front desk | Recepción |
| Unidade | Unit | Sede |

- **Formats follow the user's language and the unit's country**, through the formatters, never by hand: pt-BR "05/10/2026", "14:30", "R$ 1.234,56"; en-US "10/05/2026", "2:30 PM", "$1,234.56"; es-MX "05/10/2026", "14:30", "$1,234.56"; es-CL "$1.235" (no decimals).
- **Never translate clinic data:** service, unit, room, reason, note and person names stay as typed.
- **Language names** are always written in their own language: "Português (Brasil)", "English", "Español".
- **Space for longer text.** English and Spanish are often 20–30% longer than Portuguese in buttons and table headings; layouts must wrap or grow, never truncate meaning.

---

## 8. Accessibility

Target: **WCAG 2.2 level AA** on every screen.

- **Contrast:** every combination in section 2.5 passes. Any new combination must be measured before it is used.
- **Visible focus:** 2 px `ink-blue` ring with a 2 px offset in the background color (`outline: 2px solid var(--ring); outline-offset: 2px`), only on `:focus-visible`. Never remove the outline without a replacement.
- **Keyboard:** every mouse action is possible with the keyboard.
  - `Tab` follows the visual order; the first item on the page is the "Pular para o conteúdo" skip link.
  - Option groups (color palette, tabs, menus) use arrow keys with a single `Tab` stop.
  - Agenda: arrows move between slots and days; `Enter` opens the appointment; `N` creates one in the focused slot.
  - Global search: `/` focuses the patient search field.
- **Screen readers:** real labels on every field; errors linked with `aria-describedby`; toasts in an `aria-live="polite"` region (errors `assertive`); stamps read as text; service colors carry the color name in `aria-label`.
- **Never color alone:** states have text; errors have an icon and text; the now line has the "agora" label.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, every duration drops to 0 ms; the side panel appears without sliding.
- **Zoom:** the interface works at 200% zoom without horizontal scrolling (except the agenda grid).
- **Touch targets:** 44 × 44 px below 1024 px; at least 24 × 24 px on desktop (WCAG 2.5.8).
- **Language:** `<html lang="pt-BR">`, already set.

---

## 9. Design tokens

### 9.1 CSS variables

The names follow shadcn/ui, so they replace the current values in [src/app/globals.css](../src/app/globals.css) without changing the components. GCli's own tokens come after.

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

### 9.2 Tailwind wiring

In the `@theme inline` block of `globals.css`, the GCli tokens become utilities (`bg-paper-1`, `text-ink-2`, `border-rule`, `text-success`...):

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

The double rule of the page header and totals:

```css
/* 4 px "double" = 1 px rule + 2 px gap + 1 px rule */
.double-rule {
  border-bottom: 4px double var(--rule);
}
```

### 9.3 Adoption

1. Install the fonts: `npm i @fontsource-variable/source-serif-4 @fontsource-variable/source-sans-3` and import them in the root layout.
2. Replace the `:root` and `.dark` values in `globals.css` with section 9.1 and extend `@theme inline` with section 9.2.
3. Adjust the shadcn/ui component variants (button, field, table, badge → stamp, tabs, sheet) per section 5.
4. Review the existing screens (F01 to F03) and run the E2E tests.
5. The decision is recorded as ADR-020 in the [architecture](architecture.en.md).

---

## 10. Examples

### 10.1 Main screen: the day agenda (front desk)

The most used screen in the system, open all day on the front-desk computer.

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
━━━━━━━━┿━━━━ agora 09:12 ━━━━━━┿━━━━━━━━━━━━━━━━━━━━━━━┿━━━━━━━━━━━━━━━━━━━━  ← terracotta
 09:30  │▌Luiza Martins         │                       │
```

How the rules work together:
- **Record header:** "Agenda" title in serif, metadata with the unit, the full date and the total, double rule. The only primary action is "Agendar consulta".
- **Time ruler:** times in the left column in tabular figures, `ink-2`. A 1 px `rule` line at each full hour and a dashed one every 30 min. `paper-0` background; hours outside the unit's business hours in `paper-1`; closures with diagonal hatching in `paper-2` and the reason written out.
- **Now line:** 2 px `terracotta` across every column, with the "agora 09:12" label in 13 px `terracotta-text`. It is the only terracotta element on the screen.
- **Appointment blocks** (the only cards on the screen): `paper-0` background, 1 px `rule` border, 4 px radius, **4 px stripe in the service color** on the left. Line 1: patient name in `body-strong`. Line 2: service and room in `meta`. Line 3: status stamp. 15-minute blocks show only the name and the stamp; the rest appears in the tooltip and the panel.
- **Lateness:** a patient more than 10 min past their time without check-in gets "atrasado 12 min" in `terracotta-text` next to the stamp.
- **Keyboard:** arrows move through slots, `Enter` opens the appointment in the side panel, `N` books in the focused slot.
- **Phone:** one professional at a time, switched with tabs at the top; blocks take the full width; "Agendar consulta" fixed at the bottom.

### 10.2 Flow: booking an appointment in under 60 seconds

PRD goal: an existing patient is booked in at most 60 s, with the patient on the phone.

1. **Start.** The receptionist clicks a free slot (or focuses it and presses `N`). The side panel opens in 240 ms, with professional, date, time and unit already filled from the chosen slot. Focus goes straight to "Paciente".
2. **Patient.** Search as you type (name, CPF or phone), results within 1 s. Each result shows the name in `body-strong` and, in `meta`, the date of birth and the last 4 digits of the phone, to tell namesakes apart without exposing data. Arrows + `Enter` pick one.
3. **Service.** Only active services the professional provides, grouped by category, each with its color dot, duration and price. Choosing the service sets the end time.
4. **Room.** If the service requires a room, the field appears with the unit's allowed, free rooms. If only one fits, it is preselected.
5. **Conflict.** If the slot was taken in the meantime (another receptionist booked it), the message appears at the top of the panel as a danger alert: "Este horário já está ocupado. Escolha outro horário ou outra sala.", with the next three free slots as ghost buttons. Nothing already filled in is lost.
6. **Save.** Primary "Agendar" button in the panel footer. While saving: "Agendando...". When done, the panel closes, the block appears on the agenda with the AGENDADO stamp and the toast says "Consulta agendada para 06/10 às 14:30.". Focus returns to the slot on the agenda.

No new page opens during the whole flow, and every step can be done without a mouse.

---

## 11. Do and avoid

| Do | Avoid |
|---|---|
| Use tables with fine rules to list records | Card grids for what is a list |
| One primary button per screen, named by its action | Two or three blue buttons competing |
| Write the state as text (stamp) and use color as reinforcement | Colored dots without a label |
| Page and section titles in serif; everything else in sans | Serif in buttons, tables or fields |
| Tabular figures and right-aligned amounts | Centered amounts or amounts without `R$` |
| The double rule only in page headers and above totals | The double rule as decoration on any divider |
| Terracotta only for "now" and "late" | Terracotta on buttons, icons or titles |
| Radii of 2, 4 or 8 px | Corners of 12, 16 px or more; pill buttons |
| One shadow, only on what floats | Shadows on cards, buttons and fields |
| Icons next to text, with a purpose | Decorative icons in titles or on every list item |
| `paper-*` backgrounds and dark ink | Gradients, frosted glass, flat pure white |
| PRD messages as written | Rewriting approved messages |
| Measure the contrast of every new combination | Assuming "it looks readable" |
| Test the screen with the keyboard and at 200% zoom | Validating only with a mouse on a large monitor |

**Before shipping a new screen, check:**
1. Is there at most one primary button?
2. Does every state have text?
3. Are numbers in tabular figures and aligned?
4. Is focus visible, and does it follow the visual order?
5. Does the screen work at 375 px wide?
6. Could any card, shadow, gradient or icon go without losing information? If so, remove it.
