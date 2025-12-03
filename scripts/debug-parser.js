
const { c4xParser } = require('../out/src/parser/C4XParser');

const input = `%%{ c4: component }%%
graph TB
    subgraph AIResearchAssistantSystem
        Orchestrator[Orchestrator Agent<br/>Component<br/>Python, LangChain]
    end
`;

try {
    console.log('Parsing input:');
    console.log(input);
    const result = c4xParser.parse(input);
    console.log('Success!');
} catch (e) {
    console.error('Error:', e.message);
    if (e.location) console.error('Location:', e.location);
}
