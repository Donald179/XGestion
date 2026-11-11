import type { customers } from "@/db/schema";

export const customerFields = (c?: typeof customers.$inferSelect) => [
  { name: "name", label: "Nom complet / Raison sociale", required: true, defaultValue: c?.name, full: true },
  { name: "type", label: "Type de client", type: "select" as const, required: true, defaultValue: c?.type ?? "particulier", options: [{ value: "particulier", label: "Particulier" }, { value: "entreprise", label: "Entreprise" }] },
  { name: "phone", label: "Téléphone", type: "tel" as const, defaultValue: c?.phone },
  { name: "email", label: "Email", type: "email" as const, defaultValue: c?.email },
  { name: "address", label: "Adresse", defaultValue: c?.address },
  { name: "notes", label: "Notes", type: "textarea" as const, defaultValue: c?.notes },
];

