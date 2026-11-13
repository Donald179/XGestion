"use client";

import React from "react";

// 1. GRAPHIQUE EN BÂTONS (Revenus / Ventes par mois)
export function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <h3 className="text-base font-semibold text-slate-800 mb-4">Évolution des revenus mensuels</h3>
      <div className="h-56 flex items-end justify-between gap-3 pt-4 border-b border-slate-100">
        {data.map((item, idx) => {
          const heightPercent = Math.round((item.value / maxVal) * 100);
          return (
            <div key={idx} className="flex-1 flex flex-col items-center group">
              <span className="text-xs font-medium text-slate-600 mb-1 opacity-0 group-hover:opacity-100 transition">
                {item.value.toLocaleString("fr-FR")} F
              </span>
              <div className="w-full bg-slate-100 rounded-t-md h-44 flex items-end overflow-hidden">
                <div
                  style={{ height: `${heightPercent}%` }}
                  className="w-full bg-blue-600 hover:bg-blue-500 rounded-t-md transition-all duration-500"
                />
              </div>
              <span className="text-xs text-slate-500 mt-2 font-medium">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 2. GRAPHIQUE SPHÉRIQUE / DONUT (Répartition des revenus par catégorie)
export function DonutChart({
  items,
}: {
  items: { label: string; value: number; color: string }[];
}) {
  const total = items.reduce((acc, item) => acc + item.value, 0) || 1;
  let cumulativePercent = 0;

  // Construction du dégradé conique pour un rendu sphérique parfait
  const gradientParts = items.map((item) => {
    const startPercent = cumulativePercent;
    const slicePercent = (item.value / total) * 100;
    cumulativePercent += slicePercent;
    return `${item.color} ${startPercent}% ${cumulativePercent}%`;
  });

  const backgroundStyle = {
    background: `conic-gradient(${gradientParts.join(", ")})`,
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
      <h3 className="text-base font-semibold text-slate-800 mb-4">Répartition des encaissements</h3>

      <div className="flex flex-col sm:flex-row items-center justify-around gap-6 my-auto">
        {/* Sphère / Anneau */}
        <div className="relative w-40 h-40 rounded-full flex items-center justify-center shadow-inner" style={backgroundStyle}>
          <div className="w-24 h-24 bg-white rounded-full flex flex-col items-center justify-center shadow-sm">
            <span className="text-xs text-slate-400">Total</span>
            <span className="text-sm font-bold text-slate-800">100%</span>
          </div>
        </div>

        {/* Légende */}
        <div className="space-y-2.5 flex-1">
          {items.map((item, idx) => {
            const pct = Math.round((item.value / total) * 100);
            return (
              <div key={idx} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-600">{item.label}</span>
                </div>
                <span className="font-semibold text-slate-800">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
