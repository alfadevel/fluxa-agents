#!/usr/bin/env node
/**
 * Genera seed pack curati (Support RAG, PM breakdown, Developer Jira).
 * Contenuto sanitizzato post-F01 — placeholder {{tenant.*}} al posto di path/assignee reali.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_PACK_SCHEMA_VERSION } from "./lib/schema.mjs";
import { signAgentPackManifest } from "./lib/sign.mjs";
import { zipEntries } from "./lib/zip.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function sha256Hex(content) {
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  return createHash("sha256").update(buf).digest("hex");
}

const PROJECT_MAP_TEMPLATE = `# Mappa workspace — configura i path del tenant
workspaces:
  - id: main
    label: Workspace principale
    repos:
      - id: app
        path: "{{tenant.path}}/app"
        default: true
        jiraProjectKey: "{{tenant.jira.projectKey}}"
`;

const SUPPORT_RULES = `# Regole agente supporto tecnico (template)

Sei un agente di **assistenza tecnica**. Rispondi alle domande **solo** in base alla documentazione RAG.

## Vincoli

1. **Non inventare**: se la documentazione non copre la domanda, dillo esplicitamente.
2. **Cita le fonti**: ogni voce con \`(file, via RAG)\` o \`(RAG)\`.
3. **Lingua**: rispondi nella stessa lingua della domanda.
4. **Tono**: professionale, chiaro, orientato alla soluzione.

## Tool RAG

Usa \`rag_search\` solo se il contesto iniziale non basta.
`;

const PM_RULES = `# Regole agente PM (template)

Analizza **una sola issue Jira** con label \`ANALISI\`, esplora il codebase in **sola lettura** e produci JSON strutturato.

## Vincoli

- **Sola lettura**: niente branch, commit, push.
- Non creare issue Jira: lo fa l'orchestratore dopo la tua risposta.
- Usa \`{{tenant.jira.assignee}}\` come riferimento assignee nel JQL del tenant.

## Formato risposta

Rispondi solo con JSON valido (breakdown Story/Sottotask).
`;

const DEV_RULES = `# Regole agente Developer (template)

Regole operative per sessione Cursor locale sul repo di lavoro.

## Scope

- Lavora **solo** sul ticket indicato nel prompt.
- Un ticket per sessione: diff minimo mirato al ticket.
- **Vietato**: modificare submodule o cartelle \`Core\` / \`ServiceStackCommon\`.

## Git

Allinea il repo (fetch + pull branch base) prima di implementare.
`;

const SEEDS = [
  {
    packageId: "com.alfaservice.support-rag-v1",
    agentId: "support-rag-template",
    version: "1.0.0",
    apiVersion: "fluxa/v1",
    kind: "SupportProfile",
    title: "Supporto RAG documentazione",
    description:
      "Template supporto tecnico — ticket Jira → RAG documentazione → risposta con fonti.",
    license: "MIT",
    tags: ["support", "rag", "jira"],
    npmScript: "support:once",
    requires: ["accounts.jira", "rag.collection support"],
    profile: `apiVersion: fluxa/v1
kind: SupportProfile
metadata:
  id: support-rag-template
  displayName: Support RAG Template
  prettyName: Supporto RAG
  description: Supporto tecnico — ticket Jira → RAG documentazione → risposta

accountsFile: ./config/accounts.yaml
rulesFile: ./config/support-rules.md
supportDocsConfig: ./config/support-docs.yaml
stateFile: ./runtimedata/{{agent.id}}-state.yaml
lockFile: ./runtimedata/{{agent.id}}.lock

schedule:
  intakeCron: "*/15 * * * *"
  timezone: Europe/Rome

jira:
  pollJql: 'assignee = "{{tenant.jira.assignee}}" AND statusCategory != Done ORDER BY created ASC'
  comments:
    onStart: true
    onBlocked: true
    onComplete: true
  statusOnStart: "In corso"
  statusOnDone: "Fatto"

rag:
  collections:
    - support
  topK: 8
  minScore: 0.25
  autoIngestOnRun: false

guards:
  requireSources: true
  humanReviewRequired: true

