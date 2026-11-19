---
type: llm
focus: last_message
---

PASS if the reply says the diagram was checked (valid, or with findings) and says it cannot be rendered or drawn here, pointing the user to the C4X VS Code extension (for example "C4X: Open Preview" or "Export SVG").
FAIL if the reply claims an image, SVG or preview was produced, or if it gives no check result.
