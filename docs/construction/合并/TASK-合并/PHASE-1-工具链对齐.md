# Phase 1 施工蓝图：工具链对齐（Node 24 + npm 11）

> **执行者**：agent。本文件自包含，不需要对话历史即可执行。
> **风险等级**：零（纯环境操作，不碰仓库、不碰依赖、可多版本共存）
> **预计耗时**：5–15 分钟（装 Node）+ 2 分钟（镜像配置）
> **文档规范**：见 [BLUEPRINT-总蓝图.md](BLUEPRINT-总蓝图.md) 第七节

---

## 一、施工目标

### 核心问题

项目 `package.json` 声明：

```json
"engines": { "node": ">=24 <25", "npm": ">=10" }
```

而本机实测（Phase 0 报告确认）：

```
node -v  →  v22.23.2      ← 不满足 >=24
npm  -v  →  10.9.8
```

官方 `package-lock.json` 是**用 npm 11.16（Node 24）生成的**（提交 `84f69f88`）。

### 三个具体后果

| # | 后果 | 说明 |
|---|---|---|
| 1 | `npm ci` 报 `EBADENGINE` | Node 22 不满足 `>=24` |
| 2 | 依赖树与官方分歧 | 用 npm 10.9.8 装出的树可能与官方不一致 → **之后所有"某功能坏了"的判断都失去可信度**（无法区分是代码问题还是依赖问题） |
| 3 | **合并完成后无法验证** | P8 的全部验证手段依赖此环境，见下 |

**后果 3 是把这个 Phase 单独列出的唯一原因。** P8 要跑：

```bash
npx tsc -p tsconfig.main.json       # 主进程类型检查
npx tsc -p tsconfig.preload.json    # preload 类型检查
npm run check:renderer              # 渲染层类型检查（官方新增）
npx vitest run                      # 全量测试
npm run build && npm run build:renderer
```

**没有 Node 24，这些一条都跑不了 → 等于盲合并。**

### 目标清单

- [ ] 本机 `node -v` 满足 `>=24 <25`
- [ ] 本机 `npm -v` 满足 `>=10`（期望 11.x）
- [ ] **Node 22 仍可切回**（用于对照排查）
- [ ] 镜像源已配置（加速 P8 的依赖安装）
- [ ] **仓库状态与 Phase 0 基线完全一致**（证明本 Phase 零副作用）

### 非目标（明确不做的范围）

| 不做 | 原因 | 何时做 |
|---|---|---|
| ❌ `npm ci` / `npm install` | 依赖树要在**合并之后**整体替换；现在装是浪费时间且可能装出半成品 | P8 |
| ❌ 改 `package.json` / `package-lock.json` | 取官方版 + 重贴版本号是合并的一部分 | P3 之前 |
| ❌ 删 `node_modules` | 现在删了也没有正确的树可装 | P8 |
| ❌ 改 `.gitattributes` | P2 的职责 | P2 |
| ❌ 跑 `tsc` / `vitest` / `build` | 依赖树还是基准版（`vite` 7.3.6），跑了结果无意义 | P8 |
| ❌ `git merge` | P3 的职责 | P3 |
| ❌ 改 `engines` 字段去迁就 Node 22 | 会与官方分歧，后患无穷 | 永不 |

---

## 二、前置条件与停止条件

### 前置条件（不满足则**不得开始**）

```powershell
cd E:\AI_Chating\cyrene-agent
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 前置 1：Phase 0 的两个锚点必须在
git tag --list phase0-full      # 必须输出 34f0669f...
git tag --list phase0-tracked   # 必须输出 d48b0cc8...

# 前置 2：工作区基线与 Phase 0 报告一致
(git status --porcelain).Count                    # 期望 219
(git ls-files --others --exclude-standard).Count  # 期望 135

# 前置 3：磁盘空间
Get-PSDrive E | Select-Object @{n='Free(GB)';e={[math]::Round($_.Free/1GB,1)}}   # 期望 > 10
```

> 基线数值来源：[PHASE-0-完成报告.md](PHASE-0-完成报告.md) 第五节。

### 停止条件（出现则**立即停止并报告**，不要自行绕过）

| 情况 | 为什么必须停 |
|---|---|
| `phase0-full` 标签不存在 | 没有回退网，任何后续操作都不可逆 |
| 工作区未跟踪文件数 **< 135** | 可能已经丢了文件，先查清楚再动 |
| 执行过程中 `git status` 数量发生变化 | 本 Phase 不该碰仓库，说明有意外副作用 |
| `node -v` 装完仍显示 v22 | 不要"将就着继续"，P8 会全部失效 |

