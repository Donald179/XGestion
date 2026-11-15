import "server-only";
import { notFound, redirect } from "next/navigation";
import { loadCtx } from "@/lib/auth";

export const SUPER_ADMIN_EMAIL = "lamiendonaldo179@gmail.com";

export function isSuperAdminEmail(email: string) {
  return email.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

/** Vérifie côté serveur l'identité de l'auteur avant d'afficher ou modifier les données SaaS. */
export async function requireSuperAdmin() {
  const session = await loadCtx();
  if (!session) redirect("/login");
  if (!isSuperAdminEmail(session.user.email)) notFound();
  return session.user;
}
