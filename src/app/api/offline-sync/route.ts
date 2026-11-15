import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { actCtx } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CustomerDraft = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(200),
  type: z.enum(["particulier", "entreprise"]),
  phone: z.string().trim().max(80).nullable(),
  email: z.string().trim().max(320).nullable(),
  address: z.string().trim().max(1000).nullable(),
  notes: z.string().trim().max(4000).nullable(),
});

const noStore = { "Cache-Control": "no-store, max-age=0" };

/** Synchronise les brouillons de clients créés hors connexion.
 * L'ID UUID généré par le navigateur sert de clé d'idempotence : un nouvel essai
 * après une coupure réseau ne crée pas un deuxième client.
 */
export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await actCtx("customers.manage");
  } catch {
    return Response.json({ error: "Session expirée ou accès non autorisé." }, { status: 401, headers: noStore });
  }

  let raw: string;
  try {
    raw = await request.text();
    if (raw.length > 128_000) return Response.json({ error: "Lot trop volumineux." }, { status: 413, headers: noStore });
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400, headers: noStore });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "JSON invalide." }, { status: 400, headers: noStore });
  }

  const drafts = z.array(z.unknown()).min(1).max(50).safeParse((body as { customers?: unknown })?.customers);
  if (!drafts.success) return Response.json({ error: "La requête doit contenir de 1 à 50 clients." }, { status: 400, headers: noStore });

  const results: { id: string; synced: boolean; error?: string }[] = [];
  for (const draft of drafts.data) {
    const parsed = CustomerDraft.safeParse(draft);
    if (!parsed.success) {
      const id = typeof draft === "object" && draft !== null && "id" in draft && typeof draft.id === "string" ? draft.id : "invalide";
      results.push({ id, synced: false, error: "Informations client invalides. Corrigez la saisie puis réessayez." });
      continue;
    }

    const item = parsed.data;
    try {
      await db.insert(customers).values({ ...item, organizationId: ctx.org.id }).onConflictDoNothing({ target: customers.id });
      const [saved] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, item.id), eq(customers.organizationId, ctx.org.id))).limit(1);
      if (!saved) {
        results.push({ id: item.id, synced: false, error: "Impossible de confirmer l'enregistrement. Réessayez." });
        continue;
      }
      results.push({ id: item.id, synced: true });
    } catch (error) {
      console.error("offline customer sync", error);
      results.push({ id: item.id, synced: false, error: "Enregistrement impossible pour le moment. Réessayez." });
    }
  }

  return Response.json({ results }, { headers: noStore });
}
