// Markdown files imported by the MCP server are embedded as text by esbuild (loader .md).
declare module "*.md" {
    const text: string;
    export default text;
}
