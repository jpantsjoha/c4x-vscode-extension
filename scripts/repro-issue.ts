
import { c4xParser } from '../src/parser/C4XParser';
import { c4ModelBuilder } from '../src/model/C4ModelBuilder';

async function reproduce() {
    console.log('🧪 Reproducing Nested Subgraph Scope Issue...');


    // Full User Reproduction case
    const input = `
    %%{ c4: container }%%
    graph TB
      %% External Actors
      User[Marketing Manager<br/>Person]
      Web[Web Sources<br/>System]
      
      subgraph AgentSystem {
        direction TB
        
        %% Shared State
        Memory[Vector Database<br/>ContainerDb]
        
        subgraph AgentLoop {
          %% The internal collaboration happens in a loop
          direction LR
          
          Trend[Trend Watcher<br/>Container<br/>technology="Python"]
          Strategy[Strategy Agent<br/>Container<br/>technology="LangChain"]
          Creative[Creative Agent<br/>Container<br/>technology="OpenAI"]
          
          Trend --> Strategy
          Strategy --> Creative
          Creative --> Strategy
        }
        
        %% Memory Access
        Trend -->|Writes| Memory
        Strategy -->|Reads/Writes| Memory
        Creative -->|Reads| Memory
        
        %% Output
        Report[Campaign Report<br/>Container]
        Creative --> Report
      }
      
      %% Data Flow
      Web -->|Crawls| Trend
      User -->|Triggers| Trend
      Report -->|Delivered to| User
    `;

    try {
        console.log('1. Parsing...');
        const result = c4xParser.parse(input);

        console.log('2. Building Model...');
        // debug: check if Trend is in elements
        const allIds = result.elements.map(e => e.id);
        console.log('Top-level elements found:', allIds);
        console.log('Total elements count:', allIds.length);

        if (!allIds.includes('Trend')) {
            console.error('❌ Critical: "Trend" element is MISSING from top-level elements!');
        }

        const model = c4ModelBuilder.build(result, 'test-workspace');
        console.log('✅ Model built successfully!');
        console.log('Error NOT reproduced with full example.');
    } catch (e: any) {
        console.log('❌ Caught Expected Error:');
        console.log(e.message);
        if (e.message.includes('unknown element "Trend"')) {
            console.log('🎯 Confirmed: referencing deeply nested element fails.');
        } else {
            console.log('❓ Different error than expected.');
        }
        process.exit(1);
    }
}

reproduce();
