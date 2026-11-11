import type { ReactNode } from "react";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { AppShell } from "@/components/shell";
import { pageCtx } from "@/lib/auth";
import { syncAlerts } from "@/lib/biz";
import { NAV, ROLE_LABELS, can } from "@/lib/permissions";
import { logoutAction, switchOrgAction } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await pageCtx();
  await syncAlerts(ctx.org.id, ctx.settings.timezone).catch((e) => console.error("syncAlerts", e));
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, ctx.user.id), eq(notifications.organizationId, ctx.org.id), eq(notifications.read, false)));
  const nav = NAV.filter((i) => can(ctx.role, i.perm)).map(({ href, label, icon }) => ({ href, label, icon }));
  return (
    <AppShell
      nav={nav}
      orgName={ctx.org.name}
      orgs={ctx.orgs.map((o) => ({ id: o.id, name: o.name }))}
      activeOrg={ctx.org.id}
      userName={ctx.user.fullName}
      roleLabel={ROLE_LABELS[ctx.role]}
      unread={n}
      logo={ctx.org.logoUrl}
      switchOrg={switchOrgAction}
      logout={logoutAction}
    >
      {children}
    </AppShell>
  );
}
