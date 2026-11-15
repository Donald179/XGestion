"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, Check, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { LanguageToggle, useLanguage } from "@/components/language";

 type Props = {
  title: string;
  subtitle?: string;
  variant?: "login" | "register" | "default";
  children: ReactNode;
};

export function PremiumAuthLayout({ title, subtitle, variant = "default", children }: Props) {
  const { language } = useLanguage();
  const en = language === "en";
  const isRegister = variant === "register";
  const benefits = en ? ["Customers, sales and services", "Quotes, invoices and payments", "Inventory and business reports"] : ["Clients, ventes et prestations", "Devis, factures et paiements", "Stocks et rapports d’activité"];

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-900 lg:grid lg:grid-cols-[minmax(420px,0.92fr)_1.08fr]">
      <aside className="relative hidden min-h-screen overflow-hidden bg-[#101b36] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-16">
        <div className="pointer-events-none absolute -right-36 -top-32 h-[32rem] w-[32rem] rounded-full border border-white/[0.07]" />
        <div className="pointer-events-none absolute -right-20 -top-16 h-[24rem] w-[24rem] rounded-full border border-white/[0.07]" />
        <div className="pointer-events-none absolute -bottom-48 -left-36 h-[34rem] w-[34rem] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative z-10">
          <a href="/" className="inline-flex items-center gap-3" aria-label="XGestion - accueil">
            {/* eslint-disable-next-line @next/next/no-img-element */}<img src="/brand/logo.svg" alt="" className="h-12 w-12 rounded-xl bg-white object-contain" />
            <span className="text-xl font-bold tracking-tight">XGestion</span>
          </a>
          <div className="mt-24 max-w-xl xl:mt-32">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-2 text-xs font-medium text-blue-100"><Sparkles className="h-3.5 w-3.5 text-[#b9f36b]" />{en ? "Your business, in control" : "Votre activité, sous contrôle"}</span>
            <h1 className="mt-7 text-4xl font-semibold leading-[1.12] tracking-tight xl:text-[3.25rem]">{isRegister ? (en ? "A clearer view of your business starts here." : "Une vision plus claire de votre activité commence ici.") : (en ? "Everything you need to run your business." : "Tout ce qu’il faut pour piloter votre activité.")}</h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">{en ? "Bring your customers, sales, services and inventory together in one simple workspace." : "Réunissez vos clients, ventes, prestations et stocks dans un espace simple et centralisé."}</p>
            <div className="mt-9 grid gap-3">{benefits.map((benefit) => <div key={benefit} className="flex items-center gap-3 text-sm text-slate-200"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#b9f36b]/15 text-[#b9f36b]"><Check className="h-3.5 w-3.5" /></span>{benefit}</div>)}</div>
          </div>
        </div>
        <div className="relative z-10 mt-12 max-w-lg rounded-2xl border border-white/10 bg-white/[0.07] p-5 shadow-2xl shadow-black/10 backdrop-blur-sm">
          <div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-300">{en ? "A workspace that works for you" : "Un espace pensé pour vous"}</p><p className="mt-2 text-lg font-semibold">{en ? "Your business, at a glance" : "Votre activité en un coup d’œil"}</p></div><span className="rounded-xl bg-[#b9f36b]/15 p-2.5 text-[#b9f36b]"><TrendingUp className="h-5 w-5" /></span></div>
          <div className="mt-5 flex h-20 items-end gap-2" aria-hidden="true">{[34, 48, 41, 65, 53, 78, 60, 92, 72, 100, 82, 116].map((height, index) => <span key={index} className="flex-1 rounded-t-md bg-gradient-to-t from-blue-400/40 to-[#b9f36b]" style={{ height: `${height / 1.4}%` }} />)}</div>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-300"><span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#b9f36b]" />{en ? "Your data stays protected" : "Vos données restent protégées"}</span><ArrowUpRight className="h-4 w-4" /></div>
        </div>
        <p className="relative z-10 mt-8 text-xs text-slate-400">© {new Date().getFullYear()} XGestion. {en ? "All rights reserved." : "Tous droits réservés."}</p>
      </aside>
      <section className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12 xl:px-16">
        <div className="absolute right-5 top-5 z-20 sm:right-8 sm:top-8"><LanguageToggle /></div>
        <div className="w-full max-w-[460px] pt-12 sm:pt-8">
          <a href="/" className="mb-8 inline-flex items-center gap-2.5 lg:hidden" aria-label="XGestion - accueil">
            {/* eslint-disable-next-line @next/next/no-img-element */}<img src="/brand/logo.svg" alt="" className="h-10 w-10 rounded-xl object-contain" />
            <span className="font-bold tracking-tight">XGestion</span>
          </a>
          <div className="mb-7"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">{en ? "Welcome to XGestion" : "Bienvenue sur XGestion"}</p><h2 className="text-3xl font-semibold tracking-tight text-slate-950">{title}</h2>{subtitle && <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>}</div>
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_24px_70px_-35px_rgba(15,23,42,0.28)] sm:p-8"><div className="[&_form]:space-y-5 [&_form>div>label]:mb-2 [&_form>div>label]:block [&_form>div>label]:text-sm [&_form>div>label]:font-medium [&_form>div>label]:text-slate-700">{children}</div></div>
          <p className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400"><ShieldCheck className="h-4 w-4" />{en ? "A secure space for your business" : "Un espace sécurisé pour votre entreprise"}</p>
        </div>
      </section>
    </main>
  );
}
