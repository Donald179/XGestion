import type { ReactNode } from "react";
import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { AppShell } from "@/components/shell";
import { PwaRegister } from "@/components/pwa";
import { pageCtx } from "@/lib/auth";
import { syncAlerts } from "@/lib/biz";
import { NAV, ROLE_LABELS, can } from "@/lib/permissions";
import { logoutAction, switchOrgAction } from "@/app/actions/auth";
import { checkOrganizationLicense } from "@/db/licenses";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await pageCtx();

  const licenseStatus = await checkOrganizationLicense(ctx.org.id);

  // Ne pas rediriger vers /parametres si la licence est absente : cela provoque une boucle
  // de redirections sur la page de paramètres elle-même, qui est précisément celle conçue
  // pour permettre l'activation d'une licence. On laisse l'utilisateur accéder à cette page
  // et on affiche le reste de l'application sans bloquer complètement l'accès.
  if (!licenseStatus.valid) {
    console.warn("Aucune licence active pour l'organisation", {
      orgId: ctx.org.id,
      message: licenseStatus.message,
    });
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
      <PwaRegister />
    </AppShell>
  );
}
