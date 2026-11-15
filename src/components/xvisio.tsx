"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, LoaderCircle, MessageCircle, Mic, MicOff, Send, Sparkles, Volume2, X } from "lucide-react";
import { z } from "zod";
import { createXvisioSaleAction } from "@/app/actions/ops";

type Message = { id: number; role: "user" | "assistant"; content: string; href?: string };
const saleDraftSchema = z.object({
  customer: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    productName: z.string(),
    sku: z.string(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().nonnegative(),
    stock: z.number().int(),
  })).min(1),
  subtotal: z.number().nonnegative(),
  taxAmount: z.number().nonnegative(),
  total: z.number().nonnegative(),
  paid: z.number().nonnegative(),
  method: z.enum(["especes", "mobile_money", "virement", "carte", "autre"]),
  currencyLabel: z.string(),
});
type SaleDraft = z.infer<typeof saleDraftSchema>;
type RecognitionResultEvent = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> };
type VoiceRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};
type VoiceWindow = Window & {
  SpeechRecognition?: new () => VoiceRecognition;
  webkitSpeechRecognition?: new () => VoiceRecognition;
};

const PAYMENT_METHODS = [
  ["especes", "Espèces"],
  ["mobile_money", "Mobile Money"],
  ["virement", "Virement bancaire"],
  ["carte", "Carte bancaire"],
  ["autre", "Autre"],
];

function money(value: number, currency: string) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

