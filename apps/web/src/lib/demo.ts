// Modo demo para grabaciones: NEXT_PUBLIC_DEMO_MODE=true oculta Programación,
// Conexiones y los botones Live/En vivo en la consola. No quita funciones:
// las rutas siguen existiendo y el modo se apaga sin cambiar código.
export const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const hiddenInDemo = new Set(["schedule", "connections"]);

export function visibleInDemo(id: string) {
  return !demoMode || !hiddenInDemo.has(id);
}
