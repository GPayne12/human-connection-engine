// AES-GCM-256 encryption for sensitive Person fields (notes, originStory).
//
// Key is generated on first use and stored in localStorage as a JWK.
// Trade-off: key lives alongside the encrypted data in the same browser profile,
// so this protects against raw IndexedDB file extraction, not against full browser
// profile access. Acceptable for v1 local-first app; see DECISIONS.md.

import type { EncryptedField } from "../types";

const KEY_STORAGE_KEY = "hce_field_key_v1";

let _key: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
  if (_key) return _key;

  const stored = localStorage.getItem(KEY_STORAGE_KEY);
  if (stored) {
    _key = await crypto.subtle.importKey(
      "jwk",
      JSON.parse(stored) as JsonWebKey,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
    return _key;
  }

  _key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", _key);
  localStorage.setItem(KEY_STORAGE_KEY, JSON.stringify(jwk));
  return _key;
}

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function encryptField(plaintext: string): Promise<EncryptedField> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  return { iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

export async function decryptField(field: EncryptedField): Promise<string> {
  const key = await getKey();
  const iv = fromBase64(field.iv);
  const ciphertext = fromBase64(field.ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}
