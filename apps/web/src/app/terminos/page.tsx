import Link from "next/link";
import { Idioma } from "@/lib/i18n";
import { pick, serverLocale } from "@/lib/locale";

export default async function Terminos() {
  const locale = await serverLocale();
  const tx = (es: string, en: string) => pick(locale, es, en);
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 px-4 py-10">
      <Idioma />
      <h1 className="text-3xl font-semibold">{tx("Términos", "Terms")}</h1>
      <p>{tx("Estos términos son del proveedor del software. El plan se contrata dentro de la consola, a nombre de la organización.", "These terms belong to the software provider. The plan is purchased inside the console, in the organization's name.")}</p>
      <p>{tx("El donativo de una campaña no es un pago al proveedor. El recibo de ese donativo dice que no es un comprobante fiscal deducible. El CFDI del producto es el de la suscripción.", "A campaign donation is not a payment to the provider. That donation's receipt says it is not a deductible tax receipt. The product CFDI is the subscription's.")}</p>
      <p>{tx("El producto no compra pauta, no lee pedidos de una tienda y no ofrece una app nativa de teléfono. Operar desde el teléfono es la web.", "The product does not buy ads, does not read a store's orders, and does not offer a native phone app. Operating from a phone is the web.")}</p>
      <Link className="inline-flex min-h-11 items-center" href="/">
        {tx("Volver", "Back")}
      </Link>
    </main>
  );
}
