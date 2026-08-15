import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The dev server stays bound to loopback. Phone/laptop access comes from
    // `tailscale serve --http=8080`, which proxies in from the tailnet — so
    // the app is never exposed to the LAN, only to George's own devices.
    // Vite rejects unrecognised Host headers, so the MagicDNS names for GDesk
    // have to be named explicitly or every tailnet request 403s.
    allowedHosts: ["georges-mac-mini.tail24407f.ts.net", "georges-mac-mini"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: { provider: "v8", reporter: ["text", "lcov"] },
  },
});