---

## 三、改动清单（Agent 直接执行）

### 3.0 改动范围声明

| 项目 | 是否改动 |
|---|---|
| 源代码 / 配置文件 | ❌ |
| `node_modules/` | ❌ **保持现状**（仍是基准版 `vite` 7.3.6） |
| 仓库 git 状态 | ❌ **必须零变化** |
| 系统 Node 安装 | ✅ 新增 24（建议与 22 共存） |
| 系统环境变量 | ⚠️ 可能新增（取决于安装方式） |

### 3.1 选择安装方式

| 方式 | 优点 | 缺点 | 推荐 |
|---|---|---|---|
| **A. 官方 MSI** | 最简单 | 会**替换**系统默认 Node（22 被覆盖，无法切回对照） | ⭐⭐ |
| **B. fnm** | 快、跨平台、支持按项目切版本 | 需一次 shell 配置 | ⭐⭐⭐⭐⭐ |
| **C. nvm-windows** | Windows 普及 | 需管理员权限 | ⭐⭐⭐⭐ |
| **D. volta** | 自动切版本 | 生态小 | ⭐⭐⭐ |

> **推荐 B（fnm）**。理由不是习惯，而是本任务的硬需求：
> **必须保留 Node 22** —— 若官方依赖树在 Node 24 上出问题，需要能立刻切回对照。
> 另外合并沙箱与官方 clone 可能也需要不同版本。

> ⚠️ 本机**没有任何版本管理器**（Phase 0 前实测：`nvm`/`fnm`/`volta`/`nvs` 全部 not found）。
> 所以无论选哪个，都是**从零安装**。

### 3.2 安装 Node 24

**方式 B（fnm）**：
```powershell
winget install Schniz.fnm
fnm env --use-on-cd | Out-String | Invoke-Expression
fnm install 24
fnm use 24
```

**方式 A（官方 MSI）**：
从 https://nodejs.org/ 下载 **Node 24.x LTS** Windows x64 MSI，安装时勾选 "Add to PATH"。

**方式 C（nvm-windows，需管理员）**：
```powershell
nvm install 24
nvm use 24
```

### 3.3 验证 Node 与 npm（必做）

```powershell
node -v     # 期望 v24.x.y
npm -v      # 期望 11.x
```

若 `npm -v` 仍是 10.x（版本管理器复用了旧 npm）：
```powershell
npm install -g npm@11
```

### 3.4 配置镜像源

背景：官方的依赖树有 **20+ 个新依赖**（Tailwind、LobeHub UI、streamdown、katex、devicon…）
加上 Electron 44 的二进制。两个仓库**都没有 `.npmrc`**，当前源是 `registry.npmjs.org`。

```powershell
npm config get registry                                        # 查看当前
npm config set registry https://registry.npmmirror.com          # 建议切换

# Electron 二进制镜像（P8 重装依赖时需要）
[Environment]::SetEnvironmentVariable("ELECTRON_MIRROR", "https://npmmirror.com/mirrors/electron/", "User")
```

> **注意**：锁文件里记的是 npmjs 的 `resolved` URL。若 P8 时下载失败，
> 临时用 `npm ci --registry=https://registry.npmmirror.com` 覆盖。
> **本 Phase 不要改锁文件**（那是 P8 的事）。

---

## 四、验收测试

### A1 · engines 满足性（核心验收）

```powershell
node -e "const v=process.versions.node.split('.').map(Number); console.log(v[0]===24 ? 'engines OK  ' + process.versions.node : 'engines FAIL  ' + process.versions.node)"
```
**期望输出**：`engines OK  24.x.y`
**失败处置**：若输出 `FAIL` → 停止，回到 3.2 排查 PATH 缓存（重开终端 / 重新注入 `fnm env`）。

### A2 · Node 22 可切回（硬需求，不可跳过）

```powershell
fnm list        # 方式 B
# 或
nvm list        # 方式 C
```
**期望**：列表里**同时**能看到 22.x 与 24.x。
**失败处置**：若只有 24 → 说明用了方式 A（MSI 覆盖）。此时改用版本管理器重装，否则失去对照能力。

### A3 · 仓库零副作用（最重要）

```powershell
cd E:\AI_Chating\cyrene-agent
Write-Output "status 行数: $((git status --porcelain).Count)   (期望 219)"
Write-Output "未跟踪数:   $((git ls-files --others --exclude-standard).Count)   (期望 135)"
Write-Output "head:       $(git rev-parse --short HEAD)   (期望 eb6c311a)"
Write-Output "vite 版本:  $((Get-Content node_modules/vite/package.json -Raw | ConvertFrom-Json).version)   (期望 7.3.6)"
```
**期望**：219 / 135 / eb6c311a / 7.3.6
**失败处置**：任何一个不符 → 停止。用 `git diff phase0-full --stat` 查清丢了什么。

