"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTx } from "@/lib/i18n";
import { api, explain, signedIn, watchEvents } from "@/lib/api";

type Organization = { id: string };
type Network = { code: string; liveMode: string; reason: string | null };
type Connection = { id: string; network: string; externalAccountId: string; status: string };
type Destination = { connectionId: string; network: string; status: string; failureReason?: string };
type Session = { id: string; status: string; playbackUrl?: string; destinations: Destination[] };
type Desk = {
  minutesIncluded: number;
  secondsUsed: number;
  secondsRemaining: number;
  networks: Network[];
  connections: Connection[];
  session: Session | null;
};

export default function EnVivo() {
  const { tx } = useTx();
  const params = useParams<{ campaignId: string }>();
  const [organizationId, setOrganizationId] = useState("");
  const [desk, setDesk] = useState<Desk | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (org: string) => {
    const next = await api<Desk>(`/campaigns/${params.campaignId}/live`, { org });
    setDesk(next);
    setChosen((current) =>
      current.length
        ? current
        : next.connections.filter((connection) => connection.status === "active" && next.networks.find((network) => network.code === connection.network)?.liveMode === "on").map((connection) => connection.id),
    );
  }, [params.campaignId]);

  useEffect(() => {
    if (!signedIn()) {
      setMessage("Entra para emitir.");
      return;
    }
    const controller = new AbortController();
    api<Organization[]>("/organizations")
      .then(async (rows) => {
        const org = rows[0]?.id ?? "";
        setOrganizationId(org);
        if (!org) return;
        await load(org);
        void watchEvents(org, () => void load(org), controller.signal);
      })
      .catch((error) => setMessage(explain(error)));
    return () => controller.abort();
  }, [load]);

  async function previewCamera() {
    setMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setPreview("Cámara y micrófono listos en esta sala.");
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      setPreview("Vista previa");
    }
  }

  async function goLive() {
    if (!desk) return;
    setMessage("");
    try {
      const opened = await api<Session>(`/campaigns/${params.campaignId}/live-sessions`, {
        method: "POST",
        org: organizationId,
        body: JSON.stringify({ connectionIds: chosen }),
      });
      await api<Session>(`/live-sessions/${opened.id}/start`, { method: "POST", org: organizationId });
      await load(organizationId);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  async function stop() {
    if (!desk?.session) return;
    setMessage("");
    try {
      await api(`/live-sessions/${desk.session.id}/stop`, { method: "POST", org: organizationId });
      await load(organizationId);
    } catch (error) {
      setMessage(explain(error));
    }
  }

  const live = desk?.session?.status === "live";
  const minutesLeft = desk ? Math.floor(desk.secondsRemaining / 60) : 0;

  return (
    <main className="console-page">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">{tx("Campaña", "Campaign")}</p>
        <h1 className="text-4xl">{tx("En vivo", "Live")}</h1>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
      <section className="sheet">
        <div className="preview-stage">{preview || tx("Vista previa", "Preview")}</div>
        <button className="quiet w-fit" type="button" onClick={previewCamera}>
          {tx("Probar cámara", "Test camera")}
        </button>
        {desk ? (
          <article className="stat">
            <p className="stat-label">{tx("Minutos", "Minutes")}</p>
            <p className="stat-value">{minutesLeft}</p>
            <p className="stat-hint">{tx(`de ${desk.minutesIncluded} incluidos`, `of ${desk.minutesIncluded} included`)}</p>
          </article>
        ) : null}
        {message ? <p className="note">{message}</p> : null}
      </section>
      <section className="sheet">
        <h2 className="text-2xl">{tx("Destinos", "Destinations")}</h2>
        <div className="flex flex-col gap-2">
          {desk?.networks.map((network) => {
            const connection = desk.connections.find((item) => item.network === network.code);
            const destination = desk.session?.destinations.find((item) => item.network === network.code);
            const selectable = network.liveMode === "on" && connection?.status === "active";
            return (
              <article key={network.code} className="row">
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={connection ? chosen.includes(connection.id) : false}
                    disabled={!selectable || live}
                    onChange={(event) =>
                      setChosen((current) =>
                        event.target.checked ? [...current, connection?.id ?? ""] : current.filter((id) => id !== connection?.id),
                      )
                    }
                  />
                  {network.code}
                  {destination ? ` · ${destination.status}` : ""}
                </label>
                {network.reason ? <p className="text-sm text-[var(--muted)]">{network.reason}</p> : null}
                {destination?.failureReason ? <p className="text-sm text-[var(--muted)]">{destination.failureReason}</p> : null}
              </article>
            );
          })}
        </div>
        {live ? (
          <button className="min-h-11 w-fit rounded bg-neutral-900 px-4 text-white" type="button" onClick={stop}>
            {tx("Detener", "Stop")}
          </button>
        ) : (
          <button className="min-h-11 w-fit rounded bg-neutral-900 px-4 text-white" type="button" onClick={goLive} disabled={!chosen.length}>
            {tx("Emitir", "Go live")}
          </button>
        )}
        <Link className="chip w-fit" href={`/campanas/${params.campaignId}`}>
          {tx("Volver a la campaña", "Back to the campaign")}
        </Link>
      </section>
      </div>
    </main>
  );
}
