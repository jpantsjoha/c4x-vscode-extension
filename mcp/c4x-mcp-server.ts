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
import { C4XParseError } from "../src/parser/types";
import * as fs from "fs/promises";
import * as path from "path";

const MAX_CODE_BYTES = 1024 * 1024;
const MAX_ERROR_MESSAGE_LENGTH = 2000;
const PROJECT_ROOT = path.resolve(__dirname, "..");

const resources = [
    {
        uri: "c4x://guidelines",
        name: "C4X Generation Guidelines",
        description: "Comprehensive best practices, layout strategies, and advanced patterns for generating C4X diagrams with AI. Includes element type whitelist, syntax rules, and visual coherence principles.",
        mimeType: "text/markdown",
        relativePath: "docs/C4X-GENERATION-GUIDELINES.md",
    },
    {
        uri: "c4x://examples/event-driven",
        name: "Event-Driven Architecture Example",
        description: "Production-ready example: EventBridge, SQS, async messaging, dead letter queues",
        mimeType: "text/markdown",
        relativePath: "samples/advanced/event-driven-architecture.md",
    },
    {
        uri: "c4x://examples/serverless",
        name: "Serverless Data Pipeline Example",
        description: "Production-ready example: Lambda, S3 triggers, Step Functions, DynamoDB",
        mimeType: "text/markdown",
        relativePath: "samples/advanced/serverless-data-pipeline.md",
    },
    {
        uri: "c4x://examples/oauth2",
        name: "OAuth 2.0 Authentication Example",
        description: "Production-ready example: PKCE flow, JWT validation, token introspection, dynamic diagrams",
        mimeType: "text/markdown",
        relativePath: "samples/advanced/oauth2-authentication-flow.md",
    },
    {
        uri: "c4x://examples/healthcare",
        name: "Healthcare HIPAA System Example",
        description: "Production-ready example: HL7 FHIR, audit logging, encryption, consent management",
        mimeType: "text/markdown",
        relativePath: "samples/real-world/healthcare-patient-management.md",
    },
    {
        uri: "c4x://examples/graphql",
        name: "GraphQL API Gateway Example",
        description: "Production-ready example: DataLoader, N+1 problem, federation, subscriptions",
        mimeType: "text/markdown",
        relativePath: "samples/component/graphql-api-gateway.md",
    },
    {
        uri: "c4x://examples/grpc",
        name: "gRPC Microservices Example",
        description: "Production-ready example: Istio service mesh, Protocol Buffers, Envoy sidecars",
        mimeType: "text/markdown",
        relativePath: "samples/container/grpc-microservices.md",
    },
    {
        uri: "c4x://syntax",
        name: "C4X Syntax Reference",
        description: "Complete DSL syntax specification with element types, relationships, and examples",
        mimeType: "text/markdown",
        relativePath: "docs/c4x-syntax.md",
    },
] as const;

const resourcesByUri = new Map(resources.map((resource) => [resource.uri, resource]));

function toolError(text: string) {
    return {
        content: [{ type: "text" as const, text }],
        isError: true,
    };
}

function boundedErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : "Unknown parser error";
    return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

const server = new Server(
    {
        name: "c4x-validator",
        version: "1.4.0",
    },
    {
        capabilities: {
            tools: {},
            resources: {},
        },
        instructions: "Use validate_c4x before applying generated C4X. Read c4x://syntax for the DSL reference and c4x://guidelines for generation guidance.",
    }
);

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
        resources: resources.map(({ relativePath: _relativePath, ...resource }) => resource),
    };
});

// Read resource content
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const resource = resourcesByUri.get(uri as typeof resources[number]["uri"]);

    if (!resource) {
        throw new Error("Unknown C4X resource URI.");
    }

    try {
        const filePath = path.resolve(PROJECT_ROOT, resource.relativePath);
        // resource.relativePath comes exclusively from the fixed allowlist above.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const content = await fs.readFile(filePath, "utf-8");

        return {
            contents: [
                {
                    uri,
                    mimeType: resource.mimeType,
                    text: content,
                },
            ],
        };
    } catch {
        throw new Error("C4X resource is unavailable.");
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
        const args = request.params.arguments;
        const code = args && typeof args === "object" ? (args as Record<string, unknown>).code : undefined;

        if (typeof code !== "string") {
            return toolError("Input ERROR. The required 'code' field must be a string.");
        }

        if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
            return toolError("Input ERROR. C4X code must not exceed 1 MiB.");
        }

        try {
            c4xParser.parse(code);
            return {
                content: [
                    {
                        type: "text",
                        text: "Syntax is VALID. No errors found.",
                    },
                ],
            };
        } catch (error: unknown) {
            const location = error instanceof C4XParseError ? error.location : undefined;
            return toolError(`Syntax ERROR.\nMessage: ${boundedErrorMessage(error)}\nLine: ${location?.line ?? "unknown"}\nColumn: ${location?.column ?? "unknown"}`);
        }
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
});

async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("C4X MCP Server running on stdio");
}

run().catch((error: unknown) => {
    console.error(`C4X MCP Server failed to start: ${boundedErrorMessage(error)}`);
    process.exitCode = 1;
});
