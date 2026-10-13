/** Het ingesloten platform behoudt de rekenmodules zonder de publieke demo te wijzigen. */
export function buildMode(env: { VITE_PLATFORM?: string; VITE_PUBLIC_WEB?: string }) {
  const embedded = env.VITE_PLATFORM === "1";
  const publicDemo = !embedded && env.VITE_PUBLIC_WEB === "1";
  return { embedded, publicDemo, autoExample: publicDemo };
}

export const BUILD_MODE = buildMode(import.meta.env);
