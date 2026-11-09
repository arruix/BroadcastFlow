import { expect, test, type Page } from "@playwright/test";

const dir = "/opt/cursor/artifacts";

function alert(page: Page) {
  return page.locator("p[role='alert']");
}

function shot(page: Page, project: string, name: string) {
  return page.screenshot({
    path: `${dir}/auth-${project}-${name}.png`,
    fullPage: true,
  });
}

test("registro, recuperación y restablecer", async ({ page }, info) => {
  const project = info.project.name;
  await page.goto("/registro");
  await expect(page.getByRole("heading", { name: "Crear cuenta" })).toBeVisible();
  await shot(page, project, "registro");

  await page.goto("/recuperar");
  await expect(page.getByRole("heading", { name: "Nueva contraseña" })).toBeVisible();
  await shot(page, project, "recuperar");

  await page.goto("/restablecer?token=token-de-prueba-local-0123456789");
  await expect(page.getByRole("heading", { name: "Elegir contraseña" })).toBeVisible();
  await expect(page.locator("input").first()).toHaveValue("token-de-prueba-local-0123456789");
  await shot(page, project, "restablecer");
});

test("verificar carga, éxito, enlace usado y error", async ({ page }, info) => {
  const project = info.project.name;
  let releaseVerify: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    releaseVerify = resolve;
  });
  await page.route("**/v1/auth/verify", async (route) => {
    await gate;
    await route.fulfill({ status: 204, body: "" });
  });
  await page.goto("/verificar?token=token-valido-visual-0123456789");
  await expect(page.getByText("Verificando…")).toBeVisible();
  await shot(page, project, "verificar-cargando");
  releaseVerify?.();
  await expect(page.getByRole("heading", { name: "Correo verificado" })).toBeVisible();
  await shot(page, project, "verificar-exito");

  await page.unroute("**/v1/auth/verify");
  await page.route("**/v1/auth/verify", (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ code: "token_invalid" }),
    }),
  );
  await page.goto("/verificar?token=token-usado-visual-0123456789");
  await expect(page.getByRole("heading", { name: "El enlace venció o ya se usó" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reenviar correo" })).toBeVisible();
  await shot(page, project, "verificar-vencido");

  await page.unroute("**/v1/auth/verify");
  await page.route("**/v1/auth/verify", (route) => route.abort("failed"));
  await page.goto("/verificar?token=token-red-visual-0123456789");
  await expect(alert(page)).toContainText("No hay conexión");
  await shot(page, project, "verificar-error");
});

test("ingresar muestra credenciales, red, rechazo vacío y sesión a medias", async ({ page }, info) => {
  const project = info.project.name;
  await page.route("**/v1/auth/login", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: "invalid_credentials" }),
    }),
  );
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill("ana@example.test");
  await page.getByLabel("Contraseña").fill("clave-segura-12");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(alert(page)).toContainText("Correo o clave incorrectos.");
  await shot(page, project, "ingresar-credenciales");

  await page.unroute("**/v1/auth/login");
  await page.route("**/v1/auth/login", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(alert(page)).toContainText("No hay conexión");
  await shot(page, project, "ingresar-red");

  await page.unroute("**/v1/auth/login");
  let releaseLogin: (() => void) | undefined;
  const loginGate = new Promise<void>((resolve) => {
    releaseLogin = resolve;
  });
  await page.route("**/v1/auth/login", async (route) => {
    await loginGate;
    await route.fulfill({ status: 401, body: "" });
  });
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: "Entrando…" })).toBeDisabled();
  await shot(page, project, "ingresar-cargando");
  releaseLogin?.();
  await expect(alert(page)).toContainText("rechazó la petición");
  await expect(page.getByLabel("Contraseña")).toBeVisible();
  await shot(page, project, "ingresar-rechazo");

  await page.unroute("**/v1/auth/login");
  await page.route("**/v1/auth/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accessToken: "sesion-visual" }),
    }),
  );
  await page.route("**/v1/auth/me", (route) => route.fulfill({ status: 401, body: "" }));
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Entraste, pero no pudimos abrir tu cuenta" })).toBeVisible();
  await expect(page.getByLabel("Contraseña")).toHaveCount(0);
  await expect(alert(page)).toContainText("rechazó la petición");
  await shot(page, project, "ingresar-sesion");
});
