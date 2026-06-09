/**
 * Mobivable MCP server — single JSON-RPC endpoint at /api/public/mcp.
 *
 * Wire it into any MCP-aware client (Cursor, Claude Code, Claude Desktop)
 * with a config like:
 *
 *   {
 *     "mcpServers": {
 *       "mobivable": {
 *         "type": "http",
 *         "url": "https://studio.mobivable.ai/api/public/mcp",
 *         "headers": { "Authorization": "Bearer mvbl_pat_..." }
 *       }
 *     }
 *   }
 *
 * Auth: every request must carry `Authorization: Bearer mvbl_pat_…`. We
 * hash the bearer and look it up in `mvbl_pats`; revoked / unknown tokens
 * get 401. On a hit we bump `last_used_at` for the row so the settings UI
 * can surface staleness.
 *
 * Wire format: JSON-RPC 2.0 over HTTP POST. We implement just the three
 * methods that real clients call:
 *   - `initialize`        — protocol handshake
 *   - `tools/list`        — manifest of MCP_TOOLS
 *   - `tools/call`        — dispatch to `getMcpTool(name).run(args, ctx)`
 *
 * Notifications (id is undefined) return 204. Errors follow the spec's
 * code table: -32600 invalid request, -32601 method not found, -32602
 * invalid params, -32603 internal, -32700 parse error.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sha256Hex } from "@/lib/mcp-pats.functions";
import { MCP_TOOLS, getMcpTool } from "@/lib/mcp-tools";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "mobivable";
const SERVER_VERSION = "1.0.0";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** Build a JSON-RPC 2.0 success or error envelope. */
function rpcResult(id: JsonRpcRequest["id"], result: unknown): Response {
  return json({ jsonrpc: "2.0", id: id ?? null, result });
}
function rpcError(id: JsonRpcRequest["id"], err: JsonRpcError): Response {
  return json({ jsonrpc: "2.0", id: id ?? null, error: err });
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Bearer token → owning user id (or null if unknown/revoked). */
async function authenticate(
  request: Request,
): Promise<{ userId: string; patHash: string } | null> {
  const auth = request.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();

  // ── Internal service token (ADK agent → MCP bridge) ──
  // When the ADK Cloud Run service calls this endpoint, it sends the
  // MCP_INTERNAL_TOKEN as a Bearer token. We validate it against the
  // server-side env var. This avoids needing a user-scoped PAT for
  // service-to-service calls.
  const internalToken = process.env.MCP_INTERNAL_TOKEN;
  if (internalToken && token === internalToken) {
    return { userId: "adk-service", patHash: "internal" };
  }

  // ── User PAT auth (mvbl_pat_…) ──
  if (!token.startsWith("mvbl_pat_")) return null;

  const patHash = await sha256Hex(token);
  const lookup = (await (
    supabaseAdmin as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
  )
    .from("mvbl_pats")
    .select("id, user_id, revoked_at")
    .eq("token_hash", patHash)
    .maybeSingle()) as {
    data: { id: string; user_id: string; revoked_at: string | null } | null;
    error: { message: string } | null;
  };
  if (lookup.error || !lookup.data || lookup.data.revoked_at) return null;
  const row = lookup.data;

  // Fire-and-forget — staleness is advisory, not load-bearing.
  void (supabaseAdmin as unknown as { from: (t: string) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from("mvbl_pats")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id)
    .then(() => undefined);

  return { userId: row.user_id, patHash };
}

export const Route = createFileRoute("/api/public/mcp")({
  server: {
    handlers: {
      // GET acts as a tiny health probe — useful when wiring clients up
      // and you want to know auth works before flipping to JSON-RPC.
      GET: async ({ request }) => {
        const ctx = await authenticate(request);
        if (!ctx) {
          return json(
            { ok: false, error: "Missing or invalid Bearer token." },
            401,
          );
        }
        return json({
          ok: true,
          server: { name: SERVER_NAME, version: SERVER_VERSION },
          protocolVersion: PROTOCOL_VERSION,
          tools: MCP_TOOLS.length,
        });
      },

      POST: async ({ request }) => {
        // ── 1. parse ──────────────────────────────────────────────────
        let body: JsonRpcRequest;
        try {
          body = (await request.json()) as JsonRpcRequest;
        } catch {
          return rpcError(null, { code: -32700, message: "Parse error" });
        }
        if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
          return rpcError(body?.id ?? null, {
            code: -32600,
            message: "Invalid Request",
          });
        }

        // ── 2. authenticate ───────────────────────────────────────────
        const ctx = await authenticate(request);
        if (!ctx) {
          return rpcError(body.id ?? null, {
            code: -32001,
            message: "Unauthorized — provide a valid mvbl_pat_… Bearer token.",
          });
        }

        // Notifications are id-less and never get a response body.
        const isNotification = body.id === undefined;

        // ── 3. dispatch ───────────────────────────────────────────────
        try {
          switch (body.method) {
            case "initialize": {
              return rpcResult(body.id, {
                protocolVersion: PROTOCOL_VERSION,
                serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
                capabilities: { tools: {} },
              });
            }

            case "notifications/initialized":
            case "notifications/cancelled": {
              // No-op acks for client-side lifecycle pings.
              return new Response(null, { status: 204 });
            }

            case "ping": {
              return rpcResult(body.id, {});
            }

            case "tools/list": {
              return rpcResult(body.id, {
                tools: MCP_TOOLS.map((t) => ({
                  name: t.name,
                  description: t.description,
                  inputSchema: t.inputSchema,
                })),
              });
            }

            case "tools/call": {
              const params = (body.params ?? {}) as {
                name?: string;
                arguments?: Record<string, unknown>;
              };
              const name = typeof params.name === "string" ? params.name : "";
              const args =
                params.arguments && typeof params.arguments === "object"
                  ? (params.arguments as Record<string, unknown>)
                  : {};
              const tool = getMcpTool(name);
              if (!tool) {
                return rpcError(body.id, {
                  code: -32602,
                  message: `Unknown tool: ${name}`,
                });
              }
              try {
                const result = await tool.run(args, ctx);
                // MCP wants the payload as an array of content blocks. We
                // return one text block with JSON — clients parse it back
                // for their own UI / tool-use loops.
                return rpcResult(body.id, {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify(result, null, 2),
                    },
                  ],
                  isError: false,
                });
              } catch (e) {
                // Tool-level errors are reported in the MCP-friendly shape
                // (content + isError:true) rather than as JSON-RPC errors,
                // so the calling agent can read them and recover.
                const message = e instanceof Error ? e.message : String(e);
                return rpcResult(body.id, {
                  content: [{ type: "text", text: message }],
                  isError: true,
                });
              }
            }

            default: {
              if (isNotification) return new Response(null, { status: 204 });
              return rpcError(body.id, {
                code: -32601,
                message: `Method not found: ${body.method}`,
              });
            }
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          if (isNotification) return new Response(null, { status: 204 });
          return rpcError(body.id, { code: -32603, message });
        }
      },
    },
  },
});
