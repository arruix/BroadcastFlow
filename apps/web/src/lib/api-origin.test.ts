import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { apiBaseFrom, proxyHeaders } from "./api-origin.ts";

describe("apiBaseFrom", () => {
  it("prefiere la URL interna y no usa la pública", () => {
    const base = apiBaseFrom({
      internal: "http://api:3001/v1/",
      publicUrl: "https://broadcastflow.mezkitstudios.com/v1",
    });
    assert.equal(base, "http://api:3001/v1");
  });

  it("en local, sin interna, usa la URL pública o localhost", () => {
    assert.equal(
      apiBaseFrom({ publicUrl: "http://127.0.0.1:3001/v1/" }),
      "http://127.0.0.1:3001/v1",
    );
    assert.equal(apiBaseFrom({}), "http://localhost:3001/v1");
    assert.equal(apiBaseFrom({ internal: "  " }), "http://localhost:3001/v1");
  });
});

describe("proxyHeaders", () => {
  it("omite el secreto vacío y no lo publica con otro nombre", () => {
    assert.deepEqual(proxyHeaders(""), {});
    assert.deepEqual(proxyHeaders("   "), {});
    assert.deepEqual(proxyHeaders(undefined), {});
  });

  it("manda el mismo encabezado que inyecta Caddy", () => {
    assert.deepEqual(proxyHeaders(" secreto "), { "X-BF-Proxy-Token": "secreto" });
  });
});

describe("el servidor no llama a la URL pública", () => {
  const sources = [
    "apps/web/src/app/page.tsx",
    "apps/web/src/app/c/[slug]/page.tsx",
    "apps/web/src/app/c/[slug]/recibo/[donationId]/page.tsx",
  ];

  for (const file of sources) {
    it(file, () => {
      const source = readFileSync(new URL(`../../../../${file}`, import.meta.url), "utf8");
      assert.match(source, /serverApiFetch/);
      assert.doesNotMatch(source, /NEXT_PUBLIC_API_URL/);
    });
  }

  it("el cliente sigue en la URL pública y no importa el módulo de servidor", () => {
    const client = ["apps/web/src/lib/api.ts", "apps/web/src/app/c/[slug]/donar.tsx", "apps/web/src/app/c/[slug]/pixel.tsx"];
    for (const file of client) {
      const source = readFileSync(new URL(`../../../../${file}`, import.meta.url), "utf8");
      assert.match(source, /NEXT_PUBLIC_API_URL/);
      assert.doesNotMatch(source, /server-api|API_INTERNAL_URL|PROXY_SHARED_SECRET/);
    }
  });
});
