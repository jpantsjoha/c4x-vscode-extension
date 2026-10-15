# Third-party notices — cloud provider icon packs

C4X renders architecture diagrams with icon sets published by the cloud vendors themselves. The icon artwork is the property of the respective vendor and is **not** covered by this repository's MIT licence. The icons are re-encoded for packaging without altering the artwork (the SVG wrapper is removed and whitespace collapsed; for Google icons only the contents of the `art` group are kept, and class-based fills are rewritten as literal colours) and are used to depict each vendor's own services in users' architecture diagrams, which is the use AWS and Microsoft publish them for. Google's terms are not reproduced here. C4X is not affiliated with or endorsed by Amazon, Microsoft or Google.

What ships: the extension bundle inlines **430 AWS, 624 Azure and 44 Google Cloud icons** (1,098 in total) from `src/assets/aws-icons.ts`, `src/assets/azure-icons.ts` and `src/assets/gcp-icons.ts`. Each module is generated from the vendor's SVG pack by `scripts/generate-aws-icons.js`, `scripts/generate-azure-icons.js` and `scripts/generate-gcp-icons.js`; the SVG packs are not tracked (`*.svg` is gitignored). The directory `assets/cloud/` additionally holds a tracked but unconsumed PNG copy of the AWS and Google packs (524 and 19 PNG files, plus one `.ai` category-icon source); it is excluded from the VSIX by `.vscodeignore` and is republished in the public source mirror.

| Pack | Source | Vendor statement |
|---|---|---|
| **AWS Architecture Icons** — Resource icons, package `07312025` | <https://aws.amazon.com/architecture/icons/> | "We allow customers and partners to use these toolkits and assets to create architecture diagrams." (page text, read 2026-09-09). AWS marks are governed by <https://aws.amazon.com/trademark-guidelines/> |
| **Azure Public Service Icons** | <https://learn.microsoft.com/en-us/azure/architecture/icons/> | "Microsoft permits the use of these icons in architectural diagrams, training materials, or documentation. You can copy, distribute, and display the icons only for the permitted use unless granted explicit permission by Microsoft. Microsoft reserves all other rights." Conditions on the same page: "Don't crop, flip, or rotate icons." "Don't distort or change icon shape in any way." "Don't use Microsoft product icons to represent your product or service." (Icon terms, read 2026-09-09) |
| **Google Cloud product icons** | <https://cloud.google.com/icons> | Google's product icons, used as published for architecture diagrams; Google's brand terms accompany the icon library and are not quoted here |

Ingested 2025-12-05 (commits `b526e1b`, `a9224dd`). AWS and Amazon Web Services are trademarks of Amazon.com, Inc. or its affiliates; Microsoft and Azure are trademarks of Microsoft Corporation; Google and Google Cloud are trademarks of Google LLC. The product names above are their owners' marks.

## Open-source packages in the extension bundle

The extension bundle (`dist/extension.js`) also inlines open-source npm packages, such as markdown-it, dagre, lodash and the Gemini SDK. Their licences and any NOTICE files they ship are reproduced in full in `THIRD_PARTY_NOTICES.txt`, which ships in the extension package beside this file. It is generated on every build from the bundle's own module graph, so it always lists exactly the packages that ship, and the build fails if a bundled package has no licence text or a licence outside the permissive set C4X redistributes (MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, BlueOak-1.0.0).

The MCP server bundle under `mcp/` (in the source repository, not in the VSIX) carries its dependency notices in `mcp/THIRD_PARTY_NOTICES.txt`.
