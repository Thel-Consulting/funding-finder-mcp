import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Cache } from "./sources/http.js";
import { registerTools } from "./tools.js";

export const SERVER_INFO = { name: "funding-finder-mcp", version: "0.1.0" };

export function createServer(cache?: Cache) {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "Federal Funding Finder: read-only search over Grants.gov opportunities, NIH RePORTER awards and NSF awards, focused on SBIR/STTR. " +
      "Every result carries a source URL. Cite those URLs when you present results.",
  });
  registerTools(server, cache);
  // The tool list is fixed, so do not advertise list-change notifications.
  // registerTool sets listChanged: true; this later call overrides it.
  server.server.registerCapabilities({ tools: { listChanged: false } });
  return server;
}
