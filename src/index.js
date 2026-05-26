#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

function loadInstances() {
    const declaredNumbers = Object.keys(process.env)
        .map(key => key.match(/^GRAYLOG_BASE_URL_INSTANCE_(\d+)$/))
        .filter(Boolean)
        .map(match => parseInt(match[1], 10))
        .sort((a, b) => a - b);

    const numbers = declaredNumbers.includes(1) ? declaredNumbers : [1, ...declaredNumbers];

    const instances = [];

    for (const i of numbers) {
        const baseUrl  = process.env[`GRAYLOG_BASE_URL_INSTANCE_${i}`]
                      ?? (i === 1 ? process.env.BASE_URL  : null)
                      ?? null;
        const apiToken = process.env[`GRAYLOG_API_TOKEN_INSTANCE_${i}`]
                      ?? (i === 1 ? process.env.API_TOKEN : null)
                      ?? null;
        const label    = process.env[`GRAYLOG_LABEL_INSTANCE_${i}`]
                      ?? `instance_${i}`;

        if (baseUrl && apiToken) {
            instances.push({ label, baseUrl, apiToken });
        }
    }

    return instances;
}

const INSTANCES = loadInstances();

if (INSTANCES.length === 0) {
    console.error(
        "[graylog-mcp] No Graylog instances configured. " +
        "Set at least GRAYLOG_BASE_URL_INSTANCE_1 and GRAYLOG_API_TOKEN_INSTANCE_1."
    );
}

const INSTANCE_BY_LABEL = {};
for (const inst of INSTANCES) {
    if (INSTANCE_BY_LABEL[inst.label]) {
        console.error(
            `[graylog-mcp] Warning: duplicate label "${inst.label}" — ` +
            `only the first instance with this label will be used. ` +
            `Check your GRAYLOG_LABEL_INSTANCE_N configuration.`
        );
    } else {
        INSTANCE_BY_LABEL[inst.label] = inst;
    }
}

const DEFAULT_INSTANCE = INSTANCES[0] ?? null;
const ACTIVE_LABELS    = INSTANCES.map(i => i.label);

const server = new Server({
    name: "simple-graylog-mcp",
    version: "2.0.0",
}, {
    capabilities: {
        tools: {},
    },
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
    const instanceList = ACTIVE_LABELS.length > 0
        ? ACTIVE_LABELS.map(l => `"${l}"`).join(", ")
        : "(none configured)";

    return {
        tools: [
            {
                name: "fetch_graylog_messages",
                description: `Fetch messages from a Graylog instance.

Active instances: ${instanceList}.
Default instance: "${DEFAULT_INSTANCE?.label ?? "none"}".

Use the "instance" parameter to target a specific Graylog server.
Each instance is identified by its label (set via GRAYLOG_LABEL_INSTANCE_N env var).
If no label is configured, instances are identified as "instance_1", "instance_2", etc.`,
                inputSchema: {
                    type: "object",
                    properties: {
                        instance: {
                            type: "string",
                            enum: ACTIVE_LABELS.length > 0 ? ACTIVE_LABELS : undefined,
                            description: `Which Graylog instance to query. Active: ${instanceList}. Default: "${DEFAULT_INSTANCE?.label ?? "none"}".`,
                        },
                        query: {
                            type: "string",
                            description: "The search query, using Graylog query syntax (e.g. \"level:ERROR AND service:api\").",
                        },
                        searchTimeRangeInSeconds: {
                            type: "number",
                            description: "Relative time range in seconds. Default: 900 (15 minutes).",
                        },
                        searchCountLimit: {
                            type: "number",
                            description: "Max number of messages to return. Default: 50.",
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

    const requestedLabel = args.instance ?? DEFAULT_INSTANCE?.label;
    const instance = INSTANCE_BY_LABEL[requestedLabel] ?? null;

    if (!instance) {
        const available = ACTIVE_LABELS.length > 0
            ? `Available instances: ${ACTIVE_LABELS.join(", ")}.`
            : "No instances are configured. Set GRAYLOG_BASE_URL_INSTANCE_N and GRAYLOG_API_TOKEN_INSTANCE_N.";
        return {
            result: [],
            content: [{
                type: "text",
                text: `Graylog instance "${requestedLabel}" not found. ${available}`,
            }],
        };
    }

    const query                    = args.query;
    const searchTimeRangeInSeconds = args.searchTimeRangeInSeconds ?? 900;
    const searchCountLimit         = args.searchCountLimit ?? 50;
    const fields                   = args.fields ?? '*';

    try {
        const response = await axios.get(`${instance.baseUrl}/api/search/universal/relative`, {
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
                username: instance.apiToken,
                password: 'token',
            },
        });

        if (process.env.DEBUG === "true") {
            console.error(`[graylog-mcp] instance=${instance.label} query=${query} hits=${response.data?.total_results ?? '?'}`);
        }

        return {
            result: response.data,
            content: [{
                type: "text",
                text: JSON.stringify(response.data.messages),
            }],
        };
    } catch (error) {
        console.error(`[graylog-mcp] Error fetching messages (instance=${instance.label}):`, error.message);
        return {
            result: [],
            content: [{
                type: "text",
                text: `Error fetching messages from instance "${instance.label}": ${error.message}`,
            }],
        };
    }
}

const transport = new StdioServerTransport();
await server.connect(transport);
