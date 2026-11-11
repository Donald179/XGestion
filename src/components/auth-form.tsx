"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/client";

type State = { ok?: boolean; error?: string; message?: string; redirect?: string; token?: number } | null;
type F = { name: string; label: string; type?: string; required?: boolean; defaultValue?: string; placeholder?: string };

export function AuthForm({ action, fields, submit, hidden, links }: {
  action: (p: State, fd: FormData) => Promise<State>; fields: F[]; submit: string; hidden?: Record<string, string>; links?: { href: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();
  const toast = useToast();
  useEffect(() => {
    if (state?.ok && state.redirect) {
      toast(state.message ?? "Succès");
      router.push(state.redirect);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={formAction} className="space-y-4">
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className="label">{f.label}</label>
          <input id={f.name} name={f.name} type={f.type ?? "text"} required={f.required ?? true} defaultValue={f.defaultValue} placeholder={f.placeholder} className="input" autoComplete={f.type === "password" ? "current-password" : f.type === "email" ? "email" : "off"} />
        </div>
      ))}
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && !state.redirect && state.message && <p className="break-all rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message.includes("/reset-password") ? <>Lien de réinitialisation (mode démo, aucun email n&apos;est envoyé) : <Link className="font-semibold underline" href={state.message.slice(state.message.indexOf("/reset-password"))}>ouvrir le lien</Link></> : state.message}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full py-2.5">{pending && <Loader2 className="h-4 w-4 animate-spin" />} {submit}</button>
      {links && <div className="flex flex-wrap justify-between gap-2 text-sm">{links.map((l) => <Link key={l.href} href={l.href} className="text-brand-600 hover:underline">{l.label}</Link>)}</div>}
    </form>
  );
}

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">G</div>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
