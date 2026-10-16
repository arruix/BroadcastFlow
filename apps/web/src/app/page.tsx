import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold">BroadcastFlow</h1>
      <p>Landing de la campaña y consola de la organización.</p>
      <nav className="flex flex-col gap-3">
        <Link className="inline-flex min-h-11 items-center" href="/registro">
          Crear cuenta
        </Link>
        <Link className="inline-flex min-h-11 items-center" href="/ingresar">
          Entrar
        </Link>
        <Link className="inline-flex min-h-11 items-center" href="/tablero">
          Consola
        </Link>
      </nav>
    </main>
  );
}
