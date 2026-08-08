#!/usr/bin/env node
/**
 * CI runner — valida index.json e pack .fluxa-agent nel repo.
 * AC-4: verify firma Ed25519 + sha256 coerenti.
 * AC-9: reject secret / signature invalid.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertValidIndex, assertValidManifest } from "./lib/schema.mjs";
import {
  collectScanIssues,
  getBlockingScanIssues,
  isDeniedPackPath,
  validatePackEntryPath,
} from "./lib/sanitize.mjs";
import { verifyAgentPackManifest } from "./lib/sign.mjs";
import { AgentPackZipError, unzipBuffer } from "./lib/zip.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listAgentPackDirs() {
  const agentsDir = path.join(REPO_ROOT, "agents");
  if (!fs.existsSync(agentsDir)) return [];
  return fs
    .readdirSync(agentsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(agentsDir, d.name));
}

function verifyPackIntegrity(manifest, files) {
  if (!verifyAgentPackManifest(manifest)) {
    throw new Error("Firma manifest non valida o pack manomesso");
  }

  for (const entry of manifest.files) {
    validatePackEntryPath(entry.path);
    if (isDeniedPackPath(entry.path)) {
      throw new Error(`File denylist nel manifest: ${entry.path}`);
    }
    const buf = files.get(entry.path);
    if (!buf) {
      throw new Error(`File mancante nel pack: ${entry.path}`);
    }
    const hash = sha256Hex(buf);
    if (hash.toLowerCase() !== entry.sha256.toLowerCase()) {
      throw new Error(`SHA256 non coerente per ${entry.path}`);
    }
  }

  const textFiles = new Map();
  for (const entry of manifest.files) {
    const buf = files.get(entry.path);
    if (!buf) continue;
    if (/\.(ya?ml|md|json|txt)$/i.test(entry.path)) {
      textFiles.set(entry.path, buf.toString("utf8"));
    }
  }
  const blocking = getBlockingScanIssues(collectScanIssues(textFiles));
  if (blocking.length) {
    throw new Error(
      `Scan contenuto fallito: ${blocking.map((b) => b.code).join(", ")}`,
    );
  }
}

function validatePackDir(dirPath) {
  const packageId = path.basename(dirPath);
  const manifestPath = path.join(dirPath, "manifest.json");
  const packPath = path.join(dirPath, "pack.fluxa-agent");
  const readmePath = path.join(dirPath, "README.md");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`${packageId}: manifest.json mancante`);
  }
  if (!fs.existsSync(packPath)) {
    throw new Error(`${packageId}: pack.fluxa-agent mancante`);
  }
  if (!fs.existsSync(readmePath)) {
    throw new Error(`${packageId}: README.md mancante (SPDX + install)`);
  }

  const manifest = readJson(manifestPath);
  assertValidManifest(manifest);
  if (manifest.packageId !== packageId) {
    throw new Error(
      `${packageId}: packageId manifest (${manifest.packageId}) != directory`,
    );
  }

  const packBuf = fs.readFileSync(packPath);
  const packSha = sha256Hex(packBuf);
  let files;
  try {
    files = unzipBuffer(packBuf);
  } catch (err) {
    const msg = err instanceof AgentPackZipError ? err.message : String(err);
    throw new Error(`${packageId}: ZIP non valido — ${msg}`);
  }

  const zipManifestBuf = files.get("manifest.json");
  if (!zipManifestBuf) {
    throw new Error(`${packageId}: manifest.json assente nel ZIP`);
  }
  const zipManifest = JSON.parse(zipManifestBuf.toString("utf8"));
  if (JSON.stringify(zipManifest) !== JSON.stringify(manifest)) {
    throw new Error(
      `${packageId}: manifest.json tree != manifest.json nel pack.fluxa-agent`,
    );
  }

  verifyPackIntegrity(manifest, files);

  const license = String(manifest.license ?? "");
  if (!license.trim()) {
    throw new Error(`${packageId}: license SPDX mancante nel manifest`);
  }

  return { packageId, packSha, manifest };
}

function validateIndex(packResults) {
  const indexPath = path.join(REPO_ROOT, "index.json");
  if (!fs.existsSync(indexPath)) {
    throw new Error("index.json mancante");
  }
  const index = readJson(indexPath);
  assertValidIndex(index);

  const byPackage = new Map(packResults.map((p) => [p.packageId, p]));
  for (const entry of index.agents) {
    const pack = byPackage.get(entry.packageId);
    if (!pack) {
      throw new Error(`index.json: entry ${entry.packageId} senza directory agents/`);
    }
    if (entry.version !== pack.manifest.version) {
      throw new Error(
        `index ${entry.packageId}: version ${entry.version} != manifest ${pack.manifest.version}`,
      );
    }
    if (entry.sha256.toLowerCase() !== pack.packSha.toLowerCase()) {
      throw new Error(`index ${entry.packageId}: sha256 non coerente con pack.fluxa-agent`);
    }
    if (entry.signature !== pack.manifest.signature) {
      throw new Error(`index ${entry.packageId}: signature non coerente con manifest`);
    }
  }

  for (const p of packResults) {
    if (!index.agents.some((e) => e.packageId === p.packageId)) {
      throw new Error(`agents/${p.packageId} non presente in index.json`);
    }
  }
}

function runSelfTest() {
  const failures = [];

  const good = listAgentPackDirs()[0];
  if (!good) {
    throw new Error("self-test: nessun pack seed nel repo");
  }
  const goodManifest = readJson(path.join(good, "manifest.json"));
  const tampered = { ...goodManifest, signature: Buffer.from("bad").toString("base64") };
  if (verifyAgentPackManifest(tampered)) {
    failures.push("AC-4: firma invalida accettata");
  }

  const secretContent = "token: sk-abcdefghijklmnopqrstuvwxyz1234567890";
  const secretIssues = getBlockingScanIssues(
    collectScanIssues(new Map([["agent/evil.yaml", secretContent]])),
  );
  if (!secretIssues.some((i) => i.code.startsWith("secret_"))) {
    failures.push("AC-9: secret nel contenuto non rilevato");
  }

  if (failures.length) {
    throw new Error(`self-test fallito:\n${failures.join("\n")}`);
  }
  console.log("self-test AC-4/AC-9: OK");
}

function main() {
  const selfTest = process.argv.includes("--self-test");
  const errors = [];

  try {
    const packResults = [];
    for (const dir of listAgentPackDirs()) {
      try {
        const result = validatePackDir(dir);
        packResults.push(result);
        console.log(`OK  agents/${result.packageId}`);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
        console.error(`FAIL agents/${path.basename(dir)}: ${errors.at(-1)}`);
      }
    }

    if (errors.length === 0) {
      try {
        validateIndex(packResults);
        console.log("OK  index.json");
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
        console.error(`FAIL index.json: ${errors.at(-1)}`);
      }
    }

    if (selfTest && errors.length === 0) {
      runSelfTest();
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    console.error(`FAIL: ${errors.at(-1)}`);
  }

  if (errors.length) {
    process.exitCode = 1;
    console.error(`\nvalidate-pack: ${errors.length} errori`);
  } else {
    console.log("\nvalidate-pack: tutti i controlli passati");
  }
}

main();
