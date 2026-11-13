"use server";

import { db } from "@/db";
import { licenses, organizations } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
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
