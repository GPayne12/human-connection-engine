#!/usr/bin/env bash
# Reports how HCE is currently reachable from the tailnet, and whether the
# secure-context blockers are still in place.
#
# Written for two transitions: renaming this machine (which changes the
# MagicDNS name, and with it the name published to the public Certificate
# Transparency ledger), and turning on HTTPS certificates. Nothing here
# changes state — it only reads.

set -uo pipefail

TS="${TAILSCALE_BIN:-/usr/local/bin/tailscale}"
[[ -x "$TS" ]] || TS="$(command -v tailscale || true)"
if [[ -z "$TS" ]]; then
  echo "tailscale CLI not found" >&2
  exit 1
fi

APP_PORT=8199 # graph service + built UI, via `tailscale serve`
DEV_PORT=8080 # Vite dev server, via `tailscale serve`

dns_name="$("$TS" status --json 2>/dev/null |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2>/dev/null)"

if [[ -z "$dns_name" ]]; then
  echo "Could not read this machine'\''s MagicDNS name — is tailscaled running?" >&2
  exit 1
fi

# CertDomains is populated only once HTTPS certificates are enabled for the
# tailnet (admin console → DNS → HTTPS Certificates). Empty means the toggle
# is off, which is what `tailscale cert`'s "account does not support getting
# TLS certs" actually means — it is not a paid-plan limit.
certs_on="$("$TS" status --json 2>/dev/null |
  python3 -c 'import json,sys; d=json.load(sys.stdin).get("CertDomains") or []; print("yes" if d else "no")' 2>/dev/null)"

scheme="http"
[[ "$certs_on" == "yes" ]] && scheme="https"

echo "machine name : ${dns_name%%.*}"
echo "MagicDNS     : $dns_name"
echo "HTTPS certs  : $certs_on"
echo
echo "app          : $scheme://$dns_name:$APP_PORT"
echo "dev server   : $scheme://$dns_name:$DEV_PORT   (only while Vite is running)"
echo
echo "serve config :"
"$TS" serve status 2>/dev/null | sed 's/^/  /' || echo "  (none)"

if [[ "$certs_on" == "no" ]]; then
  cat <<'EOF'

HTTPS is off, so the tailnet origin is not a secure context: no clipboard
API, no service workers, and Chrome will not offer "Install app".

To fix (free, no plan change): admin console → DNS → HTTPS Certificates.
Rename this machine FIRST if the current name should stay out of the public
CT ledger — and untick "Auto-generate from OS hostname" when you do, or the
macOS ComputerName will regenerate the old name on the next tailscaled start
and a later cert renewal will publish it anyway.
EOF
fi
