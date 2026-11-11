import { redirect } from "next/navigation";
import { AuthCard, AuthForm } from "@/components/auth-form";
import { createOrgAction } from "@/app/actions/auth";
import { loadCtx } from "@/lib/auth";

export const metadata = { title: "Créer mon entreprise" };

export default async function OnboardingPage() {
  const r = await loadCtx();
  if (!r) redirect("/login");
  return (
    <AuthCard title="Créer votre entreprise" subtitle="Vous en serez le propriétaire. Devise par défaut : FCFA (XOF), fuseau Africa/Ouagadougou.">
      <AuthForm
        action={createOrgAction}
        submit="Créer mon espace"
        fields={[
          { name: "name", label: "Nom de l'entreprise" },
          { name: "email", label: "Email professionnel", type: "email", required: false },
          { name: "phone", label: "Téléphone", type: "tel", required: false },
          { name: "address", label: "Adresse", required: false },
          { name: "currency", label: "Code devise (ISO)", defaultValue: "XOF" },
          { name: "currencyLabel", label: "Symbole affiché", defaultValue: "FCFA" },
        ]}
        links={r.ctx ? [{ href: "/dashboard", label: "← Retour" }] : undefined}
      />
    </AuthCard>
  );
}
