// Display helpers shared by the patients screens (design system 7.1: Brazilian formats).
export function formatDateBR(date: string): string {
  const [year, month, day] = date.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function formatDateTimeBR(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone }).format(
    new Date(iso),
  );
}
