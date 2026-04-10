---
name: Project paths, deployment, and infrastructure reference
description: All file paths, deployment commands, API keys, Vercel config, and infrastructure details for Directive CRM
type: reference
---

## Infrastructure Reality
**Kali is the data vault and private server.** The folder path `~/Kali/` is not just a directory name — Kali Linux IS the machine that owns the infrastructure. Hughes Technologies lives inside Kali. The long-term architecture is: Kali hosts the app, holds the database (IDR/IDV), runs the MCP, and serves the product directly via its own internet connection and domain. Vercel and GitHub are temporary scaffolding — not permanent dependencies. The goal is Kali serves everything independently.

## User's Machine Folder Structure
**User's Mac username is `brandonhughes`. Actual workspace is in Kali/Hughes Technologies/Apps/Claude:**

- **DirectiveCrm (new Next.js app)**:
  ```
  /Users/brandonhughes/Kali/Hughes Technologies/Apps/Claude/DirectiveCrm/
  ```
  Short form: `~/Kali/Hughes Technologies/Apps/Claude/DirectiveCrm/`

- **directive crm (old HTML app)**:
  ```
  /Users/brandonhughes/Kali/Hughes Technologies/Apps/Claude/directive crm/
  ```
  Short form: `~/Kali/Hughes Technologies/Apps/Claude/directive crm/`

(Old incorrect path was `~/Documents/Claude/Projects/` — that base path does NOT exist. The actual base is `~/Kali/Hughes Technologies/Apps/Claude/`)

## Confirmed Deploy Commands

### DirectiveCrm (new Next.js app)
```
cd "/Users/brandonhughes/Kali/Hughes Technologies/Apps/Claude/DirectiveCrm" && git add -A && git commit -m "deploy" && git push origin main
```

### directive crm (old HTML app)
```
cd "/Users/brandonhughes/Kali/Hughes Technologies/Apps/Claude/directive crm/_deploy_ready" && vercel deploy --prod --yes
```
Or double-click `DEPLOY.command` in Finder — it uses `cd "$(dirname "$0")"` so it always runs from the right folder.

## Key File Locations (User's Mac paths)
- **Main app HTML**: `~/Documents/directive crm/Directive_CRM_Desktop_Prototype.html`
- **API functions**: `~/Documents/directive crm/api/` (claude.js, openai.js, grok.js, grok-voice-token.js)
- **Vercel config**: `~/Documents/directive crm/vercel.json`
- **Deploy script**: `~/Documents/directive crm/DEPLOY.command` (double-click to deploy)
- **Backup deploy folder**: `~/Documents/directive crm/_deploy_ready/` (redundant copy, root is deployable)
- **Landing page**: `~/Documents/directive crm/landing-page.html`
- **Demo video**: `~/Documents/directive crm/demo-video.mp4`
- **Logo (old)**: `~/Documents/directive crm/directive.png`
- **Logo (transparent, needed)**: `~/Documents/directive crm/logo-transparent.png`

## Deployment

### Method 1: Double-click (easiest for user)
Double-click `DEPLOY.command` in Finder → it runs `vercel deploy --prod` automatically.

### Method 2: Terminal command
```
cd ~/Documents/"directive crm" && vercel deploy --prod
```

### Method 3: From _deploy_ready subfolder
```
cd ~/Documents/"directive crm"/_deploy_ready && vercel deploy --prod
```

## Vercel Project Info
- **Project ID**: `prj_9pi4Ux6kbaXu5WbOGUv89kRAidLe`
- **Project name**: `directive-crm`
- **Team/Org ID**: `team_zZAOxlRJSlUJtqghDjvpuTAK`
- **Username**: `mazeratirecords-6922`
- **Email**: `mazeratirecords@gmail.com`
- **Git repo**: Connected, main branch, commit sha `50858e4`

## Live URLs
- **Production (custom domain)**: `https://www.directivecrm.com`
- **Vercel URL**: `https://directive-crm.vercel.app`
- **Latest deploy**: `https://directive-iqe3vcrfn-mazeratirecords-6922s-projects.vercel.app`

## API Keys (stored in Vercel env vars)
- **Anthropic (Claude)**: Set in Vercel dashboard → Environment Variables → `ANTHROPIC_API_KEY`
- **Working Claude model**: `claude-haiku-4-5-20251001` (claude-sonnet-4-6 returns 400)
- **OpenAI, Grok, Google Maps**: Stored in app's localStorage on client side

## Architecture
- Single HTML file app (~8400 lines) with inline CSS/JS
- Vercel serverless functions as API proxies (in /api/)
- vercel.json rewrites all routes to the HTML file
- localStorage as database for contacts, sweep history, proposals, crews, insurance contacts

## CRITICAL RULE
Never ask the user for paths, commands, or technical details. The user is not a coder. Always provide exact copy-paste commands in code boxes. Reference this file for all path/deployment info.
