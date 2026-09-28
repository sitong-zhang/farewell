# ui-icons-hub MCP 服务器

让 AI 助手（Claude Desktop / Cursor / 任何 MCP 客户端）直接检索 **215 套开源图标库 / 345,961 个 SVG 图标**，
支持中文意图（`购物车`、`齿轮`、`游戏手柄`），并且能直接拿到 SVG 源码——写页面时不用再凭记忆编图标名。

**零依赖**：不装 `@modelcontextprotocol/sdk`，直接实现 stdio 上的 JSON-RPC 2.0，只要 Node 18+。

## 提供的工具

| 工具 | 用途 |
| --- | --- |
| `search_icons` | 检索图标。支持中文/英文、多词 OR；`with_svg: true` 连源码一起返回；可用 `set` 限定某套图标库 |
| `get_icon` | 按 `slug` + 名字精确取一个图标的 SVG 源码 |
| `list_collections` | 列出 215 套图标库（名称/slug/数量/许可证/星标/官网），可按 group 或关键词过滤 |
| `collection_info` | 看某套库的详情与图标名样例，判断风格是否合用 |
| `pick_set` | 按需求描述（如「极简线性，做后台管理界面」）推荐最合适的几套库并说明理由 |

## 装到 Claude Desktop

编辑 `claude_desktop_config.json`：

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

如果不想走 npm，直接指向本地文件：

```json
{
  "mcpServers": {
    "ui-icons-hub": {
      "command": "node",
      "args": ["/绝对路径/ui-icons-hub/mcp/server.mjs"]
    }
  }
}
```

## 装到 Cursor

`~/.cursor/mcp.json` 里加同样的 `mcpServers` 片段即可。

## 数据来源

按优先级自动选择：

1. 环境变量 `UIH_BASE` —— 本地目录，需含 `index.json` 与 `data/`（离线版压缩包解压后就是这种结构）
2. 环境变量 `UIH_CDN` —— 默认 `https://cdn.jsdelivr.net/gh/sitong-zhang/ui-icons-hub@main/`

索引只在第一次调用工具时拉取（gzip 约 1.4 MB），之后常驻内存；SVG 本体按需下载命中所在的分片。

```json
{
  "mcpServers": {
    "ui-icons-hub": {
      "command": "npx",
      "args": ["-y", "@ui-icons-hub/mcp"],
      "env": { "UIH_CDN": "https://cdn.jsdelivr.net/gh/sitong-zhang/ui-icons-hub@v1.0.0/" }
    }
  }
}
```

## 返回示例

```json
{
  "query": "购物车",
  "count": 5,
  "results": [
    { "name": "cart", "slug": "ionic-team__ionicons", "set": "Ionicons",
      "repo": "ionic-team/ionicons", "license": "MIT", "homepage": "https://ionicons.com",
      "group": "general", "mono": true,
      "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\">…</svg>" }
  ]
}
```

## 许可

图标素材版权归各上游项目所有，**没有统一许可证**，以每个集合上游的实际许可证为准（返回里的 `license` 字段）。
完整清单见仓库 [README](https://github.com/sitong-zhang/ui-icons-hub#readme)。
本 MCP 服务器代码为 MIT。
