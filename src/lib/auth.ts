import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import {
  organizationMembers,
  organizations,
  organizationSettings,
  profiles,
  sessions,
  type Role,
} from "@/db/schema";
import { can, homeFor } from "@/lib/permissions";
import { UserError, hashPassword, verifyPassword, newToken, hashToken } from "@/lib/core";

export { UserError, hashPassword, verifyPassword, newToken, hashToken };

const SESSION_DAYS = 14;
const sha = hashToken;

export async function createSession(userId: string) {
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(sessions).values({ tokenHash: hash, userId, expiresAt });
  const jar = await cookies();
  jar.set("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get("session")?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha(token)));
  jar.delete("session");
  jar.delete("org");
}

export type Settings = typeof organizationSettings.$inferSelect;
export type Org = typeof organizations.$inferSelect;
export type Ctx = {
  user: { id: string; email: string; fullName: string };
  orgs: { id: string; name: string; role: Role }[];
  org: Org;
  role: Role;
  settings: Settings;
};

/** Charge l'utilisateur, ses entreprises autorisées et l'entreprise active (vérifiée côté serveur). */
export const loadCtx = cache(async (): Promise<{ user: Ctx["user"]; ctx: Ctx | null } | null> => {
  const jar = await cookies();
  const token = jar.get("session")?.value;
  if (!token) return null;
  const [row] = await db
    .select({ id: profiles.id, email: profiles.email, fullName: profiles.fullName })
    .from(sessions)
    .innerJoin(profiles, eq(profiles.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha(token)), gt(sessions.expiresAt, new Date())));
  if (!row) return null;
  const memberships = await db
    .select({ id: organizations.id, name: organizations.name, role: organizationMembers.role })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(eq(organizationMembers.userId, row.id), eq(organizationMembers.active, true)))
    .orderBy(organizations.name);
  if (!memberships.length) return { user: row, ctx: null };
  const wanted = jar.get("org")?.value;
  const cur = memberships.find((m) => m.id === wanted) ?? memberships[0];
  const [[org], [settings]] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, cur.id)),
    db.select().from(organizationSettings).where(eq(organizationSettings.organizationId, cur.id)),
  ]);
  return { user: row, ctx: { user: row, orgs: memberships, org, role: cur.role, settings } };
});

/** Pour les pages serveur : redirige si non connecté / sans droit. */
export async function pageCtx(perm?: string): Promise<Ctx> {
  const r = await loadCtx();
  if (!r) redirect("/login");
  if (!r.ctx) redirect("/onboarding");
  if (perm && !can(r.ctx.role, perm)) redirect(homeFor(r.ctx.role));
  return r.ctx;
}

/** Pour les actions serveur : lève une UserError. */
export async function actCtx(perm?: string): Promise<Ctx> {
  const r = await loadCtx();
  if (!r?.ctx) throw new UserError("Session expirée. Veuillez vous reconnecter.");
  if (perm && !can(r.ctx.role, perm)) throw new UserError("Vous n'avez pas la permission d'effectuer cette action.");
  return r.ctx;
}

export async function setActiveOrg(orgId: string) {
  const jar = await cookies();
  jar.set("org", orgId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}
