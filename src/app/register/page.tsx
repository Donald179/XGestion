import { redirect } from "next/navigation";
import { AuthCard, AuthForm } from "@/components/auth-form";
import { registerAction } from "@/app/actions/auth";
import { loadCtx } from "@/lib/auth";

export const metadata = { title: "Inscription" };

export default async function RegisterPage() {
  if (await loadCtx()) redirect("/dashboard");
  return (
    <AuthCard title="Créer votre compte" subtitle="Étape 1/2 : vos identifiants. Vous créerez ensuite votre entreprise.">
      <AuthForm
        action={registerAction}
        submit="Créer mon compte"
        fields={[
          { name: "fullName", label: "Nom complet" },
          { name: "email", label: "Adresse email", type: "email" },
          { name: "password", label: "Mot de passe (8 caractères min.)", type: "password" },
          { name: "confirm", label: "Confirmer le mot de passe", type: "password" },
        ]}
        links={[{ href: "/login", label: "J'ai déjà un compte" }]}
      />
    </AuthCard>
  );
}
