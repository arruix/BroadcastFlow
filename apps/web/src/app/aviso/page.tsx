import Link from "next/link";
import { Idioma } from "@/lib/i18n";
import { pick, serverLocale } from "@/lib/locale";

export default async function AvisoDelSitio() {
  const locale = await serverLocale();
  const tx = (es: string, en: string) => pick(locale, es, en);
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 px-4 py-10">
      <Idioma />
      <h1 className="text-3xl font-semibold">{tx("Aviso de privacidad del sitio", "Site privacy notice")}</h1>
      <p>{tx("Este aviso es del proveedor del software, para quien visita esta página y crea una cuenta.", "This notice belongs to the software provider, for anyone who visits this page and creates an account.")}</p>
      <p>{tx("No es el aviso de privacidad de una campaña. Ese lo publica la organización en su landing, y sin esa versión publicada la campaña no mide ni cobra.", "It is not a campaign privacy notice. The organization publishes that one on its landing, and without that published version the campaign does not measure or charge.")}</p>
      <p>{tx("La cuenta guarda el correo y la contraseña cifrada. El alta pide verificar el correo. Esta página no mide visitas de campaña y no escribe el tablero de ninguna organización.", "The account stores the email and the hashed password. Sign-up asks to verify the email. This page does not measure campaign visits and does not write any organization's board.")}</p>
      <Link className="inline-flex min-h-11 items-center" href="/">
        {tx("Volver", "Back")}
      </Link>
    </main>
  );
}
