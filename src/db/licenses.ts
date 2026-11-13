"use server";

import { db } from "@/db";
import { licenses, organizations } from "@/db/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

// Générateur de clé unique
function generateKey(): string {
  const p1 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const p2 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const p3 = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `XGEST-${p1}-${p2}-${p3}`;
}

// Action pour créer une nouvelle licence
export async function createLicenseAction(formData: FormData) {
  const planType = (formData.get("planType") as string) || "mensuel";
  const maxUsers = parseInt(formData.get("maxUsers") as string) || 3;
  
  const newKey = generateKey();

  await db.insert(licenses).values({
    licenseKey: newKey,
    planType,
    maxUsers,
    isActive: true,
  });

  revalidatePath("/admin/licenses");
}

// Récupérer toutes les licences avec les infos des organisations
export async function getLicensesWithOrgs() {
  const list = await db
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

  return list;
}

// Vérifier la validité de la licence d'une organisation
export async function checkOrganizationLicense(organizationId: string) {
  const [license] = await db
    .select()
    .from(licenses)
    .where(
      and(
        eq(licenses.organizationId, organizationId),
        eq(licenses.isActive, true)
      )
    )
    .limit(1);

  if (!license) {
    return { valid: false, message: "Aucune licence active trouvée." };
  }

  if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
    return { valid: false, message: "Votre licence a expiré." };
  }

  return { valid: true, license };
}

// Action pour activer une clé saisie par un client
export async function activateUserLicenseAction(formData: FormData, organizationId: string) {
  const keyToActivate = (formData.get("licenseKey") as string)?.trim();

  if (!keyToActivate) {
    return { error: "Veuillez entrer une clé de licence valide." };
  }

  const [existingLicense] = await db
    .select()
    .from(licenses)
    .where(eq(licenses.licenseKey, keyToActivate))
    .limit(1);

  if (!existingLicense) {
    return { error: "Cette clé de licence n'existe pas." };
  }

  if (existingLicense.organizationId && existingLicense.organizationId !== organizationId) {
    return { error: "Cette clé est déjà utilisée par une autre organisation." };
  }

  const durationDays = existingLicense.planType === "annuel" ? 365 : 30;
  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + durationDays);

  await db
    .update(licenses)
    .set({
      organizationId: organizationId,
      isActive: true,
      activatedAt: new Date(),
      expiresAt: newExpiresAt,
    })
    .where(eq(licenses.id, existingLicense.id));

  revalidatePath("/parametres");
  return { success: "Licence activée avec succès !" };
}
