"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { refreshSession } from "@/lib/api";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    refreshSession().finally(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) return <p className="px-4 py-16 text-center">{t.screens.loading}</p>;
  return children;
}
