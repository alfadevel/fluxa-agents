/** @typedef {{ path: string; sha256: string }} AgentPackFileEntry */

export const AGENT_PACK_SCHEMA_VERSION = 1;

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function isValidSemver(version) {
  return SEMVER_RE.test(String(version).trim());
}

export function isValidPackageId(packageId) {
  const id = String(packageId).trim();
  if (!id || id.length > 128) return false;
  return /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(id);
}

/**
 * @param {Record<string, unknown>} manifest
 */
export function assertValidManifest(manifest) {
  if (manifest.schemaVersion !== AGENT_PACK_SCHEMA_VERSION) {
    throw new Error(
      `schemaVersion non supportata: ${manifest.schemaVersion} (attesa ${AGENT_PACK_SCHEMA_VERSION})`,
    );
  }
  if (!isValidPackageId(String(manifest.packageId ?? ""))) {
    throw new Error(`packageId non valido: ${manifest.packageId}`);
  }
  const agentId = String(manifest.agentId ?? "");
  if (!agentId.trim() || !/^[a-z0-9][a-z0-9_-]*$/i.test(agentId)) {
    throw new Error(`agentId non valido: ${manifest.agentId}`);
  }
  if (!isValidSemver(String(manifest.version ?? ""))) {
    throw new Error(`version semver non valida: ${manifest.version}`);
  }
  if (!String(manifest.minCoreVersion ?? "").trim()) {
    throw new Error("minCoreVersion obbligatorio");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("files[] obbligatorio e non vuoto");
  }
  for (const f of manifest.files) {
    if (!f.path || !f.sha256 || !/^[a-f0-9]{64}$/i.test(f.sha256)) {
      throw new Error(`entry files non valida: ${f.path}`);
    }
  }
  if (!String(manifest.signature ?? "").trim()) {
    throw new Error("signature obbligatoria");
  }
}

/**
 * @param {Record<string, unknown>} index
 */
export function assertValidIndex(index) {
  if (index.schemaVersion !== 1) {
    throw new Error(`index schemaVersion attesa 1, trovata ${index.schemaVersion}`);
  }
  if (!String(index.catalogVersion ?? "").trim()) {
    throw new Error("catalogVersion obbligatorio");
  }
  if (!String(index.updatedAt ?? "").trim()) {
    throw new Error("updatedAt obbligatorio");
  }
  if (!Array.isArray(index.agents)) {
    throw new Error("agents[] obbligatorio");
  }
  for (const entry of index.agents) {
    if (!isValidPackageId(String(entry.packageId ?? ""))) {
      throw new Error(`index entry packageId non valido: ${entry.packageId}`);
    }
    if (!String(entry.title ?? "").trim()) {
      throw new Error(`index entry title mancante per ${entry.packageId}`);
    }
    if (!String(entry.version ?? "").trim() || !isValidSemver(String(entry.version))) {
      throw new Error(`index entry version non valida per ${entry.packageId}`);
    }
    if (!String(entry.downloadUrl ?? "").trim()) {
      throw new Error(`index entry downloadUrl mancante per ${entry.packageId}`);
    }
    if (!String(entry.sha256 ?? "").trim() || !/^[a-f0-9]{64}$/i.test(String(entry.sha256))) {
      throw new Error(`index entry sha256 non valido per ${entry.packageId}`);
    }
  }
}
