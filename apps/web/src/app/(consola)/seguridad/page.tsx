import Link from "next/link";
import { pick, serverLocale } from "@/lib/locale";

export default async function Seguridad() {
  const locale = await serverLocale();
  const tx = (es: string, en: string) => pick(locale, es, en);
  return (
    <main className="console-page">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">{tx("Consola", "Console")}</p>
        <h1 className="text-4xl">{tx("Seguridad", "Security")}</h1>
      </header>
      <section className="sheet">
        <p>{tx("Owner, admin y tesorero entran con contraseña y código en cada sesión. Editor, publisher y analyst pueden activarlo.", "Owner, admin, and treasurer sign in with a password and a code on every session. Editor, publisher, and analyst can turn it on.")}</p>
        <p>{tx("El código dura 30 segundos. Al activarlo, los ocho códigos de recuperación se muestran una sola vez.", "The code lasts 30 seconds. When it is turned on, the eight recovery codes are shown only once.")}</p>
        <p>{tx("Mover dinero pide un código reciente, válido diez minutos.", "Moving money requires a recent code, valid for ten minutes.")}</p>
        <Link className="inline-flex min-h-11 w-fit items-center rounded bg-neutral-900 px-4 text-white" href="/recuperar">
          {tx("Cambiar la contraseña", "Change the password")}
        </Link>
      </section>
    </main>
  );
}
