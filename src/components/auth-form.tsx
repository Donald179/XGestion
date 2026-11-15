"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { useToast } from "@/components/client";
import { LanguageToggle, translateText, useLanguage } from "@/components/language";

type State = { ok?: boolean; error?: string; message?: string; redirect?: string; token?: number } | null;
type F = { name: string; label: string; type?: string; required?: boolean; defaultValue?: string; placeholder?: string };

export function AuthForm({ action, fields, submit, hidden, links }: {
  action: (p: State, fd: FormData) => Promise<State>; fields: F[]; submit: string; hidden?: Record<string, string>; links?: { href: string; label: string }[];
}) {
  const { language } = useLanguage();
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
          <label htmlFor={f.name} className="label">{translateText(f.label, language)}</label>
          <input id={f.name} name={f.name} type={f.type ?? "text"} required={f.required ?? true} defaultValue={f.defaultValue} placeholder={f.placeholder} className="input" autoComplete={f.type == "email" ? "email" : f.type == "password" ? "current-password" : f.type == "tel" ? "tel" : "on"} />
        </div>
      ))}
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && !state.redirect && state.message && <p className="break-all rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message.includes("/reset-password") ? <>Lien de réinitialisation généré.</> : state.message}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full py-2.5">{pending && <Loader2 className="h-4 w-4 animate-spin" />} {translateText(submit, language)}</button>
      {links && <div className="flex flex-wrap justify-between gap-2 text-sm">{links.map((l) => <Link key={l.href} href={l.href} className="text-brand-600 hover:underline">{translateText(l.label, language)}</Link>)}</div>}
    </form>
  );
}

export function AuthCard({ title, subtitle, variant = "default", children }: {
  title: string;
  subtitle?: string;
  variant?: "login" | "register" | "default";
  children: React.ReactNode;
}) {
  const { language } = useLanguage();
  const isEnglish = language === "en";
  const brandTitle = variant === "register"
    ? (isEnglish ? "Your business, all in one place." : "Votre activité, tout au même endroit.")
    : (isEnglish ? "Manage your business with confidence." : "Gérez votre activité en toute confiance.");
  const brandDescription = variant === "register"
    ? (isEnglish
      ? "Create your account and get an all-in-one application to manage your business."
      : "Créez votre compte pour bénéficier d’une application tout-en-un pour gérer votre activité.")
    : (isEnglish
      ? "The all-in-one solution to run your business simply and efficiently."
      : "La solution tout-en-un pour piloter votre entreprise, simplement et efficacement.");
  const features = isEnglish
    ? ["Customers and sales management", "Quotes, invoices and payments", "Inventory and suppliers", "Dashboards and reports"]
    : ["Gestion des clients et des ventes", "Devis, factures et paiements", "Stocks et fournisseurs", "Tableaux de bord et rapports"];

  return (
    <main className="grid min-h-screen bg-white md:grid-cols-2">
      <section className="relative flex min-h-[36vh] flex-col justify-between overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 px-7 py-8 text-white sm:px-10 md:min-h-screen md:px-12 md:py-12 lg:px-16">
        <div className="pointer-events-none absolute -right-28 -top-32 h-96 w-96 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -bottom-48 -left-36 h-96 w-96 rounded-full border border-white/10" />
        <div className="relative">
          <a href="/" className="inline-flex items-center gap-3" aria-label="XGestion - accueil">
            <img src="/brand/logo.svg" alt="Logo XGestion" className="h-11 w-11 rounded-xl bg-white object-contain p-1 shadow-lg" />
            <span className="text-lg font-bold tracking-tight">XGestion</span>
          </a>
          <div className="mt-9 max-w-lg md:mt-24">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">
              {isEnglish ? "One platform, more control" : "Une plateforme, plus de maîtrise"}
            </p>
            <h2 className="text-2xl font-bold leading-tight sm:text-3xl lg:text-4xl">{brandTitle}</h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-blue-100 sm:text-base">{brandDescription}</p>
            <ul className="mt-7 grid gap-3 text-sm text-blue-50 sm:grid-cols-2 md:grid-cols-1">
              {features.map((feature) => (
                <li key={feature} className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15"><Check className="h-3 w-3" /></span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="relative mt-8 hidden text-xs text-blue-200 md:block">
          {isEnglish ? "Everything you need to keep your business moving." : "Tout ce qu’il faut pour faire avancer votre activité."}
        </p>
      </section>
      <section className="relative flex min-h-[64vh] items-center justify-center px-6 py-12 sm:px-10 md:min-h-screen md:px-12">
        <div className="absolute right-6 top-6 sm:right-8 sm:top-8"><LanguageToggle /></div>
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{translateText(title, language)}</h1>
            {subtitle && <p className="mt-2 text-sm leading-6 text-slate-500">{translateText(subtitle, language)}</p>}
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
