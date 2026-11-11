"use client";

import { createContext, useActionState, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Info, Loader2, Search, X } from "lucide-react";

type ActionState = { ok?: boolean; error?: string; message?: string; redirect?: string; token?: number } | null;
type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/* ───────── Toasts ───────── */
type Toast = { id: number; msg: string; kind: "success" | "error" | "info" };
const ToastCtx = createContext<(msg: string, kind?: Toast["kind"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: Toast["kind"] = "success") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} role="status" className={`pointer-events-auto flex items-start gap-2 rounded-lg border bg-white p-3 text-sm shadow-lg ${t.kind === "error" ? "border-red-200" : t.kind === "info" ? "border-blue-200" : "border-emerald-200"}`}>
            {t.kind === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /> : t.kind === "info" ? <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
            <span className="text-slate-800">{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ───────── Modal ───────── */
export function Modal({ title, description, onClose, children, wide }: { title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}>
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Fermer" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ───────── Formulaire générique en modale ───────── */
export type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "email" | "tel" | "date" | "textarea" | "select" | "checkbox" | "password" | "file";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  step?: string;
  min?: string;
  defaultValue?: string | number | boolean | null;
  full?: boolean;
  hint?: string;
};

function FileInput({ name, label, current }: { name: string; label: string; current?: string | null }) {
  const [val, setVal] = useState<string>(current ?? "");
  const [err, setErr] = useState("");
  return (
    <div>
      <input type="hidden" name={name} value={val} />
      <input
        type="file"
        accept="image/*,application/pdf"
        aria-label={label}
        className="input file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-2 file:py-1 file:text-xs file:font-medium file:text-brand-700"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 600 * 1024) { setErr("Fichier trop volumineux (max 600 Ko)."); e.target.value = ""; return; }
          setErr("");
          const r = new FileReader();
          r.onload = () => setVal(String(r.result));
          r.readAsDataURL(f);
        }}
      />
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
      {val && !err && <p className="mt-1 text-xs text-emerald-700">Fichier prêt. <button type="button" className="underline" onClick={() => setVal("")}>Retirer</button></p>}
    </div>
  );
}

function FormInner({ fields, action, hidden, submitLabel, onDone, danger }: { fields: Field[]; action: ServerAction; hidden?: Record<string, string>; submitLabel: string; onDone: () => void; danger?: boolean }) {
  const [state, formAction, pending] = useActionState(action, null);
  const toast = useToast();
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      toast(state.message ?? "Enregistré avec succès");
      onDone();
      if (state.redirect) router.push(state.redirect);
      else router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {fields.map((f) => {
        const t = f.type ?? "text";
        const dv = f.defaultValue == null ? "" : String(f.defaultValue);
        const wide = f.full || t === "textarea";
        return (
          <div key={f.name} className={wide ? "sm:col-span-2" : ""}>
            {t === "checkbox" ? (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name={f.name} defaultChecked={!!f.defaultValue} className="h-4 w-4 rounded border-slate-300" /> {f.label}
              </label>
            ) : (
              <>
                <label className="label" htmlFor={`f-${f.name}`}>{f.label}{f.required && <span className="text-red-500"> *</span>}</label>
                {t === "textarea" ? (
                  <textarea id={`f-${f.name}`} name={f.name} rows={3} defaultValue={dv} required={f.required} placeholder={f.placeholder} className="input" />
                ) : t === "select" ? (
                  <select id={`f-${f.name}`} name={f.name} defaultValue={dv} required={f.required} className="input">
                    {!f.required && <option value="">—</option>}
                    {f.required && !dv && <option value="" disabled>Sélectionner…</option>}
                    {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : t === "file" ? (
                  <FileInput name={f.name} label={f.label} current={dv} />
                ) : (
                  <input id={`f-${f.name}`} name={f.name} type={t} defaultValue={dv} required={f.required} placeholder={f.placeholder} step={t === "number" ? (f.step ?? "any") : undefined} min={f.min} className="input" autoComplete={t === "password" ? "new-password" : undefined} />
                )}
                {f.hint && <p className="mt-1 text-xs text-slate-400">{f.hint}</p>}
              </>
            )}
          </div>
        );
      })}
      {state?.error && <p className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{state.error}</p>}
      <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
        <button type="button" onClick={onDone} className="btn-outline">Annuler</button>
        <button type="submit" disabled={pending} className={danger ? "btn-danger" : "btn-primary"}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} {submitLabel}
        </button>
      </div>
    </form>
  );
}

