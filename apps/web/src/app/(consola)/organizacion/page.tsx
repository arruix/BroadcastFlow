"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Organizacion() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/empezar");
  }, [router]);

  return null;
}
