# Prompt Debugger

OpenAI Chat Completions 提示词调试工作台，基于 Tauri 2 + React 19 + TypeScript 构建。可以导入、编辑请求与响应，也可以直接向兼容接口发送请求并实时查看流式输出。

## 功能

- **工作区**：原生目录选择，仅浏览 `.json` / `.sse` 文件；右键菜单支持新建、重命名、删除与复制路径，侧栏宽度可拖拽调整，文件名过长时悬浮显示完整名称；文件与文件夹 CRUD 在 Rust 安全边界内完成，拒绝绝对路径、`..` 和符号链接逃逸。
- **兼容记录文件**：自动跳过文件开头的 HTTP 请求/响应头，从正文开始解析 JSON 或 SSE；扫描行数可在设置中调整（默认 50 行）并持久化。
- **请求编辑**：粘贴或打开 Chat Completions 请求，结构化编辑消息（多模态 parts、`tool_calls`），Raw JSON 树与源码视图同步，完整保留未知字段。
- **响应查看**：导入普通 JSON 或 SSE 响应，按 choice 聚合 `reasoning_content`、`content` 与工具调用，提供分区卡片和 Raw 视图。
- **实时调试**：通过 Rust `reqwest` 发送请求，Token 只保存在内存中；流式响应经 Tauri Channel 增量渲染，支持取消。
- **快捷键**：`Cmd/Ctrl+B` 折叠侧栏，`Cmd/Ctrl+S` 保存请求。

## 环境要求

- Node.js 20+ 与 npm
- Rust 1.77.2+ 与 Cargo
- 运行 UI 冒烟测试需要本机安装 Google Chrome

## 快速开始

```sh
make install   # 安装前端依赖
make tauri-dev # 启动桌面应用（包含 Vite dev server）
```

只调试前端时：

```sh
make dev       # http://localhost:1420
```

## 常用命令

| Make 目标 | 等价命令 | 说明 |
| --- | --- | --- |
| `make install` | `npm install` | 安装依赖 |
| `make dev` | `npm run dev` | 启动 Vite 前端 |
| `make build` | `npm run build` | 类型检查并构建前端 |
| `make test` | `npm test` | 运行前端单测（Vitest） |
| `make test-watch` | `npm run test:watch` | 监听模式运行单测 |
| `make rust-check` | `cargo check --manifest-path src-tauri/Cargo.toml` | 检查 Rust 代码 |
| `make rust-test` | `cargo test --manifest-path src-tauri/Cargo.toml` | 运行 Rust 测试 |
| `make tauri-dev` | `npm run tauri dev` | 桌面开发模式 |
| `make tauri-build` | `npm run tauri build` | 构建 release 应用 |
| `make dmg` | `npm run tauri build -- --bundles dmg` | 构建 macOS dmg 并输出到 `dist/` |
| `make test-ui` | `npm run test:ui` | Playwright UI 冒烟测试 |
| `make clean` | `rm -rf dist src-tauri/target` | 清理构建产物 |

UI 冒烟测试需要先启动 `make dev`，然后另开终端执行 `make test-ui`。如需指定 Chrome 路径，可设置 `CHROME_PATH` 环境变量；截图默认输出到 `/tmp/prompt-debugger-*.png`。

`make dmg` 构建完成后会把 dmg 移动到 `dist/`，`make clean` 和前端构建都会清空该目录。macOS 首次打包时若提示终端无权控制 Finder，请在“系统设置 → 隐私与安全性 → 自动化”中授权；无图形环境可用 `CI=true make dmg` 跳过 Finder 美化步骤。

## 项目结构

```text
src/                     React 前端
  components/            请求编辑器、响应查看器、工作区侧栏、API 设置
  lib/                   OpenAI 模型、SSE 解析、请求格式化、工作区封装
src-tauri/src/           Rust 命令与窗口逻辑
  workspace.rs           工作区目录树与文件 CRUD
  api.rs                 Chat Completions 请求与流式转发
scripts/ui-smoke.mjs     Playwright UI 冒烟脚本
note/                    本地笔记与参考图（已加入 .gitignore，不纳入版本控制）
```

## 说明

- API Token 不会写入请求体、文件或日志。
