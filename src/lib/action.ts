import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { UserError } from "@/lib/auth";

export type ActionState = { ok?: boolean; error?: string; message?: string; redirect?: string; token?: number } | null;
type Result = string | { message?: string; redirect?: string } | void;

/** Exécute une action et convertit les erreurs en messages utilisateur français. */
export async function run(fn: () => Promise<Result>): Promise<ActionState> {
  try {
    const r = await fn();
    if (typeof r === "string") return { ok: true, message: r, token: Date.now() };
    return { ok: true, message: r?.message, redirect: r?.redirect, token: Date.now() };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof UserError) return { error: e.message, token: Date.now() };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Données invalides", token: Date.now() };
    const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") return { error: "Cette valeur existe déjà (doublon).", token: Date.now() };
    if (code === "23503") return { error: "Opération impossible : des éléments liés existent.", token: Date.now() };
    console.error(e);
    return { error: "Une erreur est survenue. Veuillez réessayer.", token: Date.now() };
  }
}

export const str = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();
export const optStr = (fd: FormData, k: string): string | null => str(fd, k) || null;
export const numOf = (fd: FormData, k: string): number => {
  const n = Number(String(fd.get(k) ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
export const bool = (fd: FormData, k: string): boolean => fd.get(k) === "on" || fd.get(k) === "true";
