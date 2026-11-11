"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BarChart3, Bell, Boxes, ChevronDown, FileText, LayoutDashboard, LogOut, Menu, Package, Receipt, Settings, ShoppingCart, Truck, UserCog, Users, Wallet, Wrench, X } from "lucide-react";

const ICONS = { LayoutDashboard, Users, Wrench, Package, Boxes, ShoppingCart, FileText, Receipt, Wallet, Truck, BarChart3, Bell, UserCog, Settings } as const;
type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

export function AppShell({
  nav, orgName, orgs, activeOrg, userName, roleLabel, unread, logo, switchOrg, logout, children,
}: {
  nav: NavItem[]; orgName: string; orgs: { id: string; name: string }[]; activeOrg: string; userName: string; roleLabel: string; unread: number; logo: string | null;
  switchOrg: (fd: FormData) => Promise<void>; logout: () => Promise<void>; children: ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const sidebar = (
    <nav className="flex h-full flex-col bg-navy-900 text-slate-300">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-4">
        {logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logo} alt="" className="h-9 w-9 rounded-lg bg-white object-contain" /> : <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">{orgName.slice(0, 1).toUpperCase()}</div>}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{orgName}</p>
          <p className="text-[11px] text-slate-400">GestionPro</p>
        </div>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {nav.map((n) => {
          const Icon = ICONS[n.icon];
          const active = path === n.href || path.startsWith(n.href + "/");
          return (
            <li key={n.href}>
              <Link href={n.href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-brand-600 text-white shadow" : "hover:bg-white/10 hover:text-white"}`}>
                <Icon className="h-[18px] w-[18px]" /> {n.label}
                {n.icon === "Bell" && unread > 0 && <span className="ml-auto rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
  return (
    <div className="app-shell flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 lg:block">{sidebar}</aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 shadow-2xl">
            <button className="absolute right-2 top-3 z-10 text-white" onClick={() => setOpen(false)} aria-label="Fermer le menu"><X className="h-5 w-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur">
          <button className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Ouvrir le menu"><Menu className="h-5 w-5" /></button>
          {orgs.length > 1 ? (
            <form action={switchOrg}>
              <select name="org" defaultValue={activeOrg} onChange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Entreprise" className="input w-auto max-w-[200px] py-1.5">
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </form>
          ) : <span className="hidden text-sm font-semibold text-slate-700 sm:block">{orgName}</span>}
          <div className="ml-auto flex items-center gap-2">
            <Link href="/notifications" aria-label="Notifications" className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100">
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            <div className="relative">
              <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{userName.slice(0, 1).toUpperCase()}</span>
                <span className="hidden text-left sm:block"><span className="block text-sm font-medium leading-4 text-slate-800">{userName}</span><span className="text-[11px] text-slate-500">{roleLabel}</span></span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {menu && (
                <div className="absolute right-0 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg" onMouseLeave={() => setMenu(false)}>
                  <form action={logout}>
                    <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"><LogOut className="h-4 w-4" /> Se déconnecter</button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
