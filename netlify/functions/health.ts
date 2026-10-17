import type { Config } from "@netlify/functions";
import { SERVER_INFO } from "../../src/server.js";

export default async () =>
  new Response(JSON.stringify({ ...SERVER_INFO, status: "ok", mcp: "/mcp", readOnly: true }), {
    headers: { "Content-Type": "application/json" },
  });

export const config: Config = { path: "/health" };
