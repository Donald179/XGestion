import { AuthCard, AuthForm } from "@/components/auth-form";
import { resetAction } from "@/app/actions/auth";

export const metadata = { title: "Réinitialiser le mot de passe" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Nouveau mot de passe">
      {token ? (
        <AuthForm
          action={resetAction}
          submit="Enregistrer"
          hidden={{ token }}
          fields={[{ name: "password", label: "Nouveau mot de passe", type: "password" }, { name: "confirm", label: "Confirmer", type: "password" }]}
        />
      ) : (
        <p className="text-center text-sm text-red-600">Lien invalide. Refaites une demande depuis « Mot de passe oublié ».</p>
      )}
    </AuthCard>
  );
}
