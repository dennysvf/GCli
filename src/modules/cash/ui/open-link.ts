// Opens a short-lived download URL (a receipt) in a new tab without giving the page access to ours.
const NEW_TAB = "_blank";
const NO_OPENER = "noopener";

export function openInNewTab(url: string): void {
  window.open(url, NEW_TAB, NO_OPENER);
}
