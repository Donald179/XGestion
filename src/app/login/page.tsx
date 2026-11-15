import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { PremiumAuthLayout } from "@/components/premium-auth-layout";
import { loginAction } from "@/app/actions/auth";
import { loadCtx } from "@/lib/auth";

export const metadata = { title: "Connexion" };

export default async function LoginPage() {
  if (await loadCtx()) redirect("/dashboard");
  return (
    <PremiumAuthLayout title="Connexion" subtitle="Accédez à votre espace de gestion." variant="login">
      <AuthForm
        action={loginAction}
        submit="Se connecter"
        fields={[
          { name: "email", label: "Adresse email", type: "email", placeholder: "nom@entreprise.com" },
          { name: "password", label: "Mot de passe", type: "password", placeholder: "Saisissez votre mot de passe" },
        ]}
        links={[
          { href: "/forgot-password", label: "Mot de passe oublié ?" },
          { href: "/register", label: "Créer un compte" },
        ]}
      />
    </PremiumAuthLayout>
  );
}
