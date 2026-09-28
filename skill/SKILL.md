---
name: ui-icons-hub
description: 从 215 套开源图标库（345,961 个 SVG 图标）里检索并取用图标，支持中文意图（购物车/齿轮/游戏手柄）。当任务涉及找图标、给界面配图标、写 SVG、挑图标库、确认图标许可证时使用本技能，避免凭记忆编造图标名。
---

# ui-icons-hub · 图标检索与取用

## 什么时候用

- 用户要给页面 / 应用 / PPT / 文档配图标，但没指定用哪个图标库
- 需要某个语义的图标：**购物车、齿轮（设置）、太阳（主题）、曲线图、邮件、游戏手柄、扫码、客服…**
- 需要图标库的 SVG 源码（想直接贴进代码或 SVG 文件）
- 要确认某个图标的**许可证**能不能商用
- 要挑一套风格统一的图标库（线性 / 实心 / 像素 / 品牌 / emoji）

**核心原则：不要凭记忆编图标名。** 先在本库里搜真实存在的名字，拿到真实 SVG 再用。

## 怎么用

技能自带一个零依赖检索脚本（只要系统有 Python 3，无需联网也能用离线数据）：

```bash
# 中文意图检索（推荐第一步）
python3 scripts/search.py "购物车" --limit 10

# 连 SVG 源码一起拿到
python3 scripts/search.py "齿轮" --limit 3 --svg

# 限定在某套库里找（风格更统一）
python3 scripts/search.py "arrow" --set lucide-icons__lucide --limit 10

# 输出 JSON，便于程序化处理
python3 scripts/search.py "游戏手柄" --json --limit 5

# 有哪些库可选
python3 scripts/search.py --collections

# 某套库的详情（许可、官网、图标名样例）
python3 scripts/search.py --info tabler__tabler-icons

# 按需求推荐图标库
python3 scripts/search.py --pick "极简线性，做后台管理界面"
```

脚本路径是相对**技能目录**的：`scripts/search.py`。数据源优先级：`UIH_BASE` 环境变量 → 技能内 `assets/` → jsDelivr CDN。

## 检索能力的边界

- **中文意图靠词典**（183 条），覆盖常见 UI 语义：购物车、齿轮、太阳、月亮、箭头、返回、首页、用户、设置、搜索、删除、编辑、上传、下载、通知、邮件、电话、地图、钱包、货币、图表、日历、时钟、锁、钥匙、播放、暂停、音量、WiFi、云、文件夹、标签、购物、支付、客服、扫码、游戏手柄…
- 词典没有的中文词，**拆成单个字或改用英文关键词**往往更有效（如「物流」→ `truck` / `shipping`）
- 英文支持**多词 OR**：`feather home` 会匹配含 feather 或含 home 的名字
- 结果排序：完全同名 > 前缀命中 > 词边界命中 > 子串命中

## 拿到图标之后

1. **改色**：单色图标（返回里 `mono: true`）用 `currentColor`，在 CSS 里设 `color` 即可，不要手动替换 `fill` 属性。
2. **署名与合规**：返回结果带 `license` 与 `homepage`。MIT / Apache-2.0 / CC0 / ISC / BSD 可放心用（保留原声明为佳）；
   品牌图标（Simple Icons 等）请注意商标使用规范——**图标可自由使用，但用它代表对应品牌时不得暗示官方背书**。
3. **风格统一**：同一个项目尽量只用一套库，混用会出现线宽 / 圆角 / 网格不一致的问题。用 `--set` 锁定。

## 常用图标库速查

| 风格 | 推荐 | 许可证 | 图标数 |
| --- | --- | --- | --- |
| 极简线性、通用 UI | Feather Icons | MIT | 286 |
| 极简线性、数量多 | Lucide | ISC | 1,600+ |
| 通用、覆盖最广 | Tabler Icons | MIT | 6,268 |
| 通用、线宽可调 | Material Symbols | Apache-2.0 | 15,000+ |
| 描边 + 实心成对 | Phosphor Icons | MIT | 9,000+ |
| 品牌 / 技术 logo | Simple Icons | CC0-1.0 | 3,000+ |
| 像素风 | Pixelarticons | MIT | 1,306 |
| 表情 / 旗帜 | Twemoji / Noto Emoji | CC-BY-4.0 / OFL | 数千 |

完整清单用 `python3 scripts/search.py --collections` 查看（215 套）。

## 许可

图标素材版权归各上游项目所有，**没有统一许可证**，以每套库上游的实际许可证为准（脚本输出里的 `license` 字段）。
完整清单见 <https://github.com/sitong-zhang/ui-icons-hub#readme>。本技能脚本为 MIT。
