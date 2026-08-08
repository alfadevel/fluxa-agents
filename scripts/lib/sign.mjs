/** Port da fluxa-core/src/integrations/agent-pack/sign.ts (F01). */

import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

/** Pubkey bundled — stessa coppia dev/test di fluxa-core. */
export const BUNDLED_AGENT_PACK_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAr39zATHHnPysnjO0Itdc/YF4yfXV/OC0rBr7yP0zicw=
-----END PUBLIC KEY-----`;

/** Chiave dev per seed pack curati (coppia con pubkey bundled). */
export const DEV_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIJ/X5pVwZsEn+b+ml4bxCcHmRpM/KobUlVp5HyGDQEcv
-----END PRIVATE KEY-----`;

export function manifestSigningPayload(manifest) {
  return Buffer.from(JSON.stringify(manifest), "utf8");
}

export function signAgentPackManifest(manifest, privateKeyPem = DEV_PRIVATE_KEY_PEM) {
  const key = createPrivateKey(privateKeyPem);
  const sig = sign(null, manifestSigningPayload(manifest), key);
  return sig.toString("base64");
}

export function verifyAgentPackManifest(
  manifest,
  publicKeyPem = BUNDLED_AGENT_PACK_PUBLIC_KEY_PEM,
) {
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
