# TDR-010: Contribution Guidelines

**Date**: 2025-10-13
**Status**: ✅ **DECIDED**
**Decider**: Product Owner

---

## Context

If project is open-sourced, need guidelines for external contributors.

---

## Decision

**Standard GitHub contribution flow** with code of conduct

---

## Guidelines

1. **Fork & PR**: Contributors fork repo, submit PR
2. **Code review**: VSCode Expert agent reviews (or maintainer)
3. **Tests required**: All PRs must include tests
4. **Sign commits**: Use `--signoff` for DCO (Developer Certificate of Origin)
5. **Code of Conduct**: Contributor Covenant 2.1

---

## Implementation

### CONTRIBUTING.md Structure

```markdown
# Contributing to C4X

## Development Setup
1. Fork and clone repo
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Run tests: `npm test`

## Pull Request Process
1. Create feature branch from `main`
2. Make changes with tests
3. Run `npm run lint` and `npm test`
4. Submit PR with description
5. Sign commits with `git commit --signoff`

## Code Style
- TypeScript strict mode
- ESLint + Prettier
- 80% test coverage minimum

## Code of Conduct
We follow the Contributor Covenant 2.1
```

---

## Code Review Checklist

- ✅ Tests included and passing
- ✅ ESLint passing (no warnings)
- ✅ TypeScript strict mode (no errors)
- ✅ Documentation updated
- ✅ Commit signed with DCO

---

**Document Version**: 1.0
**Last Updated**: 2025-10-13
