// Ids for new records, minted in a way that survives an insecure context.
//
// crypto.randomUUID() is secure-context-only. HCE is served over plain HTTP on
// a bare tailnet IP (http://100.94.123.112:5199), which is NOT a secure
// context, so on every device except the one browsing the service over
// loopback it is undefined — calling it throws a TypeError before the write
// ever reaches the network. That is what silently blocked every Log-contact
// save from GLap and the phone.
//
// crypto.getRandomValues() carries no such restriction (only randomUUID and
// crypto.subtle do), so the fallback builds the same RFC 4122 v4 shape from
// it. Both branches are cryptographically random; the fallback is not a
// downgrade in id quality, only in brevity.
//
// Prefer newId() over calling crypto.randomUUID() directly anywhere in src/.
export function newId(): string {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
