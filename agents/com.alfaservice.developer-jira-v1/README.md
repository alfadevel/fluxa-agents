# Developer Jira Template

Agent pack Fluxa v1 — developer con integrazione Jira + Cursor.

## Licenza

MIT — vedi `manifest.json`.

## Installazione

1. Install via catalog Fluxa o upload `pack.fluxa-agent`.
2. Abilita manualmente in `config/agents.yaml` dopo review.

## Configurazione post-install

- `config/accounts.yaml`: Jira + Cursor.
- `.env`: `CURSOR_API_KEY` (non incluso nel pack).
- `config/project-map.yaml`: mappa repo → path locali.
- `config/workflow-rules.md`: regole Cursor (copia da pack se necessario).
- Verifica branch prefix e JQL assignee.
