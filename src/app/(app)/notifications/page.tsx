import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { AlertTriangle, Bell, Banknote, CheckCheck, FileWarning, PackageX, Truck, Wrench } from "lucide-react";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { syncAlerts } from "@/lib/biz";
import { fmtDateTime } from "@/lib/format";
import { ActionButton } from "@/components/client";
import { Card, Empty, PAGE_SIZE, PageHeader, Pager, pageOf } from "@/components/ui";
import { markNotificationAction } from "@/app/actions/ops";

export const metadata = { title: "Notifications" };
const ICON: Record<string, React.ReactNode> = {
  stock_low: <AlertTriangle className="h-4 w-4 text-orange-600" />, stock_out: <PackageX className="h-4 w-4 text-red-600" />, payment: <Banknote className="h-4 w-4 text-emerald-600" />,
  invoice_overdue: <FileWarning className="h-4 w-4 text-red-600" />, new_order: <Wrench className="h-4 w-4 text-brand-600" />, order_status: <Wrench className="h-4 w-4 text-brand-600" />,
  order_late: <AlertTriangle className="h-4 w-4 text-orange-600" />, po_received: <Truck className="h-4 w-4 text-emerald-600" />,
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const ctx = await pageCtx("notifications.view");
  const sp = await searchParams;
  const page = pageOf(sp.page);
  await syncAlerts(ctx.org.id, ctx.settings.timezone, true).catch(() => {});
  const where = and(eq(notifications.userId, ctx.user.id), eq(notifications.organizationId, ctx.org.id));
  const [rows, [{ n, unread }]] = await Promise.all([
    db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int`, unread: sql<number>`count(*) filter (where not read)::int` }).from(notifications).where(where),
  ]);
  return (
    <>
      <PageHeader title="Notifications" subtitle={`${unread} non lue${unread > 1 ? "s" : ""}`}>
        {unread > 0 && <ActionButton action={markNotificationAction} hidden={{ id: "" }} className="btn-outline" label={<><CheckCheck className="h-4 w-4" /> Tout marquer comme lu</>} />}
      </PageHeader>
      <Card>
        {rows.length === 0 ? <Empty text="Aucune notification." /> : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className={`flex items-start gap-3 px-4 py-3 ${r.read ? "" : "bg-brand-50/60"}`}>
                <div className="mt-0.5">{ICON[r.type] ?? <Bell className="h-4 w-4 text-slate-500" />}</div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${r.read ? "text-slate-700" : "font-semibold text-slate-900"}`}>{r.link ? <Link href={r.link} className="hover:underline">{r.title}</Link> : r.title}</p>
                  {r.body && <p className="text-xs text-slate-500">{r.body}</p>}
                  <p className="mt-0.5 text-[11px] text-slate-400">{fmtDateTime(r.createdAt, ctx.settings.timezone)}</p>
                </div>
                {!r.read && <ActionButton action={markNotificationAction} hidden={{ id: r.id }} label="Marquer lu" />}
              </li>
            ))}
          </ul>
        )}
        <Pager page={page} total={n} params={{}} />
      </Card>
    </>
  );
}
