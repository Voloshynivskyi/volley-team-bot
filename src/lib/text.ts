/** "середа, 23 вересня" → "Середа, 23 вересня" */
export function ucFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** plural(3, ["день", "дні", "днів"]) → "дні" */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

export function countOf(n: number, forms: [string, string, string]) {
  return `${n} ${plural(n, forms)}`;
}

/** "сьогодні" / "завтра" / "через 3 дні" / "5 днів тому" */
export function relativeDays(diffDays: number): string {
  if (diffDays === 0) return "сьогодні";
  if (diffDays === 1) return "завтра";
  if (diffDays === -1) return "вчора";
  if (diffDays > 0) return `через ${countOf(diffDays, ["день", "дні", "днів"])}`;
  return `${countOf(-diffDays, ["день", "дні", "днів"])} тому`;
}
