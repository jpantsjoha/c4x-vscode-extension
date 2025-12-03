# Contributing to C4X

First off, thank you for considering contributing to C4X! We welcome any contributions that help us make C4 diagramming in VS Code better for everyone.

This document provides guidelines for contributing to the project.

---

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior.

---

## How Can I Contribute?

There are many ways to contribute, from writing documentation to submitting bug reports and feature requests. If you want to contribute code, here’s how to get started.

### Reporting Bugs

-   **Ensure the bug was not already reported** by searching on GitHub under [Issues](https://github.com/jpantsjoha/c4model-vscode-extension/issues).
-   If you're unable to find an open issue addressing the problem, [open a new one](https://github.com/jpantsjoha/c4model-vscode-extension/issues/new). Be sure to include a **title and clear description**, as much relevant information as possible, and a **code sample** or an **executable test case** demonstrating the expected behavior that is not occurring.

### Suggesting Enhancements

-   Open a new issue and provide a clear description of the enhancement you would like to see, why it would be useful, and any implementation ideas you have.

---

## Development Setup

To get the project running locally, follow these steps:

1.  **Fork and Clone**: Fork the repository on GitHub and clone your fork locally.

    ```bash
    git clone https://github.com/<your-username>/c4model-vscode-extension.git
    cd c4model-vscode-extension
    ```

2.  **Install Dependencies**: We use `pnpm` for package management.

    ```bash
    pnpm install
    ```

3.  **Build the Extension**: This will compile the TypeScript code and bundle it.

    ```bash
    pnpm run build
    ```

4.  **Run in VS Code**: Open the project in VS Code and press `F5` to launch the Extension Development Host. This will open a new VS Code window with your extension loaded.

---

## Running Tests

We use Mocha for testing. To run the tests, use the following command:

```bash
npm test
```

This will run all unit and integration tests. Please ensure all tests pass before submitting a pull request.

### Writing Tests

-   For any new feature, please add corresponding tests.
-   For any bug fix, please add a test that reproduces the bug and verifies that your fix works.
-   Tests are located in the `test/suite` directory.

### Visual Validation

For changes involving the layout engine or SVG rendering, you **must** run the visual validation suite:

```bash
npx ts-node scripts/validate-gallery.ts
```

This script:
1.  Generates SVGs for 7 different C4 scenarios defined in `docs/validation/GALLERY.md`.
2.  Checks that arrows are straight and aligned correctly (geometric analysis).
3.  Produces a report at `docs/validation/report.html`.

Open the report in your browser to visually verify your changes look correct.

---

## Submitting a Pull Request

1.  **Create a Branch**: Create a new branch for your changes.

    ```bash
    git checkout -b feat/my-new-feature
    ```

2.  **Make Your Changes**: Make your changes to the code and add tests.

3.  **Ensure Tests Pass**: Run `npm test` to make sure all tests still pass.

4.  **Commit Your Changes**: Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

    ```bash
    git commit -m "feat: Add new feature"
    ```

5.  **Push to Your Fork**: Push your changes to your forked repository.

    ```bash
    git push origin feat/my-new-feature
    ```

6.  **Open a Pull Request**: Open a pull request from your fork to the main C4X repository. Provide a clear description of your changes.

---

## Style Guide

We use ESLint and Prettier to enforce a consistent coding style. Before committing, you can run the linter to check your code:

```bash
npm run lint
```

And you can run Prettier to format your code:

```bash
npm run format
```

---

## Questions?

If you have any questions, feel free to open an issue and we'll be happy to help you out.