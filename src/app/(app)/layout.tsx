import type { ReactNode } from "react";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, licenses } from "@/db/schema";
import { AppShell } from "@/components/shell";
import { pageCtx } from "@/lib/auth";
import { syncAlerts } from "@/lib/biz";
import { NAV, ROLE_LABELS, can } from "@/lib/permissions";
import { logoutAction, switchOrgAction } from "@/app/actions/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await pageCtx();

  // 1. Récupérer la licence de l'organisation active
  const [license] = await db
    .select()
    .from(licenses)
    .where(eq(licenses.organizationId, ctx.org.id))
    .limit(1);

  const now = new Date();
  const isExpired = license?.expiresAt ? new Date(license.expiresAt) < now : true;

  // 2. Si aucune licence ou si la période d'essai/licence est expirée
  // On autorise quand même l'accès à la page des paramètres pour qu'il puisse entrer un code !
  // (Vous pouvez affiner selon la route active)
  if (!license || (isExpired && !ctx)) {
    // Redirection vers une page ou blocage (ex: vers les paramètres)
  }

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
