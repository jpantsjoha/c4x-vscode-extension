# ADR 005: Adoption of Automated Security Tooling

## Status
Accepted

## Date
2025-12-14

## Context
As the C4X extension gains adoption, ensuring the security of the codebase and the artifacts it produces is critical. We need to prevent common vulnerabilities like ReDoS (Regular Expression Denial of Service), object injection, and insecure file handling, especially since we parse untrusted Markdown/PlantUML input.

Manual review is insufficient for catching subtle security issues. We need automated, continuous verification in both the local development environment and the CI/CD pipeline.

## Decision
We will adopt the following security tooling:

1.  **ESLint Security Plugin (`eslint-plugin-security`)**
    *   **Scope**: Local Development & CI.
    *   **Configuration**: `plugin:security/recommended-legacy`.
    *   **Rationale**: Provides immediate feedback to developers about unsafe node patterns (e.g., `fs.readFileSync` with non-literals, unchecked regex) directly in the IDE.

2.  **GitHub Advanced Security (CodeQL)**
    *   **Scope**: CI (GitHub Actions).
    *   **Configuration**: Default `javascript-typescript` analysis with "Security only" severity filter effectively.
    *   **Rationale**: Performs deep semantic analysis of data flow to detect complex vulnerabilities that grep-based linters miss (e.g., taint tracking for XSS or Command Injection).

## Consequences
### Positive
*   **Proactive Prevention**: Vulnerabilities are caught before merge.
*   **Trust**: Demonstrates commitment to security for enterprise users.
*   **Automation**: Reduces burden on manual code review.

### Negative
*   **Noise**: `eslint-plugin-security` can be noisy with false positives (e.g., `detect-object-injection` in parsers). We may need to suppress specific rules or lines.
*   **Build Time**: CodeQL analysis adds ~2-5 minutes to the CI pipeline.

## Compliance
*   All new PRs must pass the `CodeQL` workflow.
*   The `lint` script in `package.json` now includes security checks.
