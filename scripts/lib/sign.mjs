/** Port da fluxa-core/src/integrations/agent-pack/sign.ts (F05/F06). */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";

/** Pubkey bundled — stessa coppia dev/test di fluxa-core. */
export const BUNDLED_AGENT_PACK_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAZx7xqsy7/Ly1BoTCHNnXcFXlAx2xIFLdzJE2ptkDJ7k=
-----END PUBLIC KEY-----`;

let cachedDevKeyPair = null;

function generateEphemeralKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
}

function getOrCreateDevKeyPair() {
  if (!cachedDevKeyPair) {
    cachedDevKeyPair = generateEphemeralKeyPair();
  }
  return cachedDevKeyPair;
}

function decodeSigningKeyFromEnv(raw) {
  if (raw.includes("BEGIN PRIVATE KEY")) return raw;
  return Buffer.from(raw, "base64").toString("utf8");
}

export function resolveSigningPrivateKeyPem() {
  const fromEnv = process.env.FLUXA_AGENT_PACK_SIGNING_KEY?.trim();
  if (fromEnv) {
    return decodeSigningKeyFromEnv(fromEnv);
  }
  if (process.env.NODE_ENV === "production") {
    return null;
  }
  if (process.env.NODE_ENV === "test" || process.env.FLUXA_AGENT_PACK_DEV_SIGN === "1") {
    return getOrCreateDevKeyPair().privateKeyPem;
  }
  return null;
}

function signingKeyMissingError() {
  if (process.env.NODE_ENV === "production") {
    return new Error(
      "NODE_ENV=production: FLUXA_AGENT_PACK_SIGNING_KEY obbligatoria per firmare l'export pack",
    );
  }
  return new Error(
    "FLUXA_AGENT_PACK_SIGNING_KEY assente — impostare la chiave PEM/base64 o FLUXA_AGENT_PACK_DEV_SIGN=1 (solo dev/test)",
  );
}

export function manifestSigningPayload(manifest) {
  return Buffer.from(JSON.stringify(manifest), "utf8");
}

export function signAgentPackManifest(manifest, privateKeyPem) {
  const pem = privateKeyPem ?? resolveSigningPrivateKeyPem();
  if (!pem) {
    throw signingKeyMissingError();
  }
  const key = createPrivateKey(pem);
  const sig = sign(null, manifestSigningPayload(manifest), key);
  return sig.toString("base64");
}

function verifyManifestWithPublicKey(manifest, publicKeyPem) {
  try {
    const { signature, ...unsigned } = manifest;
    if (!signature?.trim()) return false;
    const key = createPublicKey(publicKeyPem);
    const sigBuf = Buffer.from(signature, "base64");
    const payload = manifestSigningPayload(unsigned);
    return verify(null, payload, key, sigBuf);
  } catch {
    return false;
  }
}

export function verifyAgentPackManifest(manifest, publicKeyPem) {
  if (publicKeyPem !== undefined) {
    return verifyManifestWithPublicKey(manifest, publicKeyPem);
  }
  if (verifyManifestWithPublicKey(manifest, BUNDLED_AGENT_PACK_PUBLIC_KEY_PEM)) {
    return true;
  }
  if (
    process.env.NODE_ENV !== "production" &&
    (process.env.NODE_ENV === "test" || process.env.FLUXA_AGENT_PACK_DEV_SIGN === "1")
  ) {
    return verifyManifestWithPublicKey(manifest, getOrCreateDevKeyPair().publicKeyPem);
  }
  return false;
}
