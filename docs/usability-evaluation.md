# Usability Evaluation

A4 appendix. The A3 marking feedback asked for "additional user testing or
usability evaluation", so this document records the evaluation work done for A4
and is honest about its limits. In short: we ran a structured expert review of
the live deployment (a heuristic walkthrough plus a WCAG 2.1 AA audit, run
against the running Azure system on 7 August 2026 with the simulator on), and we
collected feedback from the real people who saw the system along the way. We did
not run formal moderated sessions with recruited participants - section 5 covers
why and what we would do about it in A5.

## 1. Method

Three sources of evidence, in order of rigour:

1. **Heuristic walkthrough.** Both persona journeys from A3 (Compliance Officer
   triage, DevSecOps configuration) walked end-to-end on the live deployment
   against Nielsen's ten heuristics. Every screen visited, every primary action
   exercised, including failure paths (wrong password, empty states).
2. **WCAG 2.1 AA audit.** Contrast ratios computed for every colour pair in the
   branding style guide using the WCAG relative-luminance formula, plus scripted
   checks on the live site (Playwright): keyboard-only navigation of the login,
   focus indicator visibility, error-state messaging, and table semantics for
   screen readers.
3. **Collected feedback.** The unprompted reactions we already had from real
   viewers: the sponsor's A3 review, the supervisor's June email, and visitors
   at the project exhibition. These are catalogued in section 4.

## 2. Issues found

The audit found nine issues. Four were fixed before submission; five remain open
with concrete recommended fixes. Severity is our judgement of user impact.

| ID | Finding | Heuristic / criterion | Severity | Status |
|----|---------|----------------------|----------|--------|
| U-01 | Sign-in crashed on a fresh build (a component read a `user` value that was never passed to it). Found while preparing this evaluation. | Error prevention | High | **Fixed** - and a TypeScript check was added to CI so this class of bug fails the build instead of shipping |
| U-02 | Agent registry showed "0 of 0 agents" while agents were live and reporting | Visibility of system status | Medium | **Fixed** - registry now maps live API data directly |
| U-03 | Compliance score displayed 100% before any traffic existed, which reads as a (false) claim | Match with the real world | Medium | **Fixed** - shows a dash until there is data to score |
| U-04 | Panel titled "Assigned policy rules" actually listed permitted action types | Match with the real world | Low | **Fixed** - renamed |
| U-05 | Permit-green text (`#27AE60`) on white measures 2.87:1, below the 4.5:1 AA minimum for normal text | WCAG 1.4.3 contrast | Medium | Open - recommended `#1E8449` (4.72:1). Partly mitigated by the design rule that outcome is never conveyed by colour alone |
| U-06 | Escalate-amber text (`#E67E22`) on white measures 2.85:1 | WCAG 1.4.3 contrast | Medium | Open - recommended `#9C640C` (4.95:1) |
| U-07 | Muted slate text (`#6B7A99`) on white measures 4.31:1 - passes for large text, marginally fails for normal text | WCAG 1.4.3 contrast | Low | Open - recommended `#5A6B8C` (5.36:1) |
| U-08 | The email and password inputs suppress the browser focus outline without providing a replacement, so a keyboard user cannot see which field has focus. Buttons are unaffected (they keep the default outline) | WCAG 2.4.7 focus visible | Medium | Open - restore a visible focus ring on text inputs |
| U-09 | No `aria-label` anywhere in the console; icon-only controls such as the notification bell expose only their badge number to a screen reader | WCAG 4.1.2 name, role, value | Medium | Open - label icon-only buttons |

## 3. What passed

Worth recording, because these were deliberate A3 design decisions and the audit
confirms they held up in the implementation:

- **Core palette contrast.** Navy on white 11.27:1, teal on white 5.62:1, red on
  white 5.44:1, and the same pairs reversed on dark backgrounds - all pass AA
  for normal text.
- **Keyboard path through login.** Tab order is logical (email, password, sign
  in, SSO, back to site) and everything is reachable without a mouse.
- **Error messaging.** A wrong password shows "Invalid email or password" - a
  clear recovery message that deliberately does not reveal which half was wrong.
- **Honest placeholder.** The SSO button is labelled "Sign in with SSO
  (Disabled)", so it cannot be mistaken for a broken control.
- **Table semantics.** The audit log renders as a real `<table>` with proper
  header cells, so screen readers get column context for free.
- **Risk is never colour-alone.** Every risk and outcome badge pairs colour with
  a text label, which is what keeps U-05/U-06 at Medium rather than High.

## 4. Feedback from real viewers

We did not have access to a pool of enterprise compliance officers, so the
feedback below is opportunistic rather than sampled - but all of it changed the
product, which is the point of collecting it:

| Source | Feedback | What we changed |
|--------|----------|-----------------|
| Anthony Autore (sponsor), A3 review | Lead with interception, not inventory | Dashboard now opens on the live intercepted-actions feed |
| Supervisor email, June | A new viewer should understand the system in a few minutes | Public landing page plus the self-contained healthcare demo scenario |
| Exhibition visitors | Wanted the "what is this and why should I care" story before seeing a console | The landing page exists because of this |

## 5. Limitations, honestly

- **No moderated user testing.** We did not run task-based sessions with
  recruited participants, and we did not administer SUS - with only the team as
  a sample the numbers would be noise, not evidence. The right participants are
  the sponsor's compliance staff; sessions with them are the first item we would
  schedule in A5.
- **Screen reader coverage is partial.** We audited the semantics (tables,
  labels, names) programmatically but did not do a full NVDA/VoiceOver
  run-through.
- **Contrast audit scope.** We measured every pair documented in the branding
  style guide; ad hoc colours in individual components were not exhaustively
  swept.

## 6. Summary

The implemented console holds up well against the heuristics it was designed to:
status is visible everywhere, errors are recoverable and clearly worded, and the
structural palette is comfortably AA-compliant. The audit still earned its keep -
it caught a login-breaking bug before submission, plus four fixed and five open
issues, each open one with a tested replacement value ready to apply. The honest
gap is moderated testing with real compliance users, which needs access we do
not have this session and is flagged for A5.