channels:
  jira:
    enabled: true
    mode: poll
  mail:
    enabled: false
  telegram:
    enabled: false

features:
  memory: true
  skills: true
  rag: true
`,
    rulesFile: { path: "rules/support-rules.md", content: SUPPORT_RULES },
    registryFragment: {
      description: "Supporto tecnico — ticket Jira → RAG documentazione → risposta",
      schedule: "*/15 * * * *",
      npmScript: "support:once",
      requires: ["accounts.jira", "rag.collection support"],
    },
    readme: `# Support RAG Template

Agent pack Fluxa v1 — supporto tecnico con RAG documentazione.

## Licenza

MIT — vedi \`manifest.json\`.

## Installazione

1. In Fluxa Console → Ops → Agents → **Install from catalog** (F04) oppure upload \`pack.fluxa-agent\`.
2. Post-install l'agente resta **disabled** finché non lo abiliti in \`config/agents.yaml\`.

## Configurazione post-install

- Configura \`config/accounts.yaml\` (Jira, Cursor se necessario).
- Crea collection RAG \`support\` e documentazione in \`config/support-docs.yaml\`.
- Copia \`config/support-rules.md\` dal pack o adatta \`rulesFile\` nel profilo.
- Imposta assignee Jira nel profilo (\`{{tenant.jira.assignee}}\` → utente reale).
- Abilita l'agente nel registry e verifica \`npm run support:once\`.
`,
  },
  {
    packageId: "com.alfaservice.pm-breakdown-v1",
    agentId: "pm-breakdown-template",
    version: "1.0.0",
    apiVersion: "fluxa/v1",
    kind: "ProjectManagerProfile",
    title: "PM — analisi e breakdown Jira",
    description:
      "Template project manager — label ANALISI → analisi codebase → breakdown Story/Sottotask Jira.",
    license: "MIT",
    tags: ["pm", "jira", "breakdown"],
    npmScript: "pm:once",
    requires: ["accounts.jira", "accounts.cursor", "config/project-map.yaml"],
    profile: `apiVersion: fluxa/v1
kind: ProjectManagerProfile
metadata:
  id: pm-breakdown-template
  displayName: PM Breakdown Template
  prettyName: Project Manager
  description: PM — label ANALISI → analisi codebase → breakdown Jira

accountsFile: ./config/accounts.yaml
rulesFile: ./config/pm-rules.md
projectMapFile: ./config/project-map.yaml
stateFile: ./runtimedata/{{agent.id}}-state.yaml
lockFile: ./runtimedata/{{agent.id}}.lock

schedule:
  intakeCron: "*/15 * * * *"
  timezone: Europe/Rome
  activeFrom: "08:30"
  activeUntil: "18:00"
  offHoursCron: "0 */2 * * *"

jira:
  pollJql: 'assignee = "{{tenant.jira.assignee}}" AND labels = ANALISI AND statusCategory != Done ORDER BY created ASC'
  intakeLabel: ANALISI
  approvedLabel: ANALISI-APPROVED
  outputLabels:
    - pm-generated
  childIssueTypes:
    story: Story
    task: Sottotask
  assignChildrenToDeveloper: false
  commentFollowUp:
    enabled: true
    agentCommentPrefix: "[pm-template]"
    maxIssuesPerSync: 20
    useLlmClassifier: true
    defaultOnUncertain: reply_only
  statusOnStart: "In corso"
  statusOnDone: "Completato"
  comments:
    onAnalyze: false
    onBlocked: true
    onCreate: true

guards:
  requireMappedWorkspace: true
  humanReviewRequired: false

channels:
  jira:
    enabled: true
    mode: poll
  mail:
    enabled: false
  telegram:
    enabled: false

features:
  memory: true
  skills: true
  rag: false
`,
    rulesFile: { path: "rules/pm-rules.md", content: PM_RULES },
    extraFiles: [{ path: "rules/project-map.yaml", content: PROJECT_MAP_TEMPLATE }],
    registryFragment: {
      description: "PM — label ANALISI → analisi codebase → breakdown story/task Jira",
      schedule: "*/15 * * * *",
      npmScript: "pm:once",
      requires: ["accounts.jira", "config/project-map.yaml"],
    },
    readme: `# PM Breakdown Template

Agent pack Fluxa v1 — project manager con breakdown Jira.

## Licenza

MIT — vedi \`manifest.json\`.

## Installazione

1. Install via catalog Fluxa o upload \`pack.fluxa-agent\`.
2. Abilita manualmente in \`config/agents.yaml\` dopo review.

## Configurazione post-install

- Configura \`config/accounts.yaml\` (Jira + Cursor read-only).
- Adatta \`config/project-map.yaml\` con i repo del tenant.
- Label Jira \`ANALISI\` sulle issue da processare.
- Verifica JQL assignee e timezone nel profilo.
`,
  },
  {
    packageId: "com.alfaservice.developer-jira-v1",
    agentId: "developer-jira-template",
    version: "1.0.0",
    apiVersion: "fluxa/v1",
    kind: "DeveloperProfile",
    title: "Developer — coding da Jira via Cursor",
    description:
      "Template developer AI — ticket Jira assignee → Cursor locale su repo mappati.",
    license: "MIT",
    tags: ["developer", "jira", "cursor"],
    npmScript: "agent:once",
    requires: ["accounts.jira", "accounts.cursor", "CURSOR_API_KEY", "config/project-map.yaml"],
    profile: `apiVersion: fluxa/v1
kind: DeveloperProfile
metadata:
  id: developer-jira-template
  displayName: Developer Jira Template
  prettyName: Developer AI
  description: Developer AI — coding da ticket Jira via Cursor locale

accountsFile: ./config/accounts.yaml
rulesFile: ./config/workflow-rules.md
projectMapFile: ./config/project-map.yaml
queueFile: ./runtimedata/{{agent.id}}-queue.yaml
queueStateFile: ./runtimedata/{{agent.id}}-queue.state.json
lockFile: ./runtimedata/{{agent.id}}.lock

concurrency:
  maxActiveTasks: 1

git:
  branchPrefix: feature/{{agent.id}}/
  requirePushBeforeDone: true
  allowDirectPushToMain: false

schedule:
  intakeCron: "*/15 * * * *"
  timezone: Europe/Rome
  activeFrom: "08:30"
  activeUntil: "18:00"
  offHoursCron: "0 */2 * * *"

jira:
  pollJql: 'assignee = "{{tenant.jira.assignee}}" AND statusCategory != Done AND labels != ANALISI ORDER BY updated ASC'
  commentFollowUp:
    enabled: true
    agentCommentPrefix: "[dev-template]"
    maxIssuesPerSync: 30
    useLlmClassifier: true
    defaultOnUncertain: reply_only
  comments:
    onStart: true
    onPhaseEnd: true
    onBlocked: true
    onComplete: true
  worklog:
    onComplete: true

cursor:
  states:
    - queued
    - resolving_workspace
    - blocked_no_workspace
    - planning
    - implementing
    - validating
    - pushing
    - awaiting_human_review
    - rework_requested
    - complete
    - blocked
    - failed
  resumableStates:
    - planning
    - implementing
    - validating
    - pushing

guards:
  requireMappedRepos: true
  skipIfBlockedNoWorkspace: true
  humanReviewRequired: false

channels:
  jira:
    enabled: true
    mode: poll
  mail:
    enabled: false
  telegram:
    enabled: false

features:
  memory: true
  skills: true
  rag: false
`,
    rulesFile: { path: "rules/workflow-rules.md", content: DEV_RULES },
    extraFiles: [{ path: "rules/project-map.yaml", content: PROJECT_MAP_TEMPLATE }],
    registryFragment: {
      description: "Sviluppo — Jira assignee → Cursor locale su repo",
      schedule: "*/15 * * * *",
      npmScript: "agent:once",
      requires: ["accounts.jira", "accounts.cursor", "CURSOR_API_KEY"],
    },
    readme: `# Developer Jira Template

Agent pack Fluxa v1 — developer con integrazione Jira + Cursor.

## Licenza

MIT — vedi \`manifest.json\`.

## Installazione

1. Install via catalog Fluxa o upload \`pack.fluxa-agent\`.
2. Abilita manualmente in \`config/agents.yaml\` dopo review.

## Configurazione post-install

- \`config/accounts.yaml\`: Jira + Cursor.
- \`.env\`: \`CURSOR_API_KEY\` (non incluso nel pack).
- \`config/project-map.yaml\`: mappa repo → path locali.
- \`config/workflow-rules.md\`: regole Cursor (copia da pack se necessario).
- Verifica branch prefix e JQL assignee.
`,
  },
];

