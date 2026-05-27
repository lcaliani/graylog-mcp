# Graylog MCP Server

A minimal MCP (Model Context Protocol) server in JavaScript that integrates with Graylog.

## Features

- JavaScript MCP server
- Tools: `fetch_graylog_messages` (query Graylog and return messages)
- Multi-instance support — query multiple Graylog servers from a single MCP server

## Requirements

- Node.js 18+

## Installation

```bash
git clone git@github.com:lcaliani/graylog-mcp.git
cd graylog-mcp
npm install
```

## Configuration

Configure one or more Graylog instances using numbered env vars:

| Variable | Required | Description |
|---|---|---|
| `GRAYLOG_BASE_URL_INSTANCE_N` | yes | Graylog base URL for instance N |
| `GRAYLOG_API_TOKEN_INSTANCE_N` | yes | API token for instance N |
| `GRAYLOG_LABEL_INSTANCE_N` | no | Human-readable label (default: `instance_N`) |

Replace `N` with `1`, `2`, `3`, … to register as many instances as needed. Only instances with both `BASE_URL` and `API_TOKEN` set will be active.

## Use with an MCP client

### Claude Code

Run the following command to register the server _(example with two instances)_:

```bash
claude mcp add graylog-mcp node /path/to/graylog-mcp/src/index.js \
  -e GRAYLOG_BASE_URL_INSTANCE_1=http://your-graylog-production.example.com:9000 \
  -e GRAYLOG_API_TOKEN_INSTANCE_1=your_production_token \
  -e GRAYLOG_LABEL_INSTANCE_1=production \
  -e GRAYLOG_BASE_URL_INSTANCE_2=http://your-graylog-staging.example.com:9000 \
  -e GRAYLOG_API_TOKEN_INSTANCE_2=your_staging_token \
  -e GRAYLOG_LABEL_INSTANCE_2=staging
```

Or add it manually to `~/.claude.json`:

```json
{
  "mcpServers": {
    "graylog-mcp": {
      "command": "node",
      "args": [
        "/path/to/graylog-mcp/src/index.js"
      ],
      "env": {
        "GRAYLOG_BASE_URL_INSTANCE_1":  "http://your-graylog-production.example.com:9000",
        "GRAYLOG_API_TOKEN_INSTANCE_1": "your_production_token",
        "GRAYLOG_LABEL_INSTANCE_1":     "production",

        "GRAYLOG_BASE_URL_INSTANCE_2":  "http://your-graylog-staging.example.com:9000",
        "GRAYLOG_API_TOKEN_INSTANCE_2": "your_staging_token",
        "GRAYLOG_LABEL_INSTANCE_2":     "staging"
      }
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "graylog-mcp": {
      "command": "node",
      "args": [
        "/path/to/graylog-mcp/src/index.js"
      ],
      "env": {
        "GRAYLOG_BASE_URL_INSTANCE_1":  "http://your-graylog-production.example.com:9000",
        "GRAYLOG_API_TOKEN_INSTANCE_1": "your_production_token",
        "GRAYLOG_LABEL_INSTANCE_1":     "production",

        "GRAYLOG_BASE_URL_INSTANCE_2":  "http://your-graylog-staging.example.com:9000",
        "GRAYLOG_API_TOKEN_INSTANCE_2": "your_staging_token",
        "GRAYLOG_LABEL_INSTANCE_2":     "staging"
      }
    }
  }
}
```

### Claude Desktop

Config file locations:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/claude-desktop/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Use the same JSON structure shown above for Cursor.

---

Once configured, use the `fetch_graylog_messages` tool. Example prompts:

```
Search for the latest 20 error logs of the example application in the last 15 minutes.
```

```
Search for the latest 20 error logs of the example application in the last 15 minutes.
Query the "staging" Graylog instance.
```


## Available tools

### fetch_graylog_messages

Fetch messages from Graylog.

Parameters:

- `query` (string, **required**): Search query. Example: `level:ERROR AND service:api`.
- `instance` (string, optional): Label of the Graylog instance to query. Defaults to the first configured instance.
- `searchTimeRangeInSeconds` (number, optional): Relative time range in seconds. Default: `900` (15 minutes).
- `searchCountLimit` (number, optional): Max number of messages. Default: `50`.
- `fields` (string, optional): Comma-separated fields to include. Default: `*` (all fields).

## Troubleshooting

- Ensure at least `GRAYLOG_BASE_URL_INSTANCE_1` and `GRAYLOG_API_TOKEN_INSTANCE_1` are set
- Verify Node.js version is 18+.
- Run `npm install` if dependencies are missing.
- Set `DEBUG=true` in the env to enable verbose logging to stderr.

## License

MIT
