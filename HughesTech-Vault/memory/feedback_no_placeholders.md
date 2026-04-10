---
name: Zero placeholder data policy
description: NEVER use placeholder/fake data in any form — no fake names, 555 numbers, example.com emails, fake addresses. Return null/undefined instead.
type: feedback
---

NEVER use placeholder or fake data anywhere in the Directive CRM app or any work for this user.

**Why:** User missed business meetings and a launch deadline because placeholder data made the app unusable. This is a critical business impact — fake data is worse than no data. The user explicitly stated: "undefined is far more effective for me than a fake name or a fake number."

**How to apply:**
- NO fake names (John Smith, John Doe, Jane Doe, Sarah Johnson, etc.)
- NO 555 phone numbers ever
- NO @example.com emails ever
- NO "123 Main St" or any fabricated addresses
- NO hardcoded demo data arrays that render to users
- If a data field cannot be populated from a verified source (county GIS, NOAA, localStorage, user input), show null/undefined/dash — NEVER a made-up value
- AI prompts must explicitly instruct "return null for any field you cannot verify"
- This applies to ALL future work, not just the CRM app
