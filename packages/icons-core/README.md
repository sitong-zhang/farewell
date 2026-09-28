# @ui-icons-hub/icons

215 套开源图标库 / **345,961 个 SVG 图标**的检索 API。支持中文意图（`购物车`、`齿轮`、`游戏手柄`直接命中）。
**零依赖**，浏览器与 Node 18+ 通用。

## 安装

```bash
npm i @ui-icons-hub/icons
```

## 用法

```js
import { search, searchSvg, icon, list, names, synonyms } from "@ui-icons-hub/icons";

// 只拿名字和归属（快，不下载图标数据）
const hits = await search("购物车", { limit: 10 });
// → [{ name:'cart', slug:'ionic-team__ionicons', set:'Ionicons', license:'MIT', ... }]

// 连 SVG 源码一起拿（自动加载命中所在的分片，只加载那几个）
const withSvg = await searchSvg("齿轮", { limit: 5 });
// → [..., svg:'<svg xmlns="..." viewBox="0 0 24 24">…</svg>']

// 精确取一个
const one = await icon("feathericons__feather", "activity");

// 库里有什么
const sets  = await list();               // 215 套
const brand = await list("brand");        // 31 套品牌
const all   = await names("tabler__tabler-icons");   // 某套全部图标名
const syn   = await synonyms();           // 183 条中文意图词典

// 换数据源（默认 jsDelivr；离线包解压后传本地目录即可完全离线）
import { configure } from "@ui-icons-hub/icons";
configure({ base: "/path/to/ui-icons-hub" });   // 目录里要有 index.json 和 data/
```

## API

| 函数 | 说明 |
| --- | --- |
| `search(q, opt?)` | 检索，返回名字与归属（`set`/`repo`/`license`/`homepage`/`group`/`mono`/`alias`） |
| `searchSvg(q, opt?)` | 同上并附 `svg` 完整源码 |
| `icon(slug, name)` | 精确取一个图标 |
| `list(group?)` | 图标库清单，`group` 可选 `general` / `brand` / `emoji` |
| `names(slug)` | 某套库全部图标名 |
| `synonyms()` | 中文意图词典 |
| `configure({ base })` | 指定数据源（本地目录或 CDN 地址） |

`opt` 支持：`limit`（默认 30，上限 100）、`set`（限定某套库的 slug）。

## 排序规则

完全同名 > 前缀命中 > 词边界命中 > 子串命中；多词查询按 OR 匹配；
中文词会先经过内置词典展开（如 `购物车` → `cart` / `shopping-cart` / `basket`）。

## 数据与许可

- 索引（`index.json`，gzip 约 1.4 MB）首次调用时拉取；SVG 按需下载命中所在的分片，**不会**把 300 MB 全下下来。
- 图标素材版权归各上游项目所有，**没有统一许可证**，以每套库上游的实际许可证为准
  （返回里的 `license` 字段就是它的许可证）。完整清单见[仓库 README](https://github.com/sitong-zhang/ui-icons-hub#readme)。
- 本包代码为 MIT。

## 相关包

- [`@ui-icons-hub/mcp`](https://www.npmjs.com/package/@ui-icons-hub/mcp)：同样的能力封装成 MCP 服务器，给 AI 助手用
- [在线预览](https://sitong-zhang.github.io/ui-icons-hub/) · [CDN 一行引入](https://sitong-zhang.github.io/ui-icons-hub/cdn.html)
