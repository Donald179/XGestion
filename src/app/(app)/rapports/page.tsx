import Link from "next/link";
import { Download } from "lucide-react";
import { pageCtx } from "@/lib/auth";
import { REPORTS, getReport } from "@/lib/stats";
import { PERIODS, fmtDate, resolveRange } from "@/lib/format";
import { PeriodPicker, PrintButton } from "@/components/client";
import { Card, Empty, PageHeader, StatCard } from "@/components/ui";

export const metadata = { title: "Rapports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ type?: string; p?: string; from?: string; to?: string }> }) {
  const ctx = await pageCtx("reports.view");
  const sp = await searchParams;
  const type = REPORTS.find((r) => r.key === sp.type)?.key ?? "ventes";
  const range = resolveRange(sp, ctx.settings.timezone);
  const rep = await getReport(ctx.org.id, type, range, ctx.settings.timezone, ctx.settings);
  const qs = new URLSearchParams({ type, p: range.period, from: range.from, to: range.to }).toString();
  const timeless = type === "stocks" || type === "creances";
  return (
    <>
      <PageHeader title="Rapports" subtitle={`${ctx.org.name}${timeless ? " · état à ce jour" : ` · du ${fmtDate(range.from)} au ${fmtDate(range.to)}`}`}>
        {!timeless && <PeriodPicker periods={PERIODS} current={range.period} from={range.from} to={range.to} />}
        <a href={`/api/export?${qs}`} className="btn-outline"><Download className="h-4 w-4" /> CSV</a>
        <PrintButton label="PDF / Imprimer" />
      </PageHeader>
      <div className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {REPORTS.map((r) => (
          <Link key={r.key} href={`?${new URLSearchParams({ type: r.key, p: range.period, from: range.from, to: range.to }).toString()}`} className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${r.key === type ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{r.label}</Link>
        ))}
      </div>
      <h2 className="mb-3 hidden text-lg font-bold print:block">{rep.title} — {ctx.org.name}</h2>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{rep.summary.map((s) => <StatCard key={s.label} label={s.label} value={s.value} />)}</div>
      <Card title={rep.title}>
        {rep.rows.length === 0 ? <Empty text="Aucune donnée pour cette période." /> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr>{rep.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{rep.rows.slice(0, 500).map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={typeof v === "number" ? "text-right" : ""}>{v}</td>)}</tr>)}</tbody>
            </table>
            {rep.rows.length > 500 && <p className="p-3 text-xs text-slate-500">Affichage limité à 500 lignes — l&apos;export CSV contient toutes les lignes.</p>}
          </div>
        )}
      </Card>
    </>
  );
}
