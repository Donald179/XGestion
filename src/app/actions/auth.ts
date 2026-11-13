"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { organizationMembers, passwordResets, profiles, sessions, licenses } from "@/db/schema";
import { run, str, optStr, type ActionState } from "@/lib/action";
import { actCtx, createSession, destroySession, hashPassword, hashToken, loadCtx, newToken, setActiveOrg, UserError, verifyPassword } from "@/lib/auth";
import { createOrganization } from "@/lib/biz";
import crypto from "crypto";

const attempts = new Map<string, { n: number; t: number }>();
function throttle(key: string) {
  const a = attempts.get(key);
  if (a && Date.now() - a.t < 15 * 60_000 && a.n >= 8) throw new UserError("Trop de tentatives. Réessayez dans quelques minutes.");
  attempts.set(key, !a || Date.now() - a.t >= 15 * 60_000 ? { n: 1, t: Date.now() } : { n: a.n + 1, t: a.t });
}

// Fonction utilitaire pour générer une clé d'essai unique
function generateTrialKey(): string {
  const p1 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const p2 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const p3 = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `TRIAL-${p1}-${p2}-${p3}`;
}

const pwd = z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.").max(100);

export async function registerAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const d = z
      .object({
        fullName: z.string().min(2, "Nom complet requis."),
        email: z.string().email("Adresse email invalide."),
        password: pwd,
        confirm: z.string(),
      })
      .parse({ fullName: str(fd, "fullName"), email: str(fd, "email").toLowerCase(), password: String(fd.get("password") ?? ""), confirm: String(fd.get("confirm") ?? "") });
    if (d.password !== d.confirm) throw new UserError("Les mots de passe ne correspondent pas.");
    const [ex] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, d.email));
    if (ex) throw new UserError("Un compte existe déjà avec cet email.");
    const [u] = await db.insert(profiles).values({ email: d.email, fullName: d.fullName, passwordHash: hashPassword(d.password) }).returning();
    await createSession(u.id);
    return { redirect: "/onboarding", message: "Compte créé. Configurez maintenant votre entreprise." };
  });
}

export async function loginAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const email = str(fd, "email").toLowerCase();
    const password = String(fd.get("password") ?? "");
    throttle(email);
    const [u] = await db.select().from(profiles).where(eq(profiles.email, email));
    if (!u || !verifyPassword(password, u.passwordHash)) throw new UserError("Email ou mot de passe incorrect.");
    attempts.delete(email);
    await createSession(u.id);
    return { redirect: "/dashboard" };
  });
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function forgotAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const email = z.string().email("Adresse email invalide.").parse(str(fd, "email").toLowerCase());
    throttle("reset:" + email);
    const [u] = await db.select().from(profiles).where(eq(profiles.email, email));
    if (u) {
      const { token, hash } = newToken();
      await db.insert(passwordResets).values({ tokenHash: hash, userId: u.id, expiresAt: new Date(Date.now() + 3600_000) });
      const link = `/reset-password?token=${token}`;
      console.log("[reset-password]", email, link);
      if (process.env.RESET_LINK_MODE !== "hidden") return { message: `Lien de réinitialisation (valable 1 h) : ${link}`, redirect: undefined };
    }
    return "Si un compte existe pour cet email, un lien de réinitialisation a été généré.";
  });
}

export async function resetAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const password = pwd.parse(String(fd.get("password") ?? ""));
    if (password !== String(fd.get("confirm") ?? "")) throw new UserError("Les mots de passe ne correspondent pas.");
    const [r] = await db
      .select()
      .from(passwordResets)
      .where(and(eq(passwordResets.tokenHash, hashToken(str(fd, "token"))), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())));
    if (!r) throw new UserError("Lien invalide ou expiré.");
    await db.transaction(async (tx) => {
      await tx.update(profiles).set({ passwordHash: hashPassword(password) }).where(eq(profiles.id, r.userId));
      await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.tokenHash, r.tokenHash));
      await tx.delete(sessions).where(eq(sessions.userId, r.userId));
    });
    return { message: "Mot de passe modifié. Vous pouvez vous connecter.", redirect: "/login" };
  });
}

export async function createOrgAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const r = await loadCtx();
    if (!r) throw new UserError("Session expirée.");
    const name = z.string().min(2, "Nom de l'entreprise requis.").parse(str(fd, "name"));
    const email = optStr(fd, "email");
    if (email) z.string().email("Email professionnel invalide.").parse(email);
    
    // Création de l'organisation via la transaction
    const org = await db.transaction(async (tx) => {
      const newOrg = await createOrganization(tx, r.user.id, {
        name, email, phone: optStr(fd, "phone"), address: optStr(fd, "address"),
        currency: str(fd, "currency") || "XOF", currencyLabel: str(fd, "currencyLabel") || "FCFA",
      });

      // Attribution automatique de 14 jours d'essai gratuit
      const trialExpiresAt = new Date();
      trialExpiresAt.setDate(trialExpiresAt.getDate() + 14); // +14 jours

      await tx.insert(licenses).values({
        licenseKey: generateTrialKey(),
        planType: "essai_14_jours",
        organizationId: newOrg.id,
        maxUsers: 3,
        isActive: true,
        activatedAt: new Date(),
        expiresAt: trialExpiresAt,
      });

      return newOrg;
    });

    await setActiveOrg(org.id);
    return { redirect: "/dashboard", message: "Entreprise créée avec 14 jours d'essai gratuit !" };
  });
}

export async function switchOrgAction(fd: FormData) {
  const r = await loadCtx();
  if (!r) redirect("/login");
  const id = str(fd, "org");
  const [m] = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.userId, r.user.id), eq(organizationMembers.organizationId, id), eq(organizationMembers.active, true)));
  if (m) await setActiveOrg(id);
  redirect("/dashboard");
}

export async function changePasswordAction(_: ActionState, fd: FormData) {
  return run(async () => {
    const ctx = await actCtx();
    const [u] = await db.select().from(profiles).where(eq(profiles.id, ctx.user.id));
    if (!verifyPassword(String(fd.get("current") ?? ""), u.passwordHash)) throw new UserError("Mot de passe actuel incorrect.");
    const password = pwd.parse(String(fd.get("password") ?? ""));
    await db.update(profiles).set({ passwordHash: hashPassword(password) }).where(eq(profiles.id, u.id));
    return "Mot de passe modifié.";
  });
}
