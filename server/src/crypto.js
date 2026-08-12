"use strict";
//
// crypto.js — AES-GCM-256 encryption for Person.notes / Person.originStory.
//
// Stage 2 moves encryption from the browser (src/db/crypto.ts, key in
// localStorage) to here. See DECISIONS.md, "Stage 2 — server-side field
// encryption": the browser now sends/receives plaintext over the loopback-
// only HTTP connection (or an SSH tunnel for a second machine), and this
// service encrypts before writing to disk and decrypts before responding.
// That trades "only this browser can ever read this" for "only this
// service on this machine can" — a deliberate choice to avoid reintroducing
// the per-browser-passphrase login step the original design rejected.
//
// The key file is chmod 0600 (owner read/write only) as the local
// equivalent of the browser keeping it out of anything but its own profile.

const fs = require("fs");
const path = require("path");
const { webcrypto } = require("crypto");
const { DATA_DIR } = require("./store");

const KEY_FILE = path.join(DATA_DIR, "field-key.json");

let keyPromise = null;

async function getKey() {
  if (keyPromise) return keyPromise;

  keyPromise = (async () => {
    if (fs.existsSync(KEY_FILE)) {
      const jwk = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
      return webcrypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"],
      );
    }

    const key = await webcrypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    const jwk = await webcrypto.subtle.exportKey("jwk", key);
    fs.writeFileSync(KEY_FILE, JSON.stringify(jwk), { mode: 0o600 });
    fs.chmodSync(KEY_FILE, 0o600); // belt-and-suspenders if umask overrode mode above
    return key;
  })();

  return keyPromise;
}

function toBase64(buf) {
  return Buffer.from(buf).toString("base64");
}

function fromBase64(b64) {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

async function encryptField(plaintext) {
  const key = await getKey();
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

async function decryptField(field) {
  const key = await getKey();
  const iv = fromBase64(field.iv);
  const ciphertext = fromBase64(field.ciphertext);
  const plaintext = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

module.exports = { encryptField, decryptField, KEY_FILE };
