#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const PLANS = {
    negocio: {
        baseUrl:  process.env.BASE_URL_NEGOCIO  ?? process.env.BASE_URL   ?? null,
        apiToken: process.env.API_TOKEN_NEGOCIO ?? process.env.API_TOKEN  ?? null,
    },
    debug: {
        baseUrl:  process.env.BASE_URL_DEBUG    ?? null,
        apiToken: process.env.API_TOKEN_DEBUG   ?? null,
    },
};

// Default to "debug" only if negocio is not configured but debug is; otherwise default to "negocio"
const DEFAULT_PLAN = (PLANS.negocio.baseUrl == null && PLANS.debug.baseUrl != null)
    ? "debug"
    : "negocio";

const server = new Server({
    name: "simple-graylog-mcp",
    version: "1.1.0",
}, {
    capabilities: {
        tools: {},
    },
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "fetch_graylog_messages",
                description: `Fetch messages from Graylog.

Two plans are available, each pointing to a different Graylog server:
- "negocio": business/audit logs — seller configuration changes, rule changes, integrator events.
             Fields: seller_id, type, name, full_message.
- "debug":   technical execution logs — stack traces, request flow, inter-service calls.
             Fields: ctxt_store_id, ctxt_session_id, ctxt_order_id, ctxt_* (varies by system).

Choose the plan based on what you need to investigate:
- "negocio" → what happened (audit trail, who changed what, when)
- "debug"   → why it happened (stack trace, exact execution path, service errors)

Choose the plan that matches your Graylog setup and document confirmed fields per system in your own knowledge base.`,
                inputSchema: {
                    type: "object",
                    properties: {
                        plan: {
                            type: "string",
                            enum: ["negocio", "debug"],
                            description: `Which Graylog server to query. Default: "${DEFAULT_PLAN}".`,
                        },
                        query: {
                            type: "string",
                            description: "The query to search for, with the respective fields and values",
                        },
                        searchTimeRangeInSeconds: {
                            type: "number",
                            description: "The time range to search for, in seconds. Default: 900 (15 minutes).",
                        },
                        searchCountLimit: {
                            type: "number",
                            description: "The number of messages to fetch. Default: 50.",
                        },
                        fields: {
                            type: "string",
                            description: "Comma-separated list of fields to return. Default: '*' (all fields).",
                        },
                    },
                    required: ["query"],
                },
            }
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "fetch_graylog_messages") {
        return fetchGraylogMessages(request);
    }

    throw new Error(`Tool not found: ${request.params.name}`);
});

async function fetchGraylogMessages(request) {
    const args = request.params.arguments ?? {};

    const planName = args.plan ?? DEFAULT_PLAN;
    const plan = PLANS[planName];

    if (!plan || plan.baseUrl == null || plan.apiToken == null) {
        return {
            result: [],
            content: [{
                type: "text",
                text: `Plan "${planName}" is not configured. ` +
                      `Set BASE_URL_${planName.toUpperCase()} and API_TOKEN_${planName.toUpperCase()} ` +
                      `environment variables in the MCP server config.`,
            }],
        };
    }

    const query                  = args.query;
    const searchTimeRangeInSeconds = args.searchTimeRangeInSeconds ?? 900;
    const searchCountLimit       = args.searchCountLimit ?? 50;
    const fields                 = args.fields ?? '*';

    try {
        const response = await axios.get(`${plan.baseUrl}/api/search/universal/relative`, {
            params: {
                query,
                range: searchTimeRangeInSeconds,
                limit: searchCountLimit,
                fields,
            },
            headers: {
                'Accept': 'application/json',
            },
            auth: {
                username: plan.apiToken,
                password: 'token',
            },
        });

        if (process.env.DEBUG === "true") {
            console.error(`[graylog-mcp] plan=${planName} query=${query} hits=${response.data?.total_results ?? '?'}`);
        }

        return {
            result: response.data,
            content: [{
                type: "text",
                text: JSON.stringify(response.data.messages),
            }],
        };
    } catch (error) {
        console.error(`[graylog-mcp] Error fetching messages (plan=${planName}):`, error.message);
        return {
            result: [],
            content: [{
                type: "text",
                text: `Error fetching messages from plan "${planName}": ${error.message}`,
            }],
        };
    }
}

const transport = new StdioServerTransport();
await server.connect(transport);