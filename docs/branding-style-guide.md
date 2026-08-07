# Certacito.ai - Branding & Style Guide

A4 appendix. The internal brand for Group 28's Certacito.ai, used across the
product UI, documents and presentations since A1.

## 1. Brand core

- **Name:** Certacito.ai - from Latin *certus* (certain) + *cito* (swiftly).
  Certainty about your AI, fast.
- **Tagline:** *Governed. Auditable. Transparent.*
- **Voice:** calm, factual, compliance-grade. We write like an auditor, not like a
  startup pitch. Numbers over adjectives. No exclamation marks in product copy.
- **Logo:** shield-check mark (see `frontend/src/imports/certacito_logo.png`).
  Wordmark is always lowercase `certacito` with `.ai` in teal.

## 2. Colour system

One job per colour. A colour never doubles up on meanings.

| Role | Name | Hex | Job |
|---|---|---|---|
| Primary | Navy | `#1B3A6B` | Structure: sidebar, headings, primary buttons. Trust. |
| Accent | Teal | `#0D7377` | Active states, links, PERMIT accents, focus rings. |
| Alert | Red | `#C0392B` | Critical risk, DENY, destructive actions. Nothing else. |
| Positive | Green | `#27AE60` | PERMIT badges, healthy status, compliance pass. |
| Warning | Amber | `#E67E22` | Medium/High risk, ESCALATE, SLA warnings. The only amber used in the interface. |
| Chart | Gold | `#F39C12` | Fourth chart series only. Never used for risk or status, so it cannot be confused with ESCALATE. |
| Canvas | Grey | `#F4F6F9` | Page background behind white cards. |
| Ink | Dark navy | `#1A1A2E` | Body text. |

Chart series order: green, teal, navy, gold, red (`--chart-1..5` in
`frontend/src/styles/theme.css` - the CSS variables are the source of truth).

**Accessibility rule (WCAG 2.1 AA):** risk and outcome are never colour-only.
Every badge pairs its colour with a text label; contrast is verified against the
navy/white palette.

## 3. Typography

| Use | A3 spec | Shipped in A4 | Note |
|---|---|---|---|
| UI text | Inter | Arial (system) | Licensing-free, zero font loading on marker machines. |
| System identifiers | JetBrains Mono | Courier New (system) | Rule IDs, hashes, payloads, timestamps - anything the machine wrote. |

The intent carried over: prose in the sans face, machine identifiers in monospace,
so an operator can separate the two at a glance. Weights: 700 for headings and
KPIs, 400 for body.

## 4. Layout and components

- Persistent navy sidebar (220 px) with grouped nav (MAIN / GOVERNANCE / REPORTING)
  and the live policy-engine health strip pinned at the bottom.
- Breadcrumb header per screen: `CERTACITO.AI / SECTION / SCREEN` in letter-spaced
  10-11 px caps.
- Content = white cards on the grey canvas, 1 px `rgba(27,58,107,0.08)` borders,
  6-8 px radii. No drop-shadow soup.
- Badges: pill, 10-11 px bold caps, tinted background of their semantic colour.
- Tables: 10 px letter-spaced grey column headers, expandable detail rows.
- Dark payload panels (`#0F172A`) for masked payloads - terminal look separates
  "evidence" from UI chrome, masked fields highlighted red.

## 5. Document and presentation branding

- Documents: navy H1/H2 with a thin navy rule, teal for sub-accents, the
  header strip `CERTACITO.AI | <doc name> | Group 28 | CSIT321` and the UOW footer
  (see A1/A3 templates).
- Slides: title in navy on white, or white on navy for section breaks; teal accent
  bar; same badge language as the product when showing outcomes.
- Always the group name **Group 28** and the tagline on the title page.
