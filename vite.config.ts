// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv, type ConfigEnv } from "vite";
import { resolve } from "node:path";

const config = defineConfig({
  vite: {
    resolve: {
      alias: {
        "entities/lib/decode.js": resolve(process.cwd(), "node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": resolve(process.cwd(), "node_modules/entities/lib/encode.js"),
        entities: resolve(process.cwd(), "node_modules/entities"),
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});

export default (env: ConfigEnv) => {
  // Server-only environment; the shared preset retains VITE_* client injection.
  Object.assign(process.env, loadEnv(env.mode, process.cwd(), ""));
  return config(env);
};
