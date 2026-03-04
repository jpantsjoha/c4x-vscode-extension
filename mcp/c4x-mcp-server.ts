#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { c4xParser } from "../src/parser/C4XParser";
import * as fs from "fs/promises";
import * as path from "path";

const server = new Server(
    {
        name: "c4x-validator",
        version: "1.3.0",
    },
    {
        capabilities: {
            tools: {},
            resources: {},
        },
    }
);

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
        resources: [
            {
                uri: "c4x://guidelines",
                name: "C4X Generation Guidelines",
                description: "Comprehensive best practices, layout strategies, and advanced patterns for generating C4X diagrams with AI. Includes element type whitelist, syntax rules, and visual coherence principles.",
                mimeType: "text/markdown",
            },
            {
                uri: "c4x://examples/event-driven",
                name: "Event-Driven Architecture Example",
                description: "Production-ready example: EventBridge, SQS, async messaging, dead letter queues",
                mimeType: "text/markdown",
            },
            {
                uri: "c4x://examples/serverless",
                name: "Serverless Data Pipeline Example",
                description: "Production-ready example: Lambda, S3 triggers, Step Functions, DynamoDB",
                mimeType: "text/markdown",
            },
            {
                uri: "c4x://examples/oauth2",
                name: "OAuth 2.0 Authentication Example",
                description: "Production-ready example: PKCE flow, JWT validation, token introspection, dynamic diagrams",
                mimeType: "text/markdown",
            },
            {
                uri: "c4x://examples/healthcare",
                name: "Healthcare HIPAA System Example",
                description: "Production-ready example: HL7 FHIR, audit logging, encryption, consent management",
                mimeType: "text/markdown",
            },
            {
                uri: "c4x://examples/graphql",
                name: "GraphQL API Gateway Example",
                description: "Production-ready example: DataLoader, N+1 problem, federation, subscriptions",
                mimeType: "text/markdown",
            },
            {
                uri: "c4x://examples/grpc",
                name: "gRPC Microservices Example",
                description: "Production-ready example: Istio service mesh, Protocol Buffers, Envoy sidecars",
                mimeType: "text/markdown",
            },
            {
                uri: "c4x://syntax",
                name: "C4X Syntax Reference",
                description: "Complete DSL syntax specification with element types, relationships, and examples",
                mimeType: "text/markdown",
            },
        ],
    };
});

// Read resource content
// Resolve from CWD (project root when run via MCP config)
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const projectRoot = process.cwd();
    const docsDir = path.join(projectRoot, "docs");
    const samplesDir = path.join(projectRoot, "samples");

    try {
        let filePath: string;

        if (uri === "c4x://guidelines") {
            filePath = path.join(docsDir, "C4X-GENERATION-GUIDELINES.md");
        } else if (uri === "c4x://syntax") {
            filePath = path.join(docsDir, "c4x-syntax.md");
        } else if (uri === "c4x://examples/event-driven") {
            filePath = path.join(samplesDir, "advanced/event-driven-architecture.md");
        } else if (uri === "c4x://examples/serverless") {
            filePath = path.join(samplesDir, "advanced/serverless-data-pipeline.md");
        } else if (uri === "c4x://examples/oauth2") {
            filePath = path.join(samplesDir, "advanced/oauth2-authentication-flow.md");
        } else if (uri === "c4x://examples/healthcare") {
            filePath = path.join(samplesDir, "real-world/healthcare-patient-management.md");
        } else if (uri === "c4x://examples/graphql") {
            filePath = path.join(samplesDir, "component/graphql-api-gateway.md");
        } else if (uri === "c4x://examples/grpc") {
            filePath = path.join(samplesDir, "container/grpc-microservices.md");
        } else {
            throw new Error(`Unknown resource URI: ${uri}`);
        }

        const content = await fs.readFile(filePath, "utf-8");

        return {
            contents: [
                {
                    uri,
                    mimeType: "text/markdown",
                    text: content,
                },
            ],
        };
    } catch (error: any) {
        throw new Error(`Failed to read resource ${uri}: ${error.message}`);
    }
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "validate_c4x",
                description: "Validates a C4X DSL diagram code snippet. Parses the code and returns either success or a structured parsing/syntax error with line and column numbers. Does NOT fix the code, only reports validity.",
                inputSchema: {
                    type: "object",
                    properties: {
                        code: {
                            type: "string",
                            description: "The C4X DSL code to validate",
                        },
                    },
                    required: ["code"],
                },
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "validate_c4x") {
        const args = request.params.arguments as any;
        const code = String(args?.code || "");
        try {
            // Validate
            c4xParser.parse(code);
            return {
                content: [
                    {
                        type: "text",
                        text: "Syntax is VALID. No errors found.",
                    },
                ],
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Syntax ERROR.\nMessage: ${error.message}\nLine: ${error.location?.line || 'unknown'}\nColumn: ${error.location?.column || 'unknown'}`,
                    },
                ],
                isError: true,
            };
        }
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
});

async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("C4X MCP Server running on stdio");
}

run().catch(console.error);
