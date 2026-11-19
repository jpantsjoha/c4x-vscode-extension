// Single source for the identity the MCP server reports. The version is read
// from package.json at build time, so it cannot drift from the extension.
import { version } from "../package.json";

export const MCP_SERVER_NAME = "c4x-validator";
export const MCP_SERVER_VERSION: string = version;
