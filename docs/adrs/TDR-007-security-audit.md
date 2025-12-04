# TDR-007: Security Audit Tools

**Date**: 2025-10-13
**Status**: ✅ **DECIDED**
**Decider**: VSCode Extension Expert

---

## Context

Need to audit dependencies for security vulnerabilities before marketplace publish.

---

## Decision

**Use all three tools** (defense in depth):
1. **npm audit** (built-in, free, quick check)
2. **Snyk** (comprehensive, free tier available)
3. **GitHub Dependabot** (automatic PRs for updates)

---

## Rationale

- ✅ **npm audit**: Quick check, catches known CVEs
- ✅ **Snyk**: Deeper analysis, license compliance
- ✅ **Dependabot**: Automated updates, proactive

---

## Policy

**Zero high/critical vulnerabilities before v1.0 launch**

---

## Implementation

```yaml
# .github/workflows/security.yml
name: Security Audit
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm audit --audit-level=moderate
      - uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

---

**Document Version**: 1.0
**Last Updated**: 2025-10-13
