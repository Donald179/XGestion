"use server";

import { db } from "@/db";
import { licenses, organizations } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/super-admin";

function generateKey(): string {
  const p1 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const p2 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const p3 = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `XGEST-${p1}-${p2}-${p3}`;
}

export async function createLicenseAction(formData: FormData) {
  await requireSuperAdmin();
  const rawPlanType = String(formData.get("planType") ?? "mensuel");
  if (rawPlanType !== "mensuel" && rawPlanType !== "annuel") throw new Error("Type de licence invalide.");
  const rawMaxUsers = Number(formData.get("maxUsers") ?? 3);
  if (!Number.isInteger(rawMaxUsers) || rawMaxUsers < 1 || rawMaxUsers > 10000) throw new Error("Nombre d’utilisateurs invalide.");
  const newKey = generateKey();

  await db.insert(licenses).values({ licenseKey: newKey, planType: rawPlanType, maxUsers: rawMaxUsers, isActive: true });
  revalidatePath("/admin/licenses");
  revalidatePath("/admin");
}

export async function getLicensesWithOrgs() {
  await requireSuperAdmin();
  return db
    .select({
      id: licenses.id,
      licenseKey: licenses.licenseKey,
      planType: licenses.planType,
      maxUsers: licenses.maxUsers,
      isActive: licenses.isActive,
      activatedAt: licenses.activatedAt,
      expiresAt: licenses.expiresAt,
      createdAt: licenses.createdAt,
      orgName: organizations.name,
    })
    .from(licenses)
    .leftJoin(organizations, eq(licenses.organizationId, organizations.id))
    .orderBy(desc(licenses.createdAt));
}

export async function checkOrganizationLicense(organizationId: string) {
  const [license] = await db.select().from(licenses).where(and(eq(licenses.organizationId, organizationId), eq(licenses.isActive, true))).limit(1);
  if (!license) return { valid: false, message: "Aucune licence active trouvée." };
  if (license.expiresAt && new Date(license.expiresAt) < new Date()) return { valid: false, message: "Votre licence a expiré." };
  return { valid: true, license };
}

export async function activateUserLicenseAction(formData: FormData, organizationId: string) {
  const keyToActivate = String(formData.get("licenseKey") ?? "").trim();
  if (!keyToActivate) return { error: "Veuillez entrer une clé de licence valide." };

  const [existingLicense] = await db.select().from(licenses).where(eq(licenses.licenseKey, keyToActivate)).limit(1);
  if (!existingLicense) return { error: "Cette clé de licence n'existe pas." };
  if (!existingLicense.isActive) return { error: "Cette licence n’est pas active." };
  if (existingLicense.expiresAt && existingLicense.expiresAt < new Date()) return { error: "Cette licence a expiré." };
  if (existingLicense.organizationId && existingLicense.organizationId !== organizationId) return { error: "Cette clé est déjà utilisée par une autre organisation." };

  const durationDays = existingLicense.planType === "annuel" ? 365 : 30;
  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + durationDays);
  await db.update(licenses).set({ organizationId, isActive: true, activatedAt: new Date(), expiresAt: newExpiresAt }).where(eq(licenses.id, existingLicense.id));
  revalidatePath("/parametres");
  return { success: "Licence activée avec succès !" };
}
