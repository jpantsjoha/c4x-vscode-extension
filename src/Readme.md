# This is the sample documentation file

Lets visualise our ./src/ folder showcasing how this gemini-powered c4x diagram generation works in practice

```c4x
%%{ c4: system-context }%%
graph TB
  %% Person
  Developer[Developer<br/>Person]

  %% Core System
  C4XExtension[C4X VS Code Extension<br/>Software System]

  %% External Systems
  VSCode[Visual Studio Code<br/>Software System<br/>External]
  GeminiAI[Google Gemini AI<br/>Software System<br/>External]
  FileSystem[User's File System<br/>Software System<br/>External]
  WebBrowser[Web Browser<br/>Software System<br/>External]
  Playwright[Playwright/Chromium<br/>Software System<br/>External]

  %% Relationships
  Developer -->|Writes C4X DSL & requests exports| C4XExtension

  C4XExtension -->|Runs within & uses APIs| VSCode
  C4XExtension -->|Sends code context for generation| GeminiAI
  C4XExtension -->|Saves exported diagrams (SVG, PNG, HTML)| FileSystem
  C4XExtension -->|Opens HTML for PDF printing| WebBrowser
  C4XExtension -->|Renders SVG to create PNGs| Playwright
```
