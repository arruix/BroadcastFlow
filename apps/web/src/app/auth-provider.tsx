"use client";

import { useEffect, useState } from "react";
import { refreshSession } from "@/lib/api";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    refreshSession().finally(() => setReady(true));
  }, []);

  if (!ready) return <p className="px-4 py-10">Cargando…</p>;
  return children;
}
