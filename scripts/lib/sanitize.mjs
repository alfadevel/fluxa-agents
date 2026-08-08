/** Port da fluxa-core/src/integrations/agent-pack/sanitize.ts (F01). */

const SECRET_PATTERNS = [
  {
    code: "secret_api_key",
    re: /\b(sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[a-zA-Z0-9-]{10,})\b/,
    message: "Possibile API key rilevata",
  },
  {
    code: "secret_bearer",
    re: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/i,
    message: "Bearer token rilevato",
  },
  {
    code: "secret_env_assignment",
    re: /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*[^\s#]{8,}\s*$/m,
    message: "Assegnazione variabile ambiente con valore",
  },
  {
    code: "secret_password_field",
    re: /^\s*(?:password|secret|api[_-]?key|token|private[_-]?key)\s*:\s*\S+/im,
    message: "Campo credential con valore in chiaro",
  },
  {
    code: "secret_jwt",
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    message: "Possibile JWT rilevato",
  },
];

const UNIX_ABSOLUTE_PREFIXES =
  "Users|home|opt|var|etc|tmp|srv|root|usr|mnt|media|bin|lib|dev|proc|sys";

const ABSOLUTE_PATH_RE = new RegExp(
  [
    "(?:^[A-Za-z]:[\\\\/]|\\\\\\\\[^\\s'\"]+",
    `|^\\/(?:${UNIX_ABSOLUTE_PREFIXES})(?:\\/|$)`,
    "|(?:^|\\s)\\/(?:[\\w.-]+\\/)+[\\w.-]+",
    "|(?:^|\\s[A-Za-z][\\w.-]{1,}\\s*:\\s*)\\/[^\\s'\"]+)",
  ].join(""),
  "m",
);

const RUNTIMEDATA_RE = /(?:^|[\\/])runtimedata(?:[\\/]|$)/i;
const ACCOUNTS_YAML_VALUE_RE =
  /^\s*(?:password|token|secret|apiKey|clientSecret|refreshToken)\s*:\s*\S+/im;

const DENYLIST_PATH_SEGMENTS = new Set([
  ".env",
  "accounts.yaml",
  "config/accounts.yaml",
  "./config/accounts.yaml",
]);

export function isDeniedPackPath(relPath) {
  const norm = relPath.replace(/\\/g, "/").replace(/^\.?\//, "");
  if (RUNTIMEDATA_RE.test(norm)) return true;
  const base = norm.split("/").pop() ?? "";
  if (base === ".env") return true;
  if (base === "accounts.yaml") return true;
  if (norm.toLowerCase().includes("config/soul.md")) return true;
  return DENYLIST_PATH_SEGMENTS.has(norm);
}

export function scanContentForSecrets(content, relPath) {
  const issues = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const pat of SECRET_PATTERNS) {
      if (pat.re.test(line)) {
        issues.push({
          code: pat.code,
          message: pat.message,
          path: relPath,
          line: i + 1,
        });
      }
    }
    if (ABSOLUTE_PATH_RE.test(line)) {
      issues.push({
        code: "absolute_path",
        message: "Path assoluto rilevato",
        path: relPath,
        line: i + 1,
      });
    }
    if (ACCOUNTS_YAML_VALUE_RE.test(line)) {
      issues.push({
        code: "accounts_secret_value",
        message: "Valore secret in stile accounts.yaml",
        path: relPath,
        line: i + 1,
      });
    }
  }

  return issues;
}

export function validatePackEntryPath(relPath) {
  const raw = relPath.replace(/\\/g, "/");
  if (!raw || raw.includes("\0")) {
    throw new Error(`Path non valido: ${relPath}`);
  }
  if (raw.startsWith("/") || /^[A-Za-z]:\//.test(raw)) {
    throw new Error(`Path assoluto non ammesso: ${relPath}`);
  }
  if (isDeniedPackPath(relPath)) {
    throw new Error(`Path non ammesso nel pack: ${relPath}`);
  }
  const norm = raw.replace(/^\.?\//, "");
  if (!norm || norm.includes("..")) {
    throw new Error(`Path traversal non ammesso: ${relPath}`);
  }
}

export function isBlockingScanIssue(issue) {
  return (
    issue.code.startsWith("secret_") ||
    issue.code === "absolute_path" ||
    issue.code === "accounts_secret_value" ||
    issue.code === "denied_path"
  );
}

export function getBlockingScanIssues(issues) {
  return issues.filter(isBlockingScanIssue);
}

export function collectScanIssues(files) {
  const all = [];
  for (const [rel, content] of files) {
    if (isDeniedPackPath(rel)) {
      all.push({
        code: "denied_path",
        message: "Path in denylist",
        path: rel,
      });
      continue;
    }
    all.push(...scanContentForSecrets(content, rel));
  }
  return all;
}
