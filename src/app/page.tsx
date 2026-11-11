import { redirect } from "next/navigation";
import { loadCtx } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const r = await loadCtx();
  redirect(r ? "/dashboard" : "/login");
}
