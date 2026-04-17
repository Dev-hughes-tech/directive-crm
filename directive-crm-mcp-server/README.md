# Directive CRM MCP Server

This MCP server exposes a narrow, audited subset of Directive CRM behaviors to AI agents.

## Capability Boundaries

Verified:
- Geocoding and live weather endpoints
- Shared hail-history and storm-risk retrieval
- Lead scoring from supplied property fields
- Michael chat with server-verified CRM counts and explicitly labeled client session context

Conditionally verified:
- Property research output is only as verified as the upstream sources returned. Permit-backed roof age is trustworthy when the response explicitly includes a permit date or source trail.
- Permit counts can be `null` when no authoritative permit total was confirmed.

Unverified or unsupported:
- Do not claim that every researched property has a verified roof age.
- Do not claim that Michael has omniscient access to every browser-side dashboard metric.
- Do not claim durable access to every CRM document/photo workflow unless the backing API path is implemented.

## Setup

```bash
npm install
npm run build
```

Use the built `dist/index.js` with your MCP host.

## Tooling Expectations

- `directive_research_property` returns researched property data, but downstream consumers must respect `null` or source-limited fields.
- `directive_get_hail_events` and storm-risk tools use the shared severe-hail threshold from the app.
- `directive_ask_michael` should be described as mixing server-verified CRM counts with clearly labeled unverified session context when present.

## Operator Guidance

- Bias toward narrower claims when a field is estimated, missing, or source-limited.
- Prefer the JSON response mode if another system needs to distinguish verified from unverified fields.
- Re-run audits whenever the underlying Directive CRM routes or truth model change.
