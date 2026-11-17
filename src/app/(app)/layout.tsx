import type { ReactNode } from "react";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { AppShell } from "@/components/shell";
import { LicenseGate } from "@/components/license-gate";
import { PwaRegister } from "@/components/pwa";
import { pageCtx } from "@/lib/auth";
import { syncAlerts } from "@/lib/biz";
import { NAV, ROLE_LABELS, can } from "@/lib/permissions";
import { logoutAction, switchOrgAction } from "@/app/actions/auth";
import { checkOrganizationLicense } from "@/db/licenses";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await pageCtx();

  // These independent checks were previously awaited one after another on every page visit.
  const [licenseStatus, [, [{ n }]]] = await Promise.all([
    checkOrganizationLicense(ctx.org.id),
    Promise.all([
      syncAlerts(ctx.org.id, ctx.settings.timezone).catch((e) => console.error("syncAlerts", e)),
      db.select({ n: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.userId, ctx.user.id), eq(notifications.organizationId, ctx.org.id), eq(notifications.read, false))),
    ]),
  ]);
  const licenseExpired = !licenseStatus.valid;

  if (licenseExpired) {
    console.warn("Aucune licence active pour l'organisation", {
      orgId: ctx.org.id,
      message: licenseStatus.message,
    });
  }

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
      <LicenseGate expired={licenseExpired}>{children}</LicenseGate>
      <PwaRegister />
    </AppShell>
  );
}