export function Xvisio() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<SaleDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState("especes");
  const recognition = useRef<VoiceRecognition | null>(null);
  const endOfMessages = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessages.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, draft, open]);

  useEffect(() => () => recognition.current?.abort(), []);

  function startVoiceInput() {
    const voiceWindow = window as VoiceWindow;
    const Recognition = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("La dictée vocale n'est pas disponible dans ce navigateur. Utilisez Chrome ou Edge, ou saisissez votre message.");
      return;
    }
    setError("");
    recognition.current?.abort();
    const instance = new Recognition();
    recognition.current = instance;
    instance.lang = "fr-FR";
    instance.interimResults = false;
    instance.maxAlternatives = 1;
    instance.onresult = (event) => {
      const transcript = event.results[event.resultIndex]?.[0]?.transcript;
      if (transcript) setInput((current) => current ? `${current} ${transcript}` : transcript);
    };
    instance.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") setError("La dictée vocale a échoué. Vérifiez l'autorisation du microphone.");
    };
    instance.onend = () => {
      setListening(false);
      recognition.current = null;
    };
    setListening(true);
    instance.start();
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || busy) return;
    const nextMessages = [...messages, { id: Date.now(), role: "user" as const, content }].slice(-16);
    setMessages(nextMessages);
    setInput("");
    setError("");
    setDraft(null);
    setBusy(true);
    try {
      const response = await fetch("/api/xvisio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.map(({ role, content: text }) => ({ role, content: text })) }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
          ? data.error
          : "Xvisio n'a pas pu répondre.";
        throw new Error(message);
      }
      if (typeof data !== "object" || data === null || !("message" in data) || typeof data.message !== "string") {
        throw new Error("Réponse invalide de Xvisio.");
      }
      setMessages((current) => [...current, { id: Date.now() + 1, role: "assistant", content: data.message }].slice(-16));
      if ("sale" in data && data.sale && typeof data.sale === "object") {
        const sale = saleDraftSchema.safeParse(data.sale);
        if (!sale.success) throw new Error("Le brouillon de vente reçu est invalide.");
        setDraft(sale.data);
        setPaid(String(sale.data.paid));
        setMethod(sale.data.method);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Xvisio n'a pas pu répondre. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSale() {
    if (!draft || confirming) return;
    setConfirming(true);
    setError("");
    try {
      if (paid.trim() === "") {
        setError("Indiquez le montant encaissé, ou saisissez 0 si la vente n'est pas payée.");
        return;
      }
      const paidAmount = Number(paid.replace(",", "."));
      if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > draft.total) {
        setError("Le montant encaissé doit être compris entre 0 et le total de la vente.");
        return;
      }
      const formData = new FormData();
      formData.set("payload", JSON.stringify({
        customerId: draft.customer?.id ?? null,
        lines: draft.lines.map(({ productId, quantity, unitPrice }) => ({ productId, quantity, unitPrice })),
        method,
        paid: paidAmount,
        expectedTotal: draft.total,
      }));
      const result = await createXvisioSaleAction(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setMessages((current) => [...current, {
        id: Date.now(),
        role: "assistant",
        content: result?.message ?? "Vente enregistrée.",
        href: result?.redirect,
      }].slice(-16));
      setDraft(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d'enregistrer la vente. Réessayez.");
    } finally {
      setConfirming(false);
    }
  }

  function speak(content: string) {
    if (!("speechSynthesis" in window)) {
      setError("La lecture vocale n'est pas disponible dans ce navigateur.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = "fr-FR";
    window.speechSynthesis.speak(utterance);
  }

  return (
    <>
      {open ? (
        <section
          role="dialog"
          aria-modal="false"
          aria-label="Discussion avec Xvisio"
          className="no-print fixed bottom-3 right-3 z-[80] flex h-[min(82vh,680px)] w-[calc(100%_-_1.5rem)] max-w-[420px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:bottom-5 sm:right-5"
        >
          <header className="flex items-center gap-3 bg-navy-900 px-4 py-3 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600"><Sparkles className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Xvisio</p>
              <p className="text-xs text-slate-300">Assistant de gestion</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer Xvisio" className="rounded-md p-2 text-slate-300 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
            {messages.length === 0 && (
              <div className="mt-8 px-3 text-center">
                <Bot className="mx-auto h-10 w-10 text-brand-600" />
                <p className="mt-3 text-sm font-semibold text-slate-800">Bonjour, je suis Xvisio.</p>
                <p className="mt-1 text-sm text-slate-600">Posez-moi une question sur votre entreprise ou dictez une vente à préparer.</p>
              </div>
            )}
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-5 ${message.role === "user" ? "rounded-br-sm bg-brand-600 text-white" : "rounded-bl-sm bg-white text-slate-800 shadow-sm ring-1 ring-slate-200"}`}>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.href && <Link href={message.href} className="mt-1 inline-block font-medium text-brand-600 underline">Voir la vente</Link>}
                  {message.role === "assistant" && (
                    <button type="button" onClick={() => speak(message.content)} aria-label="Lire la réponse à voix haute" title="Lire à voix haute" className="mt-1 block rounded p-1 text-slate-500 hover:bg-slate-100"><Volume2 className="h-4 w-4" /></button>
                  )}
                </div>
              </div>
            ))}

            {draft && (
              <div className="rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800">Vente à confirmer</h3>
                <p className="mt-1 text-xs text-slate-500">Aucune vente n&apos;est créée avant votre confirmation.</p>
                <p className="mt-2 text-sm text-slate-700">{draft.customer ? `Client : ${draft.customer.name}` : "Client de passage (comptoir)"}</p>
                <ul className="my-2 space-y-1 border-y border-slate-100 py-2 text-sm">
                  {draft.lines.map((line) => (
                    <li key={line.productId} className="flex justify-between gap-2 text-slate-700">
                      <span>{line.quantity} × {line.productName}<small className="block text-xs text-slate-500">Stock actuel : {line.stock}</small></span>
                      <span className="whitespace-nowrap">{money(line.quantity * line.unitPrice, draft.currencyLabel)}</span>
                    </li>
                  ))}
                </ul>
                <div className="space-y-1 text-sm text-slate-700">
                  <p className="flex justify-between"><span>Sous-total</span><span>{money(draft.subtotal, draft.currencyLabel)}</span></p>
                  {draft.taxAmount > 0 && <p className="flex justify-between"><span>Taxes</span><span>{money(draft.taxAmount, draft.currencyLabel)}</span></p>}
                  <p className="flex justify-between font-semibold text-slate-900"><span>Total</span><span>{money(draft.total, draft.currencyLabel)}</span></p>
                </div>
                <label className="label mt-3">Mode de paiement</label>
                <select value={method} onChange={(event) => setMethod(event.target.value)} className="input">
                  {PAYMENT_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <label className="label mt-3">Montant encaissé</label>
                <input type="number" min={0} max={draft.total} step="any" value={paid} onChange={(event) => setPaid(event.target.value)} className="input" />
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={confirming} onClick={() => { setDraft(null); setError(""); }} className="btn-outline flex-1">Annuler</button>
                  <button type="button" disabled={confirming || Number(paid) > draft.total} onClick={confirmSale} className="btn-primary flex-1">
                    {confirming && <LoaderCircle className="h-4 w-4 animate-spin" />} Confirmer la vente
                  </button>
                </div>
              </div>
            )}

            {busy && <div className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Xvisio réfléchit…</div>}
            <div ref={endOfMessages} />
          </div>

          <form onSubmit={sendMessage} className="border-t border-slate-200 bg-white p-3">
            {error && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            {listening && <p className="mb-2 text-xs font-medium text-brand-600">Écoute en cours… parlez maintenant.</p>}
            <div className="flex items-end gap-2">
              <textarea
                rows={1}
                maxLength={2_000}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Écrivez ou dictez un message…"
                aria-label="Votre message à Xvisio"
                className="input max-h-24 min-h-10 resize-y"
              />
              <button type="button" disabled={busy} onClick={() => listening ? recognition.current?.abort() : startVoiceInput()} aria-label={listening ? "Arrêter la dictée" : "Dicter un message"} title={listening ? "Arrêter la dictée" : "Dicter un message"} className="rounded-lg border border-slate-300 p-2.5 text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <button type="submit" disabled={busy || listening || !input.trim()} aria-label="Envoyer" title="Envoyer" className="rounded-lg bg-brand-600 p-2.5 text-white hover:bg-brand-700 disabled:opacity-50">
                {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-slate-400">La dictée dépend du navigateur et peut être traitée par son fournisseur. Les messages et les indicateurs autorisés sont traités par OpenAI.</p>
          </form>
        </section>
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-label="Ouvrir Xvisio" title="Discuter avec Xvisio" className="no-print fixed bottom-5 right-5 z-[80] flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-100">
          <MessageCircle className="h-6 w-6" />
        </button>
      )}
    </>
  );
}
