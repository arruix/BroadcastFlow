import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const api = "http://127.0.0.1:3001/v1";
const password = "clave-segura-12";
const portrait = path.join(__dirname, "fixtures", "retrato.png");

async function drag(page: Page, placement: string, dx: number, dy: number) {
  const frame = page.locator(`[data-placement="${placement}"]`);
  await frame.scrollIntoViewIfNeeded();
  const box = await frame.boundingBox();
  if (!box) throw new Error(`sin marco ${placement}`);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 8 });
  await page.mouse.up();
  return frame;
}

test("el encuadre se mueve con el arrastre y vuelve al inicio", async ({ page }, info) => {
  await page.goto("/campanas/nueva");
  await page.getByLabel("Nombre de la campaña").fill("Vestido de día de muertos");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel(/Enlace de pago/).fill("https://mpago.la/encuadre");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("El archivo no se sube")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(portrait);
  await expect(page.getByText("16:9")).toBeVisible();
  await expect(page.getByText("4:5")).toBeVisible();
  await expect(page.getByText("1.91:1").first()).toBeVisible();

  const wide = page.locator('[data-placement="x"]');
  await expect(wide).toHaveAttribute("data-focus-x", "50");
  await expect(wide).toHaveAttribute("data-focus-y", "28");
  await drag(page, "x", 70, 0);
  const moved = Number(await wide.getAttribute("data-focus-x"));
  expect(moved).toBeLessThan(50);

  await wide.focus();
  await wide.press("Equal");
  expect(Number(await wide.getAttribute("data-zoom"))).toBeGreaterThan(1);
  await page.locator("figure").filter({ has: wide }).getByRole("button", { name: "Reiniciar" }).click();
  await expect(wide).toHaveAttribute("data-focus-x", "50");
  await expect(wide).toHaveAttribute("data-zoom", "1");

  const feed = page.locator('[data-placement="instagram-feed"]');
  const ratio = await feed.evaluate((node) => getComputedStyle(node).aspectRatio);
  expect(ratio.replace(/\s/g, "")).toMatch(/0\.8|4\s*\/\s*5/);

  await page.screenshot({
    path: `/opt/cursor/artifacts/encuadre-${info.project.name}.png`,
    fullPage: true,
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(overflow).toBe(true);
});

test("el diseñador guarda la página y la pública la muestra sin secretos", async ({ page }, info) => {
  const stamp = Date.now();
  const email = `diseno.${stamp}@example.test`;
  const story = `Historia diseñada ${stamp} para quien llega desde la red`;

  await page.goto("/registro");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText("Revisa el correo para verificar la cuenta.")).toBeVisible();
  const mailbox = await page.request.get(`${api}/auth/dev/mailbox`);
  expect(mailbox.ok()).toBeTruthy();
  const sent = (await mailbox.json()) as { to: string; purpose: string; token: string }[];
  const verify = [...sent].reverse().find((item) => item.to === email && item.purpose === "verify");
  await page.goto(`/verificar?token=${encodeURIComponent(verify!.token)}`);
  await expect(page.getByRole("heading", { name: "Correo verificado" })).toBeVisible();
  await page.goto("/ingresar");
  await page.evaluate(() => sessionStorage.removeItem("bf_after_login"));
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/empezar/);

  await page.getByRole("link", { name: "Nueva campaña" }).click();
  await page.getByLabel("Nombre de la campaña").fill(`Causa diseñada ${stamp}`);
  await page.getByLabel(/Por qué importa/).fill(story);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel(/Enlace de pago/).fill("https://mpago.la/diseno");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.locator('input[type="file"]').setInputFiles(portrait);
  await drag(page, "facebook", 40, 20);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Guardar campaña" }).click();
  await page.getByRole("link", { name: "Diseñar la página" }).click();
  await expect(page.locator("header").getByRole("heading", { name: `Causa diseñada ${stamp}` })).toBeVisible();

  await expect(page.getByRole("textbox", { name: "Historia", exact: true })).toHaveValue(story);
  await page.getByRole("textbox", { name: "Texto del botón" }).fill("Apoyar esta causa");
  await page.getByRole("textbox", { name: "Mensaje de agradecimiento" }).fill("Gracias por caminar con nosotros");
  await page.getByRole("button", { name: "Flor" }).click();
  await page.getByRole("button", { name: "Teléfono" }).click();
  await expect(page.locator(".landing-stage").getByText("Apoyar esta causa")).toBeVisible();
  await expect(page.locator(".landing-stage").getByText("Gracias por caminar con nosotros")).toBeVisible();
  await page.screenshot({
    path: `/opt/cursor/artifacts/diseno-${info.project.name}.png`,
    fullPage: false,
  });
  await page.getByRole("textbox", { name: "Historia", exact: true }).fill(`${story} <script>alert(1)</script>`);
  await page.getByRole("button", { name: "Guardar página" }).click();
  await expect(page.getByText("Página guardada.")).toBeVisible();

  const href = await page.getByRole("link", { name: "Ver cómo quedó publicada" }).getAttribute("href");
  await page.goto(href!);
  await expect(page.locator(".public-story")).toContainText(story);
  await expect(page.locator(".public-story")).toContainText("alert(1)");
  await expect(page.locator(".public-story")).not.toContainText("<script");
  const html = await page.locator(".public-story").innerHTML();
  expect(html.includes("<script")).toBe(false);
  await expect(page.getByText("ana@")).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(overflow).toBe(true);
  await page.screenshot({
    path: `/opt/cursor/artifacts/pagina-publica-${info.project.name}.png`,
    fullPage: true,
  });
});
