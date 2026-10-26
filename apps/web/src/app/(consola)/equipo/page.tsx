"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useI18n, useTx } from "@/lib/i18n";
import { api, explain, signedIn } from "@/lib/api";

type Organization = { id: string; name: string; role: string };
type Member = { id: string; email: string; role: string };
type Invitation = { id: string; email: string; role: string; expiresAt: string };
type Team = { members: Member[]; invitations: Invitation[] };

const roles = ["admin", "editor", "publisher", "treasurer", "analyst"];

export default function Equipo() {
  const { locale } = useI18n();
  const { tx } = useTx();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [email, setEmail] = useState("");
  const [mine, setMine] = useState("");
  const [role, setRole] = useState("editor");
  const [team, setTeam] = useState<Team>({ members: [], invitations: [] });
  const [message, setMessage] = useState("");
  const dateLocale = locale === "en" ? "en-US" : "es-MX";

  const load = useCallback(async (organizationId: string) => {
    setTeam(await api<Team>(`/organizations/${organizationId}/members`));
  }, []);

  useEffect(() => {
    if (!signedIn()) return;
    Promise.all([api<Organization[]>("/organizations"), api<{ email: string }>("/auth/me")])
      .then(async ([rows, me]) => {
        setMine(me.email);
        const current = rows[0] ?? null;
        setOrganization(current);
        if (current && (current.role === "owner" || current.role === "admin")) await load(current.id);
      })
      .catch((error) => setMessage(explain(error)));
  }, [load]);

  const manager = organization?.role === "owner" || organization?.role === "admin";

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!organization) return;
    setMessage("");
    try {
      await api(`/organizations/${organization.id}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });
      setEmail("");
      setMessage(tx("Enviamos el enlace. Dura 7 días.", "We sent the link. It lasts 7 days."));
      await load(organization.id);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function remove(membershipId: string) {
    if (!organization) return;
    setMessage("");
    try {
      await api(`/organizations/${organization.id}/members/${membershipId}`, { method: "DELETE" });
      await load(organization.id);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  return (
    <main className="console-page">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">{tx("Consola", "Console")}</p>
        <h1 className="text-4xl">{tx("Equipo", "Team")}</h1>
      </header>
      {message ? <p className="note">{message}</p> : null}
      {!organization ? <p>{tx("Esta cuenta no tiene organización.", "This account has no organization.")}</p> : null}
      {organization && !manager ? <p>{tx("Solo el owner o el admin da de alta y de baja.", "Only the owner or an admin can add and remove people.")}</p> : null}
      {manager && organization ? (
        <section className="sheet">
          <form className="fields" onSubmit={invite}>
            <label className="flex flex-col gap-1">
              {tx("Correo", "Email")}
              <input className="min-h-11 rounded border px-3" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label className="flex flex-col gap-1">
              {tx("Rol", "Role")}
              <select className="min-h-11 rounded border px-3" value={role} onChange={(event) => setRole(event.target.value)}>
                {roles.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <button className="min-h-11 self-end rounded bg-neutral-900 px-4 text-white" type="submit">
              {tx("Dar de alta", "Add")}
            </button>
          </form>
          <div className="flex flex-col gap-2">
            {team.members.map((member) => (
              <article key={member.id} className="row">
                <div className="row-main">
                  <p className="font-semibold">{member.email}</p>
                  <span className="status w-fit">{member.role}</span>
                </div>
                {member.role !== "owner" && member.email !== mine ? (
                  <button className="quiet-warn" type="button" onClick={() => remove(member.id)}>
                    {tx("Dar de baja", "Remove")}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
          {team.invitations.length ? (
            <div className="flex flex-col gap-2">
              <h2 className="text-xl">{tx("Invitaciones pendientes", "Pending invitations")}</h2>
              <div className="flex flex-col gap-2">
                {team.invitations.map((invitation) => (
                  <article key={invitation.id} className="row">
                    <div className="row-main">
                      <p className="font-semibold">{invitation.email}</p>
                      <p className="text-sm text-[var(--muted)]">
                        {invitation.role} · {new Date(invitation.expiresAt).toLocaleDateString(dateLocale, { dateStyle: "medium" })}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
