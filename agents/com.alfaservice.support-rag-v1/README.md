# Support RAG Template

Agent pack Fluxa v1 — supporto tecnico con RAG documentazione.

## Licenza

MIT — vedi `manifest.json`.

## Installazione

1. In Fluxa Console → Ops → Agents → **Install from catalog** (F04) oppure upload `pack.fluxa-agent`.
2. Post-install l'agente resta **disabled** finché non lo abiliti in `config/agents.yaml`.

## Configurazione post-install

- Configura `config/accounts.yaml` (Jira, Cursor se necessario).
- Crea collection RAG `support` e documentazione in `config/support-docs.yaml`.
- Copia `config/support-rules.md` dal pack o adatta `rulesFile` nel profilo.
- Imposta assignee Jira nel profilo (`{{tenant.jira.assignee}}` → utente reale).
- Abilita l'agente nel registry e verifica `npm run support:once`.
