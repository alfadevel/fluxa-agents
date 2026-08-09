# fluxa-agents

Catalogo pubblico **agent pack Fluxa** (formato `.fluxa-agent` v1, DEC-012/013).

Repo standalone target: [`fluxa-ai/fluxa-agents`](https://github.com/fluxa-ai/fluxa-agents).

## Layout

```
fluxa-agents/
├── index.json                 # catalogo listing (downloadUrl → mirror getfluxa.it, F03)
├── schemas/                   # JSON Schema manifest + index
├── agents/{packageId}/
│   ├── manifest.json          # metadata + integrity (stesso schema del pack)
│   ├── README.md              # istruzioni install/configure (SPDX)
│   └── pack.fluxa-agent       # ZIP firmato Ed25519
├── scripts/
│   ├── validate-pack.mjs      # CI runner (schema, secret scan, sha256, firma)
│   └── build-seed-packs.mjs   # rigenera seed template (maintainer)
└── .github/workflows/
    └── validate-pack.yml
```

## Template curati (seed)

| packageId | Descrizione |
|-----------|-------------|
| `com.alfaservice.support-rag-v1` | Supporto RAG + Jira |
| `com.alfaservice.pm-breakdown-v1` | PM breakdown ANALISI |
| `com.alfaservice.developer-jira-v1` | Developer Jira + Cursor |

## Validazione locale

```bash
npm run build:seeds   # solo maintainer — rigenera pack + index
npm run validate      # valida index + tutti i pack
npm run validate:self-test  # include test AC-4/AC-9 negativi
```

## Contribuire un nuovo pack

1. Fork del repo (post-publish remoto).
2. Aggiungi directory `agents/{packageId}/` con:
   - `manifest.json` (schema v1, firma Ed25519 valida)
   - `pack.fluxa-agent` (ZIP con `manifest.json` + file tree)
   - `README.md` (licenza SPDX + istruzioni install)
3. Aggiorna `index.json` (entry con `downloadUrl` placeholder getfluxa.it).
4. Apri PR — usa il template **agent-pack**.
5. CI `validate-pack` deve passare (secret scan + firma + sha256).

### Firma pack

Usa la stessa pubkey bundled di `@fluxa/core` (`BUNDLED_AGENT_PACK_PUBLIC_KEY_PEM`).
In dev/test: `FLUXA_AGENT_PACK_DEV_SIGN=1` + export da Fluxa ops, oppure `scripts/build-seed-packs.mjs` come riferimento.

### Cosa NON includere

- `.env`, valori secret, API keys
- `config/accounts.yaml` con credential
- `runtimedata/**`, path assoluti tenant-specific

## Publish remoto (passo umano)

**Stato attuale:** il catalogo è già pubblico su GitHub come [`alfadevel/fluxa-agents`](https://github.com/alfadevel/fluxa-agents) (2 commit su `main`). Il clone locale ha `origin` puntato al target dichiarato **`fluxa-ai/fluxa-agents`** (DEC-036); il push verso quella org non è ancora avvenuto.

**Checklist pre-push verso `fluxa-ai/fluxa-agents`:**

1. Creare l'organizzazione GitHub **`fluxa-ai`** (se non esiste) e il repo **`fluxa-ai/fluxa-agents`** (vuoto o con README minimo).
2. Verificare il remote locale: `git remote -v` → `https://github.com/fluxa-ai/fluxa-agents.git` (o equivalente SSH).
3. Verificare assenza di secret nel working tree (`npm run validate` include secret scan).
4. Eseguire il push: `git push -u origin main`.

**Repo `alfadevel/fluxa-agents` esistente** — decisione umana (fuori scope codice):

- **Mantenere** come mirror/storico (eventualmente aggiornare README con link a `fluxa-ai/fluxa-agents`).
- **Archiviare** su GitHub dopo il push su `fluxa-ai`.
- **Reindirizzare** i link pubblici (README, issue tracker) verso il nuovo repo.

Mirror su getfluxa.it (`public/agents/`) — feature F03, fuori scope qui.

## Riferimenti

- DEC-013 — catalogo GitHub-hosted
- F01 `@fluxa/core` — `src/integrations/agent-pack/`
- F03 — sync mirror fluxa-site
