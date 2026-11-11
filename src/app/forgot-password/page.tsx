import { AuthCard, AuthForm } from "@/components/auth-form";
import { forgotAction } from "@/app/actions/auth";

export const metadata = { title: "Mot de passe oublié" };

export default function ForgotPage() {
  return (
    <AuthCard title="Mot de passe oublié" subtitle="Saisissez votre email pour générer un lien de réinitialisation.">
      <AuthForm action={forgotAction} submit="Générer le lien" fields={[{ name: "email", label: "Adresse email", type: "email" }]} links={[{ href: "/login", label: "Retour à la connexion" }]} />
    </AuthCard>
  );
}