function yamlStringify(obj) {
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${item}`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function buildPack(seed) {
  const bundleFiles = new Map();
  bundleFiles.set("agent/profile.yaml", seed.profile);
  bundleFiles.set("agent/registry.fragment.yaml", yamlStringify(seed.registryFragment));
  bundleFiles.set(seed.rulesFile.path, seed.rulesFile.content);
  if (seed.extraFiles) {
    for (const f of seed.extraFiles) {
      bundleFiles.set(f.path, f.content);
    }
  }
  bundleFiles.set("README.md", seed.readme);

  const fileEntries = [...bundleFiles.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rel, content]) => ({
      path: rel,
      sha256: sha256Hex(content),
    }));

  const manifestUnsigned = {
    schemaVersion: AGENT_PACK_SCHEMA_VERSION,
    packageId: seed.packageId,
    agentId: seed.agentId,
    version: seed.version,
    apiVersion: seed.apiVersion,
    kind: seed.kind,
    title: seed.title,
    description: seed.description,
    author: { name: "Alfa Service", orgId: "alfaservice" },
    license: seed.license,
    visibility: "public",
    minCoreVersion: "0.1.0",
    requirements: {
      integrations: seed.tags.includes("rag") ? ["rag", "jira"] : ["jira"],
      env: seed.requires.filter((r) => r.includes(".env") || r === "CURSOR_API_KEY"),
      configRefs: ["accounts.jira", "accounts.cursor"],
      npmScript: seed.npmScript,
      hostWiring: [],
    },
    skillRefs: undefined,
    files: fileEntries,
  };

  const signature = signAgentPackManifest(manifestUnsigned);
  const manifest = { ...manifestUnsigned, signature };

  const zipMap = new Map();
  zipMap.set("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));
  for (const [rel, content] of bundleFiles) {
    zipMap.set(rel, Buffer.from(content, "utf8"));
  }

  const zipParts = [...zipMap.entries()].map(([p, data]) => ({ path: p, data }));
  const buffer = zipEntries(zipParts);

  return { manifest, buffer, seed };
}

function main() {
  const indexAgents = [];

  for (const seed of SEEDS) {
    const { manifest, buffer } = buildPack(seed);
    const dir = path.join(REPO_ROOT, "agents", seed.packageId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    fs.writeFileSync(path.join(dir, "pack.fluxa-agent"), buffer);
    fs.writeFileSync(path.join(dir, "README.md"), seed.readme, "utf8");
    console.log(`built agents/${seed.packageId}`);

    indexAgents.push({
      packageId: seed.packageId,
      agentId: seed.agentId,
      version: seed.version,
      title: seed.title,
      description: seed.description,
      kind: seed.kind,
      tags: seed.tags,
      license: seed.license,
      minCoreVersion: manifest.minCoreVersion,
      downloadUrl: `https://getfluxa.it/agents/${seed.packageId}/${seed.version}/pack.fluxa-agent`,
      sha256: sha256Hex(buffer),
      signature: manifest.signature,
      sourceUrl: `https://github.com/alfadevel/fluxa-agents/tree/main/agents/${seed.packageId}`,
    });
  }

  const index = {
    schemaVersion: 1,
    catalogVersion: "2026.08.1",
    updatedAt: new Date().toISOString(),
    agents: indexAgents,
  };

  fs.writeFileSync(path.join(REPO_ROOT, "index.json"), JSON.stringify(index, null, 2), "utf8");
  console.log("updated index.json");
}

main();
