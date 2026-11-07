import { expect, test } from "@playwright/test";

const api = "http://127.0.0.1:3001/v1";
const password = "clave-segura-12";

test("inicio, enlaces de cuenta y flujo de campaña", async ({ page }) => {
  const stamp = Date.now();
  const email = `salida.${stamp}@example.test`;
  const story = `Historia local ${stamp} para la página pública`;

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/visitas y clics/i);
  await expect(page.getByText("Hoy se publica en tu Página de Facebook")).toHaveCount(0);
  await expect(page.getByText("YouTube en vivo")).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(overflow).toBe(true);

  await page.goto("/verificar?token=token-de-prueba-local-0123456789");
  await expect(page.getByRole("heading", { name: "Verificar correo" })).toBeVisible();
  await expect(page.locator("input").first()).toHaveValue("token-de-prueba-local-0123456789");

  await page.goto("/restablecer?token=token-de-prueba-local-0123456789");
  await expect(page.getByRole("heading", { name: "Elegir contraseña" })).toBeVisible();
  await expect(page.locator("input").first()).toHaveValue("token-de-prueba-local-0123456789");

  await page.goto("/invitar?token=token-de-prueba-local-0123456789");
  await expect(page.getByRole("heading", { name: "Invitación" })).toBeVisible();
  await expect(page.getByText("Entra con el correo de la invitación")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Entrar" })).toBeVisible();

  await page.goto("/registro");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText("Revisa el correo para verificar la cuenta.")).toBeVisible();

  const mailbox = await page.request.get(`${api}/auth/dev/mailbox`);
  expect(mailbox.ok()).toBeTruthy();
  const sent = (await mailbox.json()) as { to: string; purpose: string; token: string }[];
  const verify = [...sent].reverse().find((item) => item.to === email && item.purpose === "verify");
  expect(verify?.token).toBeTruthy();

  await page.goto(`/verificar?token=${encodeURIComponent(verify!.token)}`);
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();

  await page.goto("/ingresar");
  await page.evaluate(() => sessionStorage.removeItem("bf_after_login"));
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/empezar/);

  await page.getByRole("link", { name: "Nueva campaña" }).click();
  await page.getByLabel("Nombre de la campaña").fill(`Causa local ${stamp}`);
  await page.getByLabel(/Por qué importa/).fill(story);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel(/Enlace de pago/).fill("https://mpago.la/salida-local");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("El archivo no se sube")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Guardar campaña" }).click();
  await expect(page.getByText("La campaña sigue en borrador")).toBeVisible();
  const share = await page.locator(".share-url").first().innerText();
  const slug = new URL(share).pathname.split("/")[2];

  const draft = await page.request.get(`${api}/public/campaigns/${slug}`);
  expect(draft.ok()).toBeTruthy();
  const draftBody = await draft.json();
  expect(draftBody.status).toBe("borrador");
  expect(draftBody.share.description).toBe(story);
  expect(draftBody.paymentMethod).toBeNull();

  const draftPage = await page.context().browser()!.newContext();
  const visitor = await draftPage.newPage();
  await visitor.goto(`/c/${slug}`);
  await expect(visitor.getByText(story)).toBeVisible();
  await expect(visitor.getByText("mientras sigue en borrador")).toBeVisible();
  await expect(visitor.getByRole("link", { name: /Donar con/ })).toHaveCount(0);
  await visitor.close();
  await draftPage.close();

  await page.getByRole("button", { name: "Publicar aviso y activar" }).click();
  await expect(page).toHaveURL(/\/campanas\/[0-9a-f-]+$/);
  await page.getByLabel(/Responsable/).fill("Causa Local AC");
  await page.getByLabel("Finalidad").fill("Recibir apoyo para la causa local");
  await page.getByLabel(/Datos que se piden/).fill("Nombre y correo de quien registra una intención");
  await page.getByLabel(/Plazo de conservación/).fill("Cinco años desde el registro");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await page.getByRole("button", { name: /Publicar versión/ }).click();
  await page.getByRole("button", { name: "Activar campaña" }).click();
  await expect(page.locator(".status-activa")).toBeVisible();

  const live = await page.context().browser()!.newContext();
  const donor = await live.newPage();
  await donor.setViewportSize(page.viewportSize() ?? { width: 1280, height: 800 });
  await donor.goto(`/c/${slug}`);
  await expect(donor.getByText(story)).toBeVisible();
  await expect(donor.getByRole("link", { name: "Donar con Mercado Pago" })).toBeVisible();
  await expect(donor.getByText("confirmados en el libro", { exact: true })).toBeVisible();
  await expect(donor.getByText("te avisaremos por correo")).toHaveCount(0);
  const donorOverflow = await donor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(donorOverflow).toBe(true);
  await donor.close();
  await live.close();

  await page.goto("/conexiones");
  await expect(page.getByText("No publica en Facebook ni transmite en vivo")).toBeVisible();
  await expect(page.getByText("Publicación y Live activo")).toHaveCount(0);
});
