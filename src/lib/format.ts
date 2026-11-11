export type Cur = { currency: string; currencyLabel: string; locale?: string; timezone?: string };
export const DEFAULT_TZ = "Africa/Ouagadougou";

const ZERO_DEC = ["XOF", "XAF", "JPY", "GNF", "KMF", "RWF"];

export function fmtMoney(n: number | null | undefined, cur?: Pick<Cur, "currency" | "currencyLabel">): string {
  const c = cur ?? { currency: "XOF", currencyLabel: "FCFA" };
  const dec = ZERO_DEC.includes(c.currency) ? 0 : 2;
  const s = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n ?? 0);
  return `${s.replace(/[\u202f\u00a0]/g, " ")} ${c.currencyLabel}`;
}

export function fmtNum(n: number | null | undefined): string {
  return new Intl.NumberFormat("fr-FR").format(n ?? 0).replace(/[\u202f\u00a0]/g, " ");
}

/** JJ/MM/AAAA */
export function fmtDate(d: string | Date | null | undefined, tz: string = DEFAULT_TZ): string {
  if (!d) return "—";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  }
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("fr-FR", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" }).format(dt);
}

export function fmtDateTime(d: string | Date | null | undefined, tz: string = DEFAULT_TZ): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(dt);
}

/** Date du jour AAAA-MM-JJ dans le fuseau donné */
export function today(tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type Period = "today" | "week" | "month" | "quarter" | "year" | "custom";
export const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Aujourd'hui" },
  { key: "week", label: "Cette semaine" },
  { key: "month", label: "Ce mois" },
  { key: "quarter", label: "Ce trimestre" },
  { key: "year", label: "Cette année" },
  { key: "custom", label: "Période personnalisée" },
];

export type Range = { period: Period; from: string; to: string };

export function resolveRange(sp: { p?: string; from?: string; to?: string }, tz: string = DEFAULT_TZ): Range {
  const t = today(tz);
  const period = (PERIODS.find((x) => x.key === sp.p)?.key ?? "month") as Period;
  const [y, m] = t.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (period === "today") return { period, from: t, to: t };
  if (period === "week") {
    const dow = (new Date(t + "T00:00:00Z").getUTCDay() + 6) % 7; // lundi = 0
    return { period, from: addDays(t, -dow), to: addDays(t, 6 - dow) };
  }
  if (period === "quarter") {
    const qm = Math.floor((m - 1) / 3) * 3 + 1;
    const end = new Date(Date.UTC(y, qm + 2, 0)).toISOString().slice(0, 10);
    return { period, from: `${y}-${pad(qm)}-01`, to: end };
  }
  if (period === "year") return { period, from: `${y}-01-01`, to: `${y}-12-31` };
  if (period === "custom") {
    const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    let from = ok(sp.from) ? sp.from! : `${y}-${pad(m)}-01`;
    let to = ok(sp.to) ? sp.to! : t;
    if (from > to) [from, to] = [to, from];
    return { period, from, to };
  }
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { period: "month", from: `${y}-${pad(m)}-01`, to: end };
}

export const METHOD_LABELS: Record<string, string> = {
  especes: "Espèces",
  mobile_money: "Mobile Money",
  virement: "Virement bancaire",
  carte: "Carte bancaire",
  autre: "Autre",
};

export const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
