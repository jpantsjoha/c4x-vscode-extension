const { C4XParser } = require('../out/src/parser/C4XParser');

const snippet = `%%{ c4: deployment }%%
graph TB
    Node(aws, "AWS Cloud", "us-east-1", "Production", $sprite="aws") {
        Node(vpc, "VPC", "10.0.0.0/16", $sprite="cloud") {
            Node(ecs, "ECS Cluster", "Fargate", $sprite="aws-ecs") {
                Container(api, "Agent API", "Python/FastAPI", "Orchestrator", $sprite="container")
            }
        }
    }
`;

console.log("Testing snippet:");
console.log(snippet);

const parser = new C4XParser();
try {
    const result = parser.parse(snippet);
    console.log("✅ Parse Success!");
    // console.log(JSON.stringify(result, null, 2));
} catch (e) {
    console.log("❌ Parse Failed:");
    console.log(e.message);
    if (e.location) {
        console.log(`Line: ${e.location.line}, Col: ${e.location.column}`);
    }
}
