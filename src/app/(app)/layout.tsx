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

  // 1. Vérification de la licence de l'organisation active
  const [license] = await db
    .select()
    .from(licenses)
    .where(
      and(
        eq(licenses.organizationId, ctx.org.id),
        eq(licenses.isActive, true)
      )
    )
    .limit(1);

  // 2. Si aucune licence active n'est trouvée, ou si elle a expiré
  const isExpired = license?.expiresAt ? new Date(license.expiresAt) < new Date() : false;

  // Si pas de licence ou expirée, on peut rediriger vers une page de blocage ou d'activation
  // (Exception faite si vous souhaitez leur laisser un accès restreint aux paramètres)
  if (!license || isExpired) {
    // Optionnel : Vous pouvez créer une page dédiée comme /admin/licenses/expiree
    // Pour l'instant, on redirige vers les paramètres ou une page dédiée
    // redirect("/parametres?erreur=licence_invalide");
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
