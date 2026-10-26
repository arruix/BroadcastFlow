"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTx } from "@/lib/i18n";
import { api, explain, signedIn } from "@/lib/api";

export default function Invitar() {
  const { tx } = useTx();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(value);
    if (value) sessionStorage.setItem("bf_after_login", `/invitar?token=${encodeURIComponent(value)}`);
  }, []);

  async function accept() {
    setMessage("");
    try {
      await api("/invitations/accept", { method: "POST", body: JSON.stringify({ token }) });
      sessionStorage.removeItem("bf_after_login");
      router.push("/tablero");
    } catch (error) {
      setMessage(explain(error));
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-12">
      <h1 className="text-4xl">{tx("Invitación", "Invitation")}</h1>
      <p>{tx("Aceptar te deja en la organización con el rol de la invitación.", "Accepting puts you in the organization with the invited role.")}</p>
      {message ? <p>{message}</p> : null}
      {signedIn() ? (
        <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="button" onClick={accept} disabled={!token}>
          {tx("Aceptar", "Accept")}
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <p>{tx("Entra con el correo de la invitación. Si no tienes cuenta, regístrate y verifica el correo.", "Sign in with the invited email. If you have no account, register and verify the email.")}</p>
          <Link className="inline-flex min-h-11 items-center" href="/ingresar">
            {tx("Entrar", "Sign in")}
          </Link>
          <Link className="inline-flex min-h-11 items-center" href="/registro">
            {tx("Crear cuenta", "Create account")}
          </Link>
        </div>
      )}
    </main>
  );
}
