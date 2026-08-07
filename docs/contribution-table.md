# A4 Contribution Table - Group 28

## Approval

| | |
|---|---|
| Has the presentation and system been approved by the supervisor/client? | **YES** |
| Supervisor | Dr John Le |
| Client / sponsor | Anthony Autore |
| Confirmed | Prior to A4 submission, 07 August 2026 |

## Build contributions (A4 phase)

Accountability areas follow the split agreed with the supervisor (June email).

| Member | Accountability area | A4 contribution (confirmed) | Sign |
|---|---|---|---|
| Nico | Overall coordination, core architecture, semantic security | Infrastructure + deployment, backend hardening (RBAC), semantic guard logic, frontend dashboard skeleton | N.V. |
| Daniel | Backend logic, database models, system behaviour | Postgres/SQLAlchemy models, risk classifier, rate limiting, agent registry CRUD, audit verification | D.T. |
| Sai | Testing, rule configuration, live monitoring | Policy rules config, WS dashboard charts (recharts), automated test suite for engines | S.M. |
| Allan | Immutability, human-in-the-loop flows, UI refinement | SHA-256 audit log chaining, approval queue, policy engine conditions, frontend settings and reports screens | A.J. |

## Research and planning contributions (A1-A2 phase)

Group 28 has six members. The four above carried the A4 build; the two below
did the research and planning the build was specified from. Their areas are as
recorded in the A2 report contribution table, and the requirements they wrote
are the ones the RTM traces against.

| Member | Accountability area | Contribution |
|---|---|---|
| Peter | Security and compliance | Security and compliance requirements, policy engine documentation, non-functional requirements, Commonwealth privacy regulation research |
| Roland | Branding and presentation, tools | Branding section and style direction, document formatting and colour consistency, glossary, appendices, conclusion, tools selection, local development and repository structure, branching strategy |

Splitting the table this way rather than merging the two groups is deliberate.
It shows who wrote which part of the system honestly, without dropping members
who contributed earlier in the project.

Presentation delivery: Nico presents. The A4 marking sheet scores presentation
structure and content, not how the speaking is divided up.


## Final Sprint (July 25 - August 7)
Note: Following the finalization of this table, Nico completed a solo final sprint to wrap up the remaining architectural work before submission. This included implementing the condition parser (recursive-descent tokenizer and 3-valued logic), migrating to bcrypt, implementing the Redis rate limiter, configuring Caddy TLS, proxy-header hardening, and scaffold cleanup.
