# Security policy

## Reporting a vulnerability

Please report security problems privately, not in public issues.

1. Preferred: open a private report with GitHub's private vulnerability reporting at https://github.com/Thel-Consulting/funding-finder-mcp/security/advisories/new.
2. If you cannot use GitHub, email thel@mail.grokbot.com.

Include what you found, how to reproduce it and the impact you expect. We aim to reply within 7 days and will credit you in the advisory unless you ask us not to.

## Scope

- The code in this repository.
- The hosted endpoint at https://grants.thelconsulting.com/mcp.

Out of scope: the upstream federal APIs (Grants.gov, NIH RePORTER, NSF Award Search) and Netlify itself. Report those to their owners. Load testing and denial of service against the hosted endpoint are not allowed.

## Supported versions

Only the latest commit on `main`, which is what the hosted endpoint runs.