export function FormDialog({ title, description, trigger, triggerClass = "btn-primary", fields, action, hidden, submitLabel = "Enregistrer", danger }: {
  title: string; description?: string; trigger: ReactNode; triggerClass?: string; fields: Field[]; action: ServerAction; hidden?: Record<string, string>; submitLabel?: string; danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={triggerClass} onClick={() => setOpen(true)}>{trigger}</button>
      {open && (
        <Modal title={title} description={description} onClose={close}>
          <FormInner fields={fields} action={action} hidden={hidden} submitLabel={submitLabel} onDone={close} danger={danger} />
        </Modal>
      )}
    </>
  );
}

/* ───────── Bouton d'action avec confirmation ───────── */
export function ActionButton({ action, hidden, label, confirm, className = "btn-outline btn-sm", prompt }: {
  action: ServerAction; hidden?: Record<string, string>; label: ReactNode; confirm?: string; className?: string; prompt?: { name: string; message: string };
}) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData();
        Object.entries(hidden ?? {}).forEach(([k, v]) => fd.set(k, v));
        if (prompt) {
          const v = window.prompt(prompt.message);
          if (!v || !v.trim()) return;
          fd.set(prompt.name, v.trim());
        }
        start(async () => {
          const r = await action(null, fd);
          if (r?.error) toast(r.error, "error");
          else {
            toast(r?.message ?? "Opération effectuée");
            if (r?.redirect) router.push(r.redirect);
            else router.refresh();
          }
        });
      }}
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {label}
    </button>
  );
}

/* ───────── Recherche & filtres (URL) ───────── */
export function Filters({ selects = [], search = true, placeholder = "Rechercher…" }: { selects?: { name: string; label: string; options: { value: string; label: string }[] }[]; search?: boolean; placeholder?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const push = (name: string, value: string) => {
    const p = new URLSearchParams(sp.toString());
    if (value) p.set(name, value); else p.delete(name);
    p.delete("page");
    router.replace(`${path}?${p.toString()}`);
  };
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      {search && (
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={q}
            placeholder={placeholder}
            aria-label="Rechercher"
            className="input pl-9"
            onChange={(e) => {
              setQ(e.target.value);
              clearTimeout(timer.current);
              const v = e.target.value;
              timer.current = setTimeout(() => push("q", v), 350);
            }}
          />
        </div>
      )}
      {selects.map((s) => (
        <select key={s.name} aria-label={s.label} value={sp.get(s.name) ?? ""} onChange={(e) => push(s.name, e.target.value)} className="input w-auto">
          <option value="">{s.label}</option>
          {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
    </div>
  );
}

/* ───────── Sélecteur de période ───────── */
export function PeriodPicker({ periods, current, from, to }: { periods: { key: string; label: string }[]; current: string; from: string; to: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const go = (p: Record<string, string>) => {
    const n = new URLSearchParams(sp.toString());
    n.delete("page");
    Object.entries(p).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k)));
    router.replace(`${path}?${n.toString()}`);
  };
  return (
    <div className="no-print flex flex-wrap items-end gap-2">
      <select aria-label="Période" value={current} onChange={(e) => go({ p: e.target.value })} className="input w-auto">
        {periods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      {current === "custom" && (
        <>
          <input type="date" aria-label="Du" defaultValue={from} onChange={(e) => go({ p: "custom", from: e.target.value, to })} className="input w-auto" />
          <input type="date" aria-label="Au" defaultValue={to} onChange={(e) => go({ p: "custom", from, to: e.target.value })} className="input w-auto" />
        </>
      )}
    </div>
  );
}

export function PrintButton({ label = "Imprimer / PDF" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className="btn-outline no-print">{label}</button>;
}
