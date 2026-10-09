// Client entry point of the cash module (ADR-027): only client-safe UI and types, for Client
// Components of the app layer. Server code goes through ./index.ts.
export { CashRegisterView } from "./ui/cash-register-view";
export { CategoriesPanel } from "./ui/categories-panel";
export { EntriesView } from "./ui/entries-view";
export { StatementView } from "./ui/statement-view";
export type { CashActions, EntryFields, FinanceActions } from "./ui/cash-actions";
