import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { PremiumAuthLayout } from "@/components/premium-auth-layout";
import { registerAction } from "@/app/actions/auth";
import { loadCtx } from "@/lib/auth";

export const metadata = { title: "Inscription" };

export default async function RegisterPage() {
  if (await loadCtx()) redirect("/dashboard");
  return (
    <PremiumAuthLayout title="Créer votre compte" subtitle="Créez vos accès pour commencer à gérer votre activité." variant="register">
      <AuthForm
        action={registerAction}
        submit="Créer mon compte"
        fields={[
          { name: "fullName", label: "Nom complet", placeholder: "Votre nom" },
          { name: "email", label: "Adresse email", type: "email", placeholder: "nom@entreprise.com" },
          { name: "password", label: "Mot de passe (8 caractères min.)", type: "password", placeholder: "Au moins 8 caractères" },
          { name: "confirm", label: "Confirmer le mot de passe", type: "password", placeholder: "Répétez votre mot de passe" },
        ]}
        links={[{ href: "/login", label: "J'ai déjà un compte" }]}
      />
    </PremiumAuthLayout>
  );
}
