import { asc, eq } from "drizzle-orm";
import { Plus, UserCheck, UserX } from "lucide-react";
import { db } from "@/db";
import { organizationMembers, profiles } from "@/db/schema";
import { pageCtx } from "@/lib/auth";
import { ROLES, ROLE_LABELS } from "@/lib/permissions";
import { fmtDate } from "@/lib/format";
import { ActionButton, FormDialog } from "@/components/client";
import { Badge, Card, PageHeader } from "@/components/ui";
import { addMemberAction, changeRoleAction, toggleMemberAction } from "@/app/actions/ops";

export const metadata = { title: "Utilisateurs" };
const DESC: Record<string, string> = {
  proprietaire: "Accès total à l'entreprise, paramètres de stock négatif, nomination des propriétaires.",
  administrateur: "Opérations, utilisateurs et paramètres (hors rôle de propriétaire).",
  gestionnaire: "Gestion commerciale : clients, prestations, produits, stocks, ventes, factures, finances, achats, rapports.",
  caissier: "Ventes, encaissements, clients ; lecture des produits et factures. Pas de remise.",
  technicien: "Consultation et mise à jour des prestations qui lui sont attribuées.",
};

export default async function UsersPage() {
  const ctx = await pageCtx("users.manage");
  const members = await db
    .select({ m: organizationMembers, name: profiles.fullName, email: profiles.email })
    .from(organizationMembers).innerJoin(profiles, eq(profiles.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, ctx.org.id)).orderBy(asc(profiles.fullName));
  const roleOpts = ROLES.filter((r) => r !== "proprietaire" || ctx.role === "proprietaire").map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  return (
    <>
      <PageHeader title="Utilisateurs" subtitle="Membres de l'entreprise et permissions par rôle">
        <FormDialog title="Ajouter un utilisateur" description="Si l'email existe déjà, le compte est simplement rattaché à l'entreprise. Sinon, un compte est créé avec le mot de passe temporaire." trigger={<><Plus className="h-4 w-4" /> Ajouter</>}
          fields={[
            { name: "email", label: "Email", type: "email", required: true, full: true },
            { name: "fullName", label: "Nom complet (nouveau compte)" },
            { name: "password", label: "Mot de passe temporaire", type: "password", hint: "8 caractères min. (nouveau compte)" },
            { name: "role", label: "Rôle", type: "select", required: true, defaultValue: "caissier", options: roleOpts },
          ]} action={addMemberAction} />
      </PageHeader>
      <Card>
        <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Utilisateur</th><th>Email</th><th>Rôle</th><th>Depuis</th><th>Statut</th><th /></tr></thead><tbody>
          {members.map(({ m, name, email }) => {
            const self = m.userId === ctx.user.id;
            const locked = self || (m.role === "proprietaire" && ctx.role !== "proprietaire");
            return (
              <tr key={m.id}><td className="font-medium">{name} {self && <Badge tone="blue">Vous</Badge>}</td><td>{email}</td><td><Badge tone={m.role === "proprietaire" ? "violet" : "gray"}>{ROLE_LABELS[m.role]}</Badge></td><td>{fmtDate(m.createdAt, ctx.settings.timezone)}</td>
                <td>{m.active ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Désactivé</Badge>}</td>
                <td><div className="flex justify-end gap-2">
                  {!locked && <FormDialog title={`Rôle de ${name}`} triggerClass="btn-outline btn-sm" trigger="Changer le rôle" fields={[{ name: "role", label: "Rôle", type: "select", required: true, defaultValue: m.role, options: roleOpts, full: true }]} hidden={{ id: m.id }} action={changeRoleAction} />}
                  {!locked && <ActionButton action={toggleMemberAction} hidden={{ id: m.id, active: m.active ? "0" : "1" }} confirm={m.active ? `Désactiver ${name} ? Il n'aura plus accès à l'entreprise.` : undefined} label={m.active ? <><UserX className="h-3.5 w-3.5" /> Désactiver</> : <><UserCheck className="h-3.5 w-3.5" /> Réactiver</>} />}
                </div></td></tr>
            );
          })}</tbody></table></div>
      </Card>
      <Card title="Rôles et permissions" className="mt-4">
        <dl className="divide-y divide-slate-100 text-sm">{ROLES.map((r) => <div key={r} className="grid gap-1 px-4 py-3 sm:grid-cols-4"><dt className="font-semibold">{ROLE_LABELS[r]}</dt><dd className="text-slate-600 sm:col-span-3">{DESC[r]}</dd></div>)}</dl>
      </Card>
    </>
  );
}
