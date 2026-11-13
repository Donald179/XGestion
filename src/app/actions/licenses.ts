"use server";

import { db } from "@/db";
import { licenses } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function activateUserLicenseAction(formData: FormData, organizationId: string) {
  const keyToActivate = (formData.get("licenseKey") as string)?.trim();

  if (!keyToActivate) {
    return { error: "Veuillez entrer une clé de licence valide." };
  }

  // 1. Chercher si la clé existe et n'est pas déjà assignée à une autre organisation (ou si elle est libre)
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

  // 2. Calculer la nouvelle date d'expiration (ex: +30 jours ou +1 an selon le planType)
  const durationDays = existingLicense.planType === "annuel" ? 365 : 30;
  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + durationDays);

  // 3. Mettre à jour la licence pour l'associer à l'organisation active
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
