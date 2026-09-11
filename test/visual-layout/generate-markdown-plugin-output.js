#!/usr/bin/env node
/**
 * Generates a sample Markdown Plugin HTML output file for Playwright testing.
 * Invoked by markdown-entry.spec.ts to verify the c4xPlugin renders the
 * "Edit C4 diagram" affordance for c4x fenced blocks.
 *
 * Usage: node generate-markdown-plugin-output.js <outputPath>
 */
'use strict';

const fs = require('fs');
const path = require('path');
require('ts-node/register/transpile-only');

const { c4xPlugin } = require('../../src/markdown/c4xPlugin');
const MarkdownIt = require('markdown-it');

const outputPath = process.argv[2];
if (!outputPath) {
    throw new Error('Usage: generate-markdown-plugin-output.js <outputPath>');
}

// Journey sample — the same content as samples/visual-c4-editor/journey.md.
const markdownSource = `# Visual C4 Editor acceptance journey

This is a Markdown document with a C4X diagram.

\`\`\`c4x
graph TB
Person(Customer, "Customer", "Browser")
SoftwareSystem(Portal, "Customer portal", "TypeScript", "Serves customer journeys", $tags="Public")
SoftwareSystem(Identity, "Identity service", "Go", "Authenticates customers")
Container(Web, "Web application", "React", "Customer-facing UI")
Container(Api, "API", "Node.js", "Application API", $tags="Internal")
Container(Database, "Customer database", "PostgreSQL", "Stores customer data", $sprite=database)
Customer -->|Uses| Portal
Portal -->|Authenticates with| Identity
Portal -->|Serves| Web
Web -->|Calls| Api
Api -->|Reads and writes| Database
\`\`\`

Some trailing Markdown prose.
`;

const md = c4xPlugin(new MarkdownIt());
const rendered = md.render(markdownSource);

fs.writeFileSync(outputPath, rendered, 'utf8');
process.stdout.write(`[c4xPlugin] Output written to ${outputPath}\n`);
