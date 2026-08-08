## Agent pack submission

### Package

- **packageId:** <!-- es. com.example.my-agent-v1 -->
- **version:** <!-- semver es. 1.0.0 -->
- **agentId:** <!-- es. my-agent-template -->
- **license (SPDX):** <!-- es. MIT -->

### Checklist

- [ ] `agents/{packageId}/manifest.json` valido (schema v1)
- [ ] `agents/{packageId}/pack.fluxa-agent` presente e coerente con manifest
- [ ] `agents/{packageId}/README.md` con istruzioni install + licenza
- [ ] `index.json` aggiornato (`downloadUrl` placeholder getfluxa.it ok pre-F03)
- [ ] Nessun secret, path assoluto, `.env`, `accounts.yaml` con valori
- [ ] Firma Ed25519 verificabile con pubkey bundled Fluxa core
- [ ] CI `validate-pack` verde

### Post-install (reviewer)

- [ ] `enabled: false` di default nel fragment registry (Q5)
- [ ] `requirements` / `requires` documentati in README
- [ ] Placeholder `{{tenant.*}}` al posto di assignee/path tenant-specific

### Note

<!-- contesto, dipendenze host, screenshot opzionali -->
