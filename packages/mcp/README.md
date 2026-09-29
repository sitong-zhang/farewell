# @ui-icons-hub/mcp (npm package)

MCP (Model Context Protocol) server for [ui-icons-hub](https://github.com/sitong-zhang/ui-icons-hub) —
lets Claude Desktop, Cursor or any MCP client search **215 open-source icon
libraries / 345,961 SVG icons**, with Chinese-intent support.

Zero dependencies. Single file (`server.mjs`), talks JSON-RPC 2.0 over stdio.

## Tools

| Tool | Purpose |
| --- | --- |
| `search_icons` | Search by keyword (Chinese or English); returns names / sets / licenses, no SVG bodies |
| `get_icon` | Fetch one icon's full SVG source |
| `list_collections` | List all sets, filterable by group (`general` / `brand` / `emoji`) |
| `collection_info` | One set's details: license, homepage, icon count, aliases |
| `pick_set` | Recommend a library for a style/scene description |

## Register in Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ui-icons-hub": {
      "command": "npx",
      "args": ["-y", "@ui-icons-hub/mcp"]
    }
  }
}
```

## Register in Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ui-icons-hub": {
      "command": "npx",
      "args": ["-y", "@ui-icons-hub/mcp"]
    }
  }
}
```

## Data sources

Priority order:

1. `UIH_BASE` — a local directory containing `index.json` and `data/` (fully
   offline)
2. `UIH_CDN` — a CDN base URL; defaults to
   `https://cdn.jsdelivr.net/gh/sitong-zhang/ui-icons-hub@main/`

Pin a version for reproducibility:

```json
"env": { "UIH_CDN": "https://cdn.jsdelivr.net/gh/sitong-zhang/ui-icons-hub@v1.0.0/" }
```

The index (~1.4 MB gzipped) loads once on first use; icon chunks load on
demand only for matched sets — a search never downloads the full 300 MB.

## License

MIT (this server's code). Icon artwork follows each upstream collection's own
license — see the [upstream listing](https://github.com/sitong-zhang/ui-icons-hub#readme).