### A4 · 镜像源已生效

```powershell
npm config get registry
```
**期望**：非 `https://registry.npmjs.org/`（或你确认要留官方源）

### A5 · 端到端冒烟（证明 Node 24 真的能跑）

```powershell
$t = Join-Path $env:TEMP "node24-smoketest"
New-Item -ItemType Directory -Force -Path $t | Out-Null
Set-Location $t
node -e "console.log('node runs ok:', process.versions.node)"
node -e "const c=require('crypto'); console.log('sha256 ok:', c.createHash('sha256').update('x').digest('hex').slice(0,4))"
Set-Location E:\AI_Chating\cyrene-agent
```
**期望**：两行都正常输出，无异常。
**为什么需要**：验证 Node 24 不只是版本号变了，而是**真的能跑**（避免装了个坏二进制）。
**注意**：在临时目录做，**不要**在仓库里创建文件（会污染 A3 的基线）。

---

## 五、产出物清单

| 产出 | 验证方式 |
|---|---|
| Node 24 可用 | A1 |
| Node 22 可切回 | A2 |
| npm 11 | A1（`npm -v`） |
| 仓库零副作用 | A3 |
| 镜像源配置 | A4 |
| 端到端冒烟通过 | A5 |

**交接给 P2 的状态**：`node -v` = v24.x、`npm -v` = 11.x、仓库状态 = P0 基线（219 / 135 / eb6c311a）。

---

## 六、回退方法

本 Phase **不修改仓库**，所以回退 = 切回 Node 22：

```powershell
fnm use 22        # 方式 B
# 或
nvm use 22        # 方式 C
```

彻底移除 Node 24：`fnm uninstall 24` / `nvm uninstall 24`，或从"添加或删除程序"卸载 MSI。

镜像源配错了想恢复：
```powershell
npm config set registry https://registry.npmjs.org/
```

---

## 七、已知坑

| 坑 | 症状 | 应对 |
|---|---|---|
| **PATH 缓存** | 装了 24 但 `node -v` 还是 22 | 重开终端；或重新 `fnm env --use-on-cd \| Out-String \| Invoke-Expression` |
| **fnm 未进 shell 配置** | 新开终端版本又变回 22 | 把 `fnm env --use-on-cd` 写进 PowerShell `$PROFILE` |
| **npm 仍是 10** | `npm -v` = 10.x | `npm install -g npm@11` |
| **管理员权限不足** | `nvm use` 报 access denied | 用管理员 PowerShell；或改用 fnm（不需要管理员） |
| **MSI 覆盖了 Node 22** | 切不回 22 | 改用 fnm/nvm 重装，保住对照能力 |
| **`node_modules` 被误装** | `vite` 不再是 7.3.6 | `node_modules` 不受版本控制，**无法用 git 恢复** → 只能等 P8 重装。**所以本 Phase 绝对不要跑 npm install** |
| **robocopy 退出码假警报** | 若本 Phase 用到 robocopy，退出码可能是 9 | 看汇总的 `Files FAILED` 与 `Mismatch` 列是否为 0；根目录 `NUL` 幻影条目会导致假警报（详见 [P0 报告第四节](PHASE-0-完成报告.md)） |
| **`NUL` 吞掉重定向日志** | `robocopy /LOG:x` 写出的文件恒为 2 字节空白 | 改用 `& robocopy.exe ... 2>&1 \| Set-Content` 捕获 |

---

## 八、给 P2 的交接提示

1. 本机已具备 Node 24 / npm 11，**P8 的验证手段至此可用**
2. 仓库仍是 P0 基线：`219` status 行 / `135` 未跟踪 / HEAD `eb6c311a`
3. 锚点仍在：`phase0-full` → `34f0669f`、`phase0-tracked` → `d48b0cc8`
4. **P2 的第一步是加 `.gitattributes`** —— 这是本任务中**第一个真正修改仓库**的 Phase，
   执行前请再次确认 `git tag --list phase0-full` 有输出
5. P2 会 `git add --renormalize .` 并提交一次，届时 `git status` 数量会**大幅变化**
   —— 这是**预期的**（行尾归一化），不是丢文件。判定方法见 P2 文档
6. 官方 HEAD `b11b8851` **已在本地**（`refs/remotes/official/master`），P3 无需再 fetch
