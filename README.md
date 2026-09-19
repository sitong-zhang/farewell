# UI 图标与设计资源库

一个纯静态站点，收录 GitHub 上星标最高、质量最好的开源 **SVG 图标库** 与各端 **UI 设计资源**，全部数据通过 GitHub 官方 API 与仓库原始文件抓取，图标为仓库内的真实 SVG 源文件，可搜索、一键复制源码、直接下载。

线上地址：<https://111qqq333www444.github.io/farewell-site/>

## 收录内容

| 板块 | 说明 |
| --- | --- |
| 通用 UI 图标 | Font Awesome、Material Symbols、Feather、Lucide、Heroicons、Tabler Icons、IconPark（字节）、Bootstrap Icons、Remix Icon、Fluent System Icons、Eva Icons、Iconoir、Phosphor、Radix Icons、Carbon Icons、Ant Design / TDesign Icons 等 20+ 套 |
| 品牌 · 技术 · 应用图标 | Simple Icons、Devicon、Skill Icons、VS Code Icons、Dashboard Icons、Developer Icons、Lobe Icons、SVG Logos、Super Tiny Icons |
| 表情 · 旗帜 · 动效 | Noto Emoji、Fluent Emoji、Flag Icons、SVG Loaders |
| 图标工具与框架 | Iconify、unplugin-icons、react-icons、react-native-vector-icons、blade-icons 等 |
| Web UI 组件库 | Ant Design、Element Plus、Naive UI、Semi Design、Arco Design、TDesign、MUI、shadcn/ui、Chakra UI、Mantine、Radix、Tailwind CSS、daisyUI、Vuetify、Quasar 等 30+ 个 |
| 移动端 & 小程序 UI 库 | Vant / Vant Weapp、TDesign 小程序、WeUI、NutUI、Taro UI、Ant Design Mobile / Mini、Wot Design Uni、uni-ui、uView、ColorUI、Lin UI、wux-weapp、NativeBase、Konsta 等 |
| 设计系统与设计规范 | Material Components、Fluent UI、Carbon、Primer、awesome-design-systems、awesome-web-design 等 |
| 字体与排版资源 | Google Fonts、Inter、JetBrains Mono、Fira Code、思源黑体、更纱黑体、Noto CJK 等 |

## 文件结构

- `index.html` — 站点页面（搜索、尺寸/颜色调节、图标弹窗复制与下载）
- `icons.js` — `window.ICON_SETS`：图标库元数据 + 内联 SVG（已统一 `currentColor`、压缩降精度）
- `kits.js` — `window.UI_KITS`：UI 组件库 / 小程序 / 设计系统 / 字体项目卡片数据

## 数据说明

- 星标数、描述、许可证、语言均取自 GitHub REST API 实时抓取（抓取时间 2026-09-20）。
- 图标为各仓库默认分支内的原始 SVG 文件，单色图标统一为 `currentColor`（可用 CSS `color` 改色），彩色图标保留原始配色。
- 各图标版权与许可证归原项目所有，商用前请遵循对应 License（如 Font Awesome 部分图标为 CC BY 4.0、Simple Icons 为 CC0-1.0、多数为 MIT / Apache-2.0）。
