# PM Breakdown Template

Agent pack Fluxa v1 — project manager con breakdown Jira.

## Licenza

MIT — vedi `manifest.json`.

## Installazione

1. Install via catalog Fluxa o upload `pack.fluxa-agent`.
2. Abilita manualmente in `config/agents.yaml` dopo review.

## Configurazione post-install

- Configura `config/accounts.yaml` (Jira + Cursor read-only).
- Adatta `config/project-map.yaml` con i repo del tenant.
- Label Jira `ANALISI` sulle issue da processare.
- Verifica JQL assignee e timezone nel profilo.
