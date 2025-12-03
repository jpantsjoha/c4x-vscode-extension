import './mock-vscode'; // Mock vscode first
import * as fs from 'fs';
import * as path from 'path';
import MarkdownIt from 'markdown-it';
import { c4xPlugin } from '../src/markdown/c4xPlugin';

// Setup MarkdownIt with the C4X plugin
const md = new MarkdownIt();
md.use(c4xPlugin);

// Test Markdown content with various C4 diagram types
const markdownContent = `
# C4 Model Visual Verification Gallery

## 1. System Context (C1) - Banking System
This diagram shows the high-level interactions between users and the banking system.

\`\`\`c4x
%%{ c4: system-context }%%
graph TB
    Customer[Personal Banking Customer<br/>Person]
    InternetBanking[Internet Banking System<br/>Software System]
    EmailSystem[E-mail System<br/>Software System<br/>External]
    
    Customer -->|Uses| InternetBanking
    InternetBanking -->|Sends e-mails using| EmailSystem
    
    %% Styling
    %% classDef person fill:#08427B
    %% classDef system fill:#1168BD
\`\`\`

## 2. Container Diagram (C2) - E-Commerce
This diagram shows the containers (applications, databases) within the system.

\`\`\`c4x
%%{ c4: container }%%
graph TB
    subgraph "E-Commerce System"
        WebApp[Web Application<br/>Container<br/>Java, Spring MVC]
        SPA[Single Page Application<br/>Container<br/>JavaScript, Angular]
        Database[Database<br/>Container<br/>Oracle]
    end
    
    User[User<br/>Person]
    
    User -->|Uses| SPA
    SPA -->|API calls| WebApp
    WebApp -->|Reads/Writes| Database
\`\`\`

## 3. Component Diagram (C3) - Multi-Agent System
This diagram illustrates the interaction between AI agents.

\`\`\`c4x
%%{ c4: component }%%
graph TB
    subgraph "AI Research Assistant"
        Orchestrator[Orchestrator<br/>Component<br/>Python]
        ResearchAgent[Researcher<br/>Component<br/>GPT-4]
        WriterAgent[Writer<br/>Component<br/>Claude 3]
    end
    
    User[User<br/>Person]
    
    User -->|Asks| Orchestrator
    Orchestrator -->|Delegates| ResearchAgent
    Orchestrator -->|Delegates| WriterAgent
    ResearchAgent -->|Info| WriterAgent
\`\`\`
`;

try {
    console.log('Rendering Markdown to HTML...');
    const htmlOutput = md.render(markdownContent);

    const finalHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>C4X Markdown Verification</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        pre { background: #f4f4f4; padding: 10px; border-radius: 5px; }
        svg { max-width: 100%; height: auto; }
    </style>
</head>
<body>
    ${htmlOutput}
</body>
</html>
    `;

    const outputPath = path.join(__dirname, '../test-markdown-gallery.html');
    fs.writeFileSync(outputPath, finalHtml);
    console.log(`Successfully generated markdown preview at: ${outputPath}`);
} catch (error) {
    console.error('Error rendering markdown:', error);
    process.exit(1);
}
