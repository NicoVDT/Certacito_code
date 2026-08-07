# A4 Contribution Table - Group 28

Accountability areas follow the split agreed with the supervisor (June email).
| Member | Accountability area | A4 contribution (confirmed) | Sign |
|---|---|---|---|
| Nico | Overall coordination, core architecture, semantic security | Infrastructure + deployment, backend hardening (RBAC), semantic guard logic, frontend dashboard skeleton | N.V. |
| Daniel | Backend logic, database models, system behaviour | Postgres/SQLAlchemy models, risk classifier, rate limiting, agent registry CRUD, audit verification | D.T. |
| Sai | Testing, rule configuration, live monitoring | Policy rules config, WS dashboard charts (recharts), automated test suite for engines | S.M. |
| Allan | Immutability, human-in-the-loop flows, UI refinement | SHA-256 audit log chaining, approval queue, policy engine conditions, frontend settings and reports screens | A.J. |

Presentation delivery: Nico presents. The A4 marking sheet scores presentation
structure and content, not how the speaking is divided up.


## Final Sprint (July 25 - August 2)
Note: Following the finalization of this table, Nico completed a solo final sprint to wrap up the remaining architectural work before submission. This included implementing the condition parser (recursive-descent tokenizer and 3-valued logic), migrating to passlib/bcrypt, implementing the Redis rate limiter, configuring Caddy TLS, proxy-header hardening, and scaffold cleanup.
