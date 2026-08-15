import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The dev server stays bound to loopback. Phone/laptop access comes from
    // `tailscale serve --http=8080`, which proxies in from the tailnet — so
    // the app is never exposed to the LAN, only to George's own devices.
    // Vite rejects unrecognised Host headers, so tailnet requests 403 unless
    // the MagicDNS name is allowed here.
    //
    // Matched by suffix rather than by hostname on purpose: a leading dot
    // matches any subdomain, so renaming the machine in the Tailscale admin
    // console — which is what changes the MagicDNS name, and the name that
    // ends up in the public Certificate Transparency ledger — does not break
    // the dev server. Only traffic arriving through `tailscale serve` can
    // present a *.ts.net Host header here, since the server never leaves
    // loopback.
    allowedHosts: [".ts.net"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: { provider: "v8", reporter: ["text", "lcov"] },
  },
});
