# Built with Gemini

**C4X** was architected and built with the assistance of **Google's Gemini 1.5 Pro** model.

This project represents a collaboration between human architectural vision and AI-driven implementation. The goal was to create a production-grade VS Code extension that adheres to strict software engineering standards while accelerating the development lifecycle.

## Development Philosophy

-   **Agentic Workflow**: The project was broken down into phases (Scaffolding, Parsing, Rendering, Polish), with the AI acting as a "Lead Architect" and "Implementation Engineer" for specific tasks.
-   **Technical Decision Records (TDRs)**: All major architectural choices (e.g., using PEG.js for parsing, Dagre.js for layout, avoiding Java dependencies) were documented and justified via ADRs/TDRs.
-   **Test-Driven Development**: A rigorous testing strategy was employed, resulting in 100% pass rate across 400+ unit and integration tests.
-   **Visual Validation**: Automated scripts were used to generate galleries of C4 diagrams to ensure visual regression testing without manual intervention.

## Why Share This?

We believe in transparency about the use of AI in software development. This repository demonstrates that AI can be used not just for snippets, but for end-to-end project delivery—including documentation, testing infrastructure, and marketplace asset generation—when guided by clear architectural principles.

## The "Private vs. Public" Repo

To maintain a clean open-source history, this public repository is a mirror of the core codebase. It excludes the verbose conversational history and intermediate experimental branches used during the AI collaboration, presenting only the polished, shippable result.

---

*Built for the future of software architecture.*
