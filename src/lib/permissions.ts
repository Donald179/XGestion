import type { Role } from "@/db/schema";

export const ROLES: Role[] = ["proprietaire", "administrateur", "gestionnaire", "caissier", "technicien"];

export const ROLE_LABELS: Record<Role, string> = {
  proprietaire: "Propriétaire",
  administrateur: "Administrateur",
  gestionnaire: "Gestionnaire",
  caissier: "Caissier",
  technicien: "Technicien / Employé",
};

const MANAGER = [
  "dashboard.view",
  "customers.view", "customers.manage",
  "orders.view", "orders.manage",
  "catalog.manage",
  "products.view", "products.manage",
  "stock.view", "stock.manage",
  "sales.view", "sales.create", "sales.cancel", "sales.discount",
  "quotes.view", "quotes.manage",
  "invoices.view", "invoices.manage",
  "payments.create",
  "finance.view", "expenses.manage",
  "suppliers.view", "suppliers.manage",
  "reports.view",
  "notifications.view",
];

/** Matrice rôle → permissions (source de vérité, appliquée côté serveur). */
const MATRIX: Record<Role, string[] | "*"> = {
  proprietaire: "*",
  administrateur: [...MANAGER, "users.manage", "settings.manage"],
  gestionnaire: MANAGER,
  caissier: [
    "customers.view", "customers.manage",
    "products.view", "stock.view",
    "sales.view", "sales.create",
    "invoices.view", "payments.create",
    "notifications.view",
  ],
  technicien: ["orders.view", "orders.own", "customers.view", "notifications.view"],
};

export function can(role: Role | undefined, perm: string): boolean {
  if (!role) return false;
  const m = MATRIX[role];
  return m === "*" ? true : m.includes(perm);
}

export const NAV = [
  { href: "/dashboard", label: "Tableau de bord", icon: "LayoutDashboard", perm: "dashboard.view" },
  { href: "/clients", label: "Clients", icon: "Users", perm: "customers.view" },
  { href: "/prestations", label: "Prestations", icon: "Wrench", perm: "orders.view" },
  { href: "/produits", label: "Produits", icon: "Package", perm: "products.view" },
  { href: "/stocks", label: "Stocks", icon: "Boxes", perm: "stock.view" },
  { href: "/ventes", label: "Ventes", icon: "ShoppingCart", perm: "sales.view" },
  { href: "/devis", label: "Devis", icon: "FileText", perm: "quotes.view" },
  { href: "/factures", label: "Factures", icon: "Receipt", perm: "invoices.view" },
  { href: "/finances", label: "Finances", icon: "Wallet", perm: "finance.view" },
  { href: "/fournisseurs", label: "Fournisseurs", icon: "Truck", perm: "suppliers.view" },
  { href: "/rapports", label: "Rapports", icon: "BarChart3", perm: "reports.view" },
  { href: "/notifications", label: "Notifications", icon: "Bell", perm: "notifications.view" },
  { href: "/utilisateurs", label: "Utilisateurs", icon: "UserCog", perm: "users.manage" },
  { href: "/parametres", label: "Paramètres", icon: "Settings", perm: "settings.manage" },
] as const;

export function homeFor(role: Role): string {
  if (role === "technicien") return "/prestations";
  return NAV.find((n) => can(role, n.perm))?.href ?? "/notifications";
}
