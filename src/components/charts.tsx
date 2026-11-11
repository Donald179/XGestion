"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const nf = new Intl.NumberFormat("fr-FR");
const short = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)} M` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)} k` : String(v));

type Pt = { label: string; ventes: number; prestations: number; ca: number; depenses: number };

function Box({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3>
      <div className="h-64">
        {empty ? <div className="flex h-full items-center justify-center text-sm text-slate-400">Aucune donnée sur la période</div> : children}
      </div>
    </div>
  );
}

export function DashboardCharts({ series, top, perSeller, byMethod, split, currency, methodLabels }: {
  series: Pt[]; top: { name: string; qty: number }[]; perSeller: { name: string; n: number; total: number }[];
  byMethod: { method: string; v: number }[]; split: { name: string; value: number }[]; currency: string; methodLabels: Record<string, string>;
}) {
  const tip = (v: unknown) => `${nf.format(Number(v))} ${currency}`;
  const hasSeries = series.some((s) => s.ca || s.depenses);
  const splitTotal = split.reduce((a, s) => a + s.value, 0);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Box title="Évolution du chiffre d'affaires" empty={!hasSeries}>
        <ResponsiveContainer>
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} tickFormatter={short} width={44} />
            <Tooltip formatter={tip} /><Legend />
            <Line type="monotone" dataKey="ca" name="Chiffre d'affaires" stroke="#1f5fd6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Box>
      <Box title="Évolution des dépenses" empty={!hasSeries}>
        <ResponsiveContainer>
          <BarChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} tickFormatter={short} width={44} />
            <Tooltip formatter={tip} />
            <Bar dataKey="depenses" name="Dépenses" fill="#dc2626" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
      <Box title="Répartition des revenus : ventes / prestations" empty={splitTotal === 0}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={split} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} label={(e) => `${Math.round((Number(e.value) / splitTotal) * 100)}%`}>
              <Cell fill="#1f5fd6" /><Cell fill="#16a34a" />
            </Pie>
            <Tooltip formatter={tip} /><Legend />
          </PieChart>
        </ResponsiveContainer>
      </Box>
      <Box title="Performance commerciale (ventes par vendeur)" empty={perSeller.length === 0}>
        <ResponsiveContainer>
          <BarChart data={perSeller} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" fontSize={11} tickFormatter={short} /><YAxis type="category" dataKey="name" fontSize={11} width={90} />
            <Tooltip formatter={tip} />
            <Bar dataKey="total" name="Montant vendu" fill="#2f6fe4" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
      <Box title="Produits les plus vendus (quantités)" empty={top.length === 0}>
        <ResponsiveContainer>
          <BarChart data={top} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" fontSize={11} allowDecimals={false} /><YAxis type="category" dataKey="name" fontSize={11} width={110} />
            <Tooltip />
            <Bar dataKey="qty" name="Quantité" fill="#16a34a" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
      <Box title="Encaissements par mode de paiement" empty={byMethod.length === 0}>
        <ResponsiveContainer>
          <BarChart data={byMethod.map((m) => ({ ...m, name: methodLabels[m.method] ?? m.method }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} tickFormatter={short} width={44} />
            <Tooltip formatter={tip} />
            <Bar dataKey="v" name="Encaissé" fill="#0b1b3b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </div>
  );
}
