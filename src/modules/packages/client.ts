// Client entry point of the packages module (ADR-027): only client-safe UI and types, for Client
// Components of other modules and of the app layer. Server code goes through ./index.ts.
export { PackageChoice } from "./ui/package-choice";
export { PackagesSection } from "./ui/packages-section";
export { TemplatesPanel } from "./ui/templates-panel";
export type { PackagesActions, SaveTemplateInput } from "./ui/packages-actions";
