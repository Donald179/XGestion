import { redirect } from "next/navigation";
import { AuthCard, AuthForm } from "@/components/auth-form";
import { loginAction } from "@/app/actions/auth";
import { loadCtx } from "@/lib/auth";

export const metadata = { title: "Connexion" };

export default async function LoginPage() {
  if (await loadCtx()) redirect("/dashboard");
  return (
    <AuthCard title="Connexion" subtitle="Accédez à votre espace de gestion">
      <AuthForm
        action={loginAction}
        submit="Se connecter"
        fields={[{ name: "email", label: "Adresse email", type: "email" }, { name: "password", label: "Mot de passe", type: "password" }]}
        links={[{ href: "/forgot-password", label: "Mot de passe oublié ?" }, { href: "/register", label: "Créer un compte" }]}
      />
    </AuthCard>
  );
}
