import { loadCtx } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getReport, REPORTS } from "@/lib/stats";
import { resolveRange } from "@/lib/format";

export const dynamic = "force-dynamic";

const esc = (v: string | number) => {
  const s = String(v).replace(/\u202f|\u00a0/g, " ");
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const r = await loadCtx();
  if (!r?.ctx) return new Response("Non authentifié", { status: 401 });
  if (!can(r.ctx.role, "reports.view")) return new Response("Accès refusé", { status: 403 });
  const u = new URL(req.url);
  const type = REPORTS.find((x) => x.key === u.searchParams.get("type"))?.key ?? "ventes";
  const range = resolveRange({ p: u.searchParams.get("p") ?? undefined, from: u.searchParams.get("from") ?? undefined, to: u.searchParams.get("to") ?? undefined }, r.ctx.settings.timezone);
  const rep = await getReport(r.ctx.org.id, type, range, r.ctx.settings.timezone, r.ctx.settings);
  const lines = [rep.columns, ...rep.rows].map((row) => row.map(esc).join(";"));
  return new Response("\uFEFF" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rapport-${type}-${range.from}_${range.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
