"use client";

import Link from "next/link";
import { visibleInDemo } from "@/lib/demo";
import { Idioma, useI18n, useTx } from "@/lib/i18n";

export default function Ajustes() {
  const { t } = useI18n();
  const { tx } = useTx();
  const items = [
    { id: "team", href: "/equipo", title: tx("Equipo", "Team"), body: tx("Quién entra a la consola y con qué permisos.", "Who can sign in and with which permissions.") },
    { id: "security", href: "/seguridad", title: t.nav.security, body: tx("Contraseña y verificación en dos pasos.", "Password and two-step verification.") },
    { id: "plan", href: "/plan", title: t.nav.plan, body: tx("Tu plan y la facturación.", "Your plan and billing.") },
    { id: "connections", href: "/conexiones", title: t.nav.connections, body: tx("Cuentas de Facebook y YouTube para transmitir.", "Facebook and YouTube accounts for streaming.") },
  ].filter((item) => visibleInDemo(item.id));
  return (
    <main className="console-page">
      <header className="flex flex-col gap-1">
        <p className="eyebrow">{t.dash.eyebrow}</p>
        <h1 className="text-4xl">{t.nav.settings}</h1>
      </header>
      <div className="card-grid">
        {items.map((item) => (
          <Link key={item.id} className="sheet settings-card" href={item.href}>
            <h2 className="text-xl">{item.title}</h2>
            <p className="text-sm text-[var(--muted)]">{item.body}</p>
          </Link>
        ))}
        <section className="sheet settings-card">
          <h2 className="text-xl">{tx("Idioma", "Language")}</h2>
          <Idioma />
        </section>
      </div>
    </main>
  );
}
