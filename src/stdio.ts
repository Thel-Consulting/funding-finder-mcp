#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { MemoryCache } from "./sources/http.js";

console.log = (...args: unknown[]) => console.error(...args);
const server = createServer(new MemoryCache());
await server.connect(new StdioServerTransport());
