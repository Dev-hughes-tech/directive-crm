---
name: Document Sensitivity — What NOT to Include
description: Things to never put in external-facing documents for Directive CRM or Hughes Technologies
type: feedback
---

User shared three Directive CRM documents externally and received detailed critique from Grok and Gemini that exposed internal weaknesses. Lesson: external documents should NOT include:

- Which free public APIs are being used (signals fragility and cost vulnerability)
- The fact that the platform is built on Next.js, Supabase, or Vercel (competitors can clone)
- Specific database schema details
- Which AI models are used or their costs
- What features are "coming soon" vs. shipped (critics will attack unbuilt roadmap items)
- Anything that admits current limitations or what doesn't work yet
- Internal code architecture or single-file structure

**External documents should only discuss:**
- What the product does and why it matters
- Competitive positioning (without admitting our weaknesses)
- Pricing
- Vision and roadmap framed as commitments, not admissions of absence

**How to apply:** Before writing any external-facing document (product summary, pitch deck, one-pager), filter out any implementation details, dependency names, or "future plans" language.
