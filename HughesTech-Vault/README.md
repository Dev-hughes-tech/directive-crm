# HughesTech-Vault

**Owner:** Brandon Hughes / Hughes Technologies
**Location:** Kali Linux — private infrastructure
**Purpose:** Secondary memory and development intelligence hub for Michael AI and all Hughes Technologies products

---

## What This Is

This vault is Michael's second brain on Kali. It exists so that development context, decisions, architecture knowledge, and version history are never lost between sessions — regardless of what cloud service is or isn't available.

Everything here is internal. Hughes Technologies eyes only.

---

## Directory Structure

```
HughesTech-Vault/
├── README.md                    ← this file
├── memory/                      ← all persistent memory files (synced from auto-memory)
│   ├── MEMORY.md                ← master index
│   ├── project_directive_crm.md
│   ├── project_michael_ai.md
│   ├── project_carenow.md
│   ├── feedback_*.md            ← behavioral rules and preferences
│   └── reference_*.md           ← paths, keys, specs
├── sessions/
│   └── session-log.md           ← running log of every dev session
├── deployments/
│   └── version-history.md       ← every deployment commit with description
├── architecture/
│   └── infrastructure-map.md    ← full system architecture, IDR/IDV, stack, products
├── michael-ai/                  ← Michael AI platform docs and specs
└── directive-crm/               ← Directive CRM specific docs and specs
```

---

## How to Keep This Updated

After each session, sync from Mac to Kali:

```bash
cp -r ~/Documents/HughesTech-Vault /Volumes/[KALI-DRIVE-NAME]/HughesTech-Vault
```

Replace `[KALI-DRIVE-NAME]` with whatever name the Kali drive shows as in Finder.

---

## Products Tracked Here

| Product | Status |
|---------|--------|
| Directive CRM | Live — v896379a |
| Michael AI Platform | In development |
| StormScope | Planned |
| CareNow Healthcare | Planned |

---

*This vault is the source of truth for Hughes Technologies internal development.*
*Confidential. Not for external distribution.*
