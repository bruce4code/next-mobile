import { notFound, redirect } from "next/navigation"
import { Activity, CheckCircle2, CircleDotDashed, Database, Network, ShieldCheck } from "lucide-react"
import { getUser } from "@/app/auth/server"
import { isAdminEmail } from "@/lib/admin"

const stages = [
  { label: "Legacy retrieval", detail: "Production response source", status: "active" },
  { label: "Nest shadow", detail: "Async parity comparison", status: "active" },
  { label: "Traffic cutover", detail: "Held until acceptance gates pass", status: "pending" },
]

export default async function RagShadowPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const user = await getUser()
  if (!user) redirect(`/${locale}/login`)
  if (!isAdminEmail(user.email)) notFound()

  const enabled = process.env.RAG_SHADOW_NEST === "true"
  const endpoint = process.env.NEST_API_URL ?? "Not configured"

  return (
    <main className="min-h-full bg-slate-950 px-4 py-5 text-slate-100 sm:px-7 sm:py-7">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
              <Activity className="size-3.5" /> Retrieval operations
            </div>
            <h1 className="text-2xl font-semibold tracking-normal text-white">RAG shadow monitor</h1>
            <p className="mt-1 text-sm text-slate-400">Compare Nest retrieval without changing the chat response path.</p>
          </div>
          <div className={`inline-flex items-center gap-2 self-start border px-3 py-1.5 text-sm ${enabled ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-900 text-slate-400"}`}>
            <span className={`size-2 rounded-full ${enabled ? "bg-emerald-400" : "bg-slate-500"}`} />
            {enabled ? "Shadow enabled" : "Shadow disabled"}
          </div>
        </header>

        <section className="grid gap-px overflow-hidden border border-slate-800 bg-slate-800 md:grid-cols-3">
          <div className="bg-slate-950 p-5"><Network className="mb-4 size-5 text-cyan-300" /><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Nest endpoint</p><p className="mt-2 break-all font-mono text-sm text-slate-200">{endpoint}</p></div>
          <div className="bg-slate-950 p-5"><ShieldCheck className="mb-4 size-5 text-cyan-300" /><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Access boundary</p><p className="mt-2 text-sm text-slate-200">Supabase bearer token</p></div>
          <div className="bg-slate-950 p-5"><Database className="mb-4 size-5 text-cyan-300" /><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Comparison signals</p><p className="mt-2 text-sm text-slate-200">Document overlap, latency, failures</p></div>
        </section>

        <section className="border border-slate-800 bg-slate-950">
          <div className="border-b border-slate-800 px-5 py-4"><h2 className="text-sm font-medium text-white">Delivery path</h2></div>
          <div className="divide-y divide-slate-800">
            {stages.map((stage) => <div key={stage.label} className="flex items-center gap-4 px-5 py-4"><CheckCircle2 className={`size-5 ${stage.status === "active" ? "text-emerald-400" : "text-slate-700"}`} /><div className="min-w-0 flex-1"><p className="text-sm text-slate-200">{stage.label}</p><p className="text-xs text-slate-500">{stage.detail}</p></div>{stage.status === "pending" && <CircleDotDashed className="size-4 text-amber-400" />}</div>)}
          </div>
        </section>
      </div>
    </main>
  )
}
