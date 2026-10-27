"use client";

import Link from "next/link";
import { useI18n, useTx } from "@/lib/i18n";

// Pestañas de la sección Dinero: resumen, gasto en anuncios y reclamos de pago.
// Los movimientos (antes "Libro") son por campaña y se abren desde el resumen.
export function DineroTabs({ current }: { current: "resumen" | "gasto" | "reclamos" }) {
  const { t } = useI18n();
  const { tx } = useTx();
  const tabs = [
    { id: "resumen", href: "/dinero", label: tx("Resumen", "Overview") },
    { id: "gasto", href: "/gasto", label: t.nav.spend },
    { id: "reclamos", href: "/disputas", label: t.nav.disputes },
  ] as const;
  return (
    <nav className="tabs" aria-label={t.nav.money}>
      {tabs.map((tab) => (
        <Link key={tab.id} className="tab" href={tab.href} aria-current={current === tab.id ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
