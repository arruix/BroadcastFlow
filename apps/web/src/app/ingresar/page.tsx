"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ApiError, api, explain } from "@/lib/api";

type Organization = { id: string; name: string };

export default function Ingresar() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, ...(totp ? { totp } : {}) }),
      });
      const organizations = await api<Organization[]>("/organizations");
      router.push(organizations.length ? "/tablero" : "/organizacion");
    } catch (error) {
      if (error instanceof ApiError && error.code === "mfa_required") {
        setNeedCode(true);
        setMessage(explain(error));
        return;
      }
      if (error instanceof ApiError && error.code === "mfa_enroll_required" && error.ticket) {
        sessionStorage.setItem("bf.ticket", error.ticket);
        router.push("/mfa");
        return;
      }
      setMessage(explain(error));
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold">Entrar</h1>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <label className="flex flex-col gap-1">
          Correo
          <input className="min-h-11 rounded border px-3" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          Contraseña
          <input className="min-h-11 rounded border px-3" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {needCode ? (
          <label className="flex flex-col gap-1">
            Código
            <input className="min-h-11 rounded border px-3" inputMode="numeric" value={totp} onChange={(event) => setTotp(event.target.value)} required />
          </label>
        ) : null}
        {message ? <p>{message}</p> : null}
        <button className="min-h-11 rounded bg-neutral-900 px-4 text-white" type="submit">
          Entrar
        </button>
      </form>
      <Link className="inline-flex min-h-11 items-center" href="/recuperar">
        Olvidé mi contraseña
      </Link>
    </main>
  );
}
