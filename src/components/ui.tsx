import Link from "next/link";
import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export const PAGE_SIZE = 15;
export const pageOf = (v?: string) => Math.max(1, Math.floor(Number(v) || 1));
export const likeOf = (q?: string) => `%${(q ?? "").trim().replace(/[%_\\]/g, (m) => "\\" + m)}%`;

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="no-print flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

const TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  red: "bg-red-50 text-red-700 ring-red-100",
  orange: "bg-orange-50 text-orange-700 ring-orange-100",
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  gray: "bg-slate-100 text-slate-600 ring-slate-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
};

export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES | string; children: ReactNode }) {
  return <span className={`badge ring-1 ring-inset ${TONES[tone] ?? TONES.gray}`}>{children}</span>;
}

const STATUS: Record<string, [string, string]> = {
  en_attente: ["En attente", "gray"], acceptee: ["Acceptée", "blue"], en_cours: ["En cours", "violet"], en_pause: ["En pause", "orange"],
  terminee: ["Terminée", "green"], livree: ["Livrée", "green"], annulee: ["Annulée", "red"],
  validee: ["Validée", "green"], payee: ["Payée", "green"], partielle: ["Partiellement payée", "orange"], impayee: ["Non payée", "red"], emise: ["Émise", "blue"],
  brouillon: ["Brouillon", "gray"], envoye: ["Envoyé", "blue"], accepte: ["Accepté", "green"], refuse: ["Refusé", "red"], converti: ["Converti", "violet"],
  commandee: ["Commandée", "blue"], recue: ["Reçue", "green"],
};
export function StatusBadge({ status }: { status: string }) {
  const [label, tone] = STATUS[status] ?? [status, "gray"];
  return <Badge tone={tone}>{label}</Badge>;
}

export function payState(total: number, paid: number): string {
  return paid >= total - 0.005 ? "payee" : paid > 0 ? "partielle" : "impayee";
}

const STAT_TONES: Record<string, string> = {
  blue: "bg-brand-50 text-brand-600", green: "bg-emerald-50 text-emerald-600", orange: "bg-orange-50 text-orange-600",
  red: "bg-red-50 text-red-600", violet: "bg-violet-50 text-violet-600", gray: "bg-slate-100 text-slate-600",
};
export function StatCard({ label, value, icon, tone = "blue", hint }: { label: string; value: string; icon?: ReactNode; tone?: string; hint?: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      {icon && <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${STAT_TONES[tone]}`}>{icon}</div>}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <p className="truncate text-lg font-bold text-slate-900">{value}</p>
        {hint && <p className="truncate text-[11px] text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}

export function Empty({ text = "Aucun élément à afficher.", children }: { text?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <Inbox className="h-9 w-9 text-slate-300" />
      <p className="text-sm text-slate-500">{text}</p>
      {children}
    </div>
  );
}

export function Pager({ page, total, size = PAGE_SIZE, params }: { page: number; total: number; size?: number; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const href = (p: number) => {
    const n = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && k !== "page" && n.set(k, v));
    n.set("page", String(p));
    return `?${n.toString()}`;
  };
  return (
    <div className="no-print flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
      <span>{total} résultat{total > 1 ? "s" : ""} · page {Math.min(page, pages)} / {pages}</span>
      <div className="flex gap-2">
        {page > 1 ? <Link className="btn-outline btn-sm" href={href(page - 1)}>Précédent</Link> : <span className="btn-outline btn-sm opacity-40">Précédent</span>}
        {page < pages ? <Link className="btn-outline btn-sm" href={href(page + 1)}>Suivant</Link> : <span className="btn-outline btn-sm opacity-40">Suivant</span>}
      </div>
    </div>
  );
}

export function Tabs({ items, current, params = {} }: { items: { key: string; label: string }[]; current: string; params?: Record<string, string | undefined> }) {
  return (
    <div className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {items.map((t) => {
        const n = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => v && n.set(k, v));
        n.set("tab", t.key);
        return (
          <Link key={t.key} href={`?${n.toString()}`} className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${current === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <div className="flex gap-2">{actions}</div>
        </div>
      )}
      {children}
    </section>
  );
}
