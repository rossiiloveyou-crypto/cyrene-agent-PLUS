# Phase 1 完成报告：工具链对齐（Node 24 + npm 11）

> **状态**：✅ **已完成**（2026-09-27）
> **执行依据**：[PHASE-1-工具链对齐.md](PHASE-1-工具链对齐.md)
> **风险等级**：零（纯环境操作，仓库零副作用）
> **验收**：A1–A5 **全部通过**

---

## 一、执行摘要

| 项目 | 执行前 | 执行后 |
|---|---|---|
| `node -v` | `v22.23.2` ❌ | **`v24.21.0`** ✅ |
| `npm -v` | `10.9.8` ❌ | **`11.19.0`** ✅ |
| Node 22 对照能力 | — | ✅ **保留**（`D:\data\node` 原样未动） |
| registry | `registry.npmjs.org` | `https://registry.npmmirror.com` |
| `ELECTRON_MIRROR` | 未设置 | `https://npmmirror.com/mirrors/electron/` |
| 仓库 git 状态 | 219 / 137 / `eb6c311a` / 1893 | **完全一致（零变化）** |

**结论**：P8 的全部验证手段（`tsc` / `check:renderer` / `vitest` / `build`）**自此可用**，解除「盲合并」风险。

---

## 二、与蓝图的偏差（3 处，均已处置）

### 偏差 1 · 安装方式改为「zip 绿色版」（蓝图 3.1 的方式 A/B/C 全部不适用）

蓝图推荐 **B（fnm）**，其次 C（nvm-windows）/ A（官方 MSI）。**本机实测这三条路都走不通**：

| 蓝图方案 | 实测结果 |
|---|---|
| B · fnm | `winget` **不在 PATH**（仅 `%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe` 存在），且 `fnm`/`nvm`/`volta`/`nvs` **全部 not found** |
| C · nvm-windows | **需要管理员权限**，当前会话 `IsInRole(Administrator)` = **False** |
| A · 官方 MSI | 蓝图明确反对（会覆盖 Node 22，**失去对照能力**） |

**实际采用：zip 绿色版**，理由如下（这不只是退而求其次）：

1. **本机既有模式就是 zip 绿色版** —— Node 22 装在 `D:\data\node`（非 MSI、非 nvm），
   且 `D:\data\node_temp\` 里存有 `node.zip` + `unzipped\node-v22.23.2-win-x64`，
   证明**上次就是用 zip 装的**。沿用同一模式，行为可预期、无需管理员。
2. **完全满足蓝图的核心硬需求** —— 「Node 22 必须可切回」。
   `D:\data\node` **一个字节都没动**，Node 22 随时可用完整路径调用。
3. **零系统侵入** —— 不写 `Program Files`、不注册 MSI、不改系统 PATH（只改**用户** PATH）。

> ⚠️ **本节结论对 P8 仍有效**：若 P8 遇到依赖问题需要切回 Node 22 对照，
> 用 `D:\data\node\node.exe` 显式调用即可，无需任何安装动作。

### 偏差 2 · 未跟踪文件数 **137** ≠ 蓝图期望的 **135**（已查清，非文件丢失）

蓝图第二节把「未跟踪文件数 < 135」列为停止条件。实测 **137**（大于 135，未触发停止条件），
但为排除丢文件风险，已用 **P0 自己生成的快照**做逐文件比对。

**比对方法**（注意：`baseline-untracked.txt` 因编码问题不能直接读，见偏差 3）：

```powershell
# 用 git 现状 vs P0 快照，按「文件名集合」比对
git -c core.quotepath=false ls-files --others --exclude-standard   # 137 行
Get-Content .cyrene-merge-analysis\baseline-untracked.txt          # P0 时 130 行
```

**比对结果**：

| 方向 | 结果 |
|---|---|
| P0 快照有 → 现在没有 | **0 个**（显示出的 9 个全是**编码假阳性**，见偏差 3） |
| 现在有 → P0 快照没有 | **7 个**，全部是 P0 **之后**生成的产物 |

新增的 7 个文件：

```
.cyrene-merge-analysis/50-A_官方删除.txt          ← 分析产物
.cyrene-merge-analysis/50-B_真冲突.txt            ← 分析产物
.cyrene-merge-analysis/baseline-diffstat.txt      ← P0 基线快照自身
.cyrene-merge-analysis/baseline-index.txt         ← P0 基线快照自身
.cyrene-merge-analysis/baseline-untracked.txt     ← P0 基线快照自身
.cyrene-merge-analysis/protected-features-baseline.json  ← P0 基线快照自身
.cyrene-merge-analysis/robocopy-phase0-summary.txt       ← P0 备份产物
```

**数字闭合（130 → 135 → 137 全部对上）**：

```
130（P0 快照记录时）
 +4（baseline-diffstat / baseline-index / baseline-untracked / protected-features-baseline.json）
 +1（robocopy-phase0-summary.txt）        = 135  ← 蓝图成文时刻的口径
 +2（50-A_官方删除.txt / 50-B_真冲突.txt） = 137  ← 本次实测
```

**判定**：`status=219`、`index=1893`、`HEAD=eb6c311a` **三项与 P0 报告逐字一致**，
已跟踪改动**无任何变化**；未跟踪增量**全部是 `.cyrene-merge-analysis/` 下的分析产物**。
→ **零文件丢失，137 与 135 不矛盾**。

> 📌 **给后续 Phase 的口径修正建议**：未跟踪数应记为 **137**，并把判定条件改为
> 「**不得低于** 137」而非「等于 135」。否则 P2 执行时会再次触发同一个假警报。

### 偏差 3 · `baseline-untracked.txt` 存在编码缺陷（P0 遗留，建议 P2 留意）

用 `Compare-Object` 比对时出现 **9 个"丢失"文件**，全部是**中文名文件**，形如：

```
.cyrene-merge-analysis/50-A_�ٷ�ɾ��.txt      ← 乱码
docs/merge-plan/00-��������Ԥ��.md            ← 乱码
```

**根因**：P0 生成该快照时在 **PowerShell 5.1** 环境下用了 `Set-Content -Encoding UTF8`。
PS 5.1 的 `-Encoding UTF8` 会写 **BOM**，但 `Get-Content` 在 PS 5.1 下默认按 **ANSI(GBK)** 解码，
导致**读回时中文乱码** → 与 `git` 输出的 UTF-8 文件名无法逐字匹配。

**影响范围**：仅影响「用 PS 5.1 读取该快照做字符串比对」这一种用法。
**不影响** git 本身、不影响文件真实存在性（9 个文件两侧数量完全对应）。

**正确读法**：

```powershell
[System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)   # 或
Get-Content $p -Encoding UTF8                                      # PS 5.1 下显式指定
```

> 这正好印证了[总蓝图](BLUEPRINT-总蓝图.md)第二节约束 2 中「PowerShell 中文乱码」那条陷阱——
> 但陷阱的实际形态比文档描述的更隐蔽：**写入端加了 BOM，读取端仍按 ANSI 解码**。

---

## 三、环境变更清单（Agent 直接执行的内容）

### 3.1 新增文件与目录

| 路径 | 内容 | 说明 |
|---|---|---|
| `D:\data\node24\` | Node **v24.21.0** win-x64 完整发行版 | 绿色版，含 `node.exe`(89.2 MB) + 自带 npm **11.19.0** |
| `D:\data\node_temp\node-v24.21.0-win-x64.zip` | 安装包（35.88 MB） | 归档留存 |
| `D:\data\node_temp\user-path-backup-before-node24.txt` | **用户 PATH 原始值备份** | **回退关键文件** |

> 本机**未安装任何版本管理器**（fnm/nvm/volta/nvs 均无）——这与 P0 报告一致。

### 3.2 环境变量变更

| 变量 | 作用域 | 变更 |
|---|---|---|
| `PATH` | **User** | **前置** `D:\data\node24;`；**保留** 原 `D:\data\node`（Node 22） |
| `ELECTRON_MIRROR` | **User** | 新增 `https://npmmirror.com/mirrors/electron/` |

**新用户 PATH 实测值**（`HKCU\Environment\Path`）：

```
D:\data\node24;C:\Users\beiki\AppData\Local\Programs\Python\Python310\Scripts\;C:\Users\beiki\AppData\Local\Programs\Python\Python310\;%USERPROFILE%\AppData\Local\Microsoft\WindowsApps;E:\AI_Chating\Xiaoda Agent;D:\data\node
```

- `node24` 在**首位**（第 0 项）→ 新登录会话默认 Node 24 ✅
- `D:\data\node` **仍在末尾** → Node 22 可随时显式调用 ✅

### 3.3 npm 配置

`C:\Users\beiki\.npmrc`（**用户级，两个 Node 版本共享**）：

```ini
registry=https://registry.npmmirror.com
```

> **未在仓库内创建任何 `.npmrc`** —— 已用 `git status --porcelain | Select-String '\.npmrc'` 验证为空。
> 这满足了蓝图「仓库零副作用」的硬要求。

---

## 四、验收测试结果（A1–A5）

### A1 · engines 满足性 ✅

```powershell
node -e "const v=process.versions.node.split('.').map(Number); console.log(v[0]===24 ? 'engines OK  ' + process.versions.node : 'engines FAIL  ' + process.versions.node)"
```

**实测输出**：

```
engines OK  24.21.0
```

`npm -v` → **`11.19.0`** ✅（蓝图要求 `>=10`，且 `package.json` 的 `engines.npm` 同为 `>=10`）

> 对照：`package.json` 声明 `"node": ">=24 <25"` → **24.21.0 落在区间内** ✅

### A2 · Node 22 可切回 ✅（硬需求）

本机无版本管理器，改用**双目录并存**达成同一目的：

| 调用方式 | 实测输出 |
|---|---|
| `D:\data\node\node.exe -v` | `v22.23.2` ✅ |
| `D:\data\node24\node.exe -v` | `v24.21.0` ✅ |
| 目录并存确认 | `node`(83 MB) 与 `node24`(89.2 MB) **同时存在** ✅ |

→ **蓝图 A2 的实质要求（保住对照能力）已满足**，且比版本管理器更稳（不依赖 shell 注入）。

### A3 · 仓库零副作用 ✅（最重要）

```powershell
cd E:\AI_Chating\cyrene-agent
```

| 指标 | 期望 | **实测** | 判定 |
|---|---|---|---|
| `git status --porcelain` 行数 | 219 | **219** | ✅ |
| `git ls-files --others --exclude-standard` 行数 | 135 / 137 | **137** | ✅（偏差 2 已定性） |
| `git rev-parse --short HEAD` | `eb6c311a` | **`eb6c311a`** | ✅ |
| `git ls-files -s` 索引条目 | 1893 | **1893** | ✅ |
| `node_modules/vite` 版本 | 7.3.6 | **7.3.6** | ✅ |

**锚点完整性**：

```
phase0-full    -> 34f0669f   ✅
phase0-tracked -> d48b0cc8   ✅
```

**仓库内新增配置文件检查**：`git status --porcelain | Select-String '\.npmrc|\.gitattributes'` → **空** ✅
（证明本 Phase 未在仓库内落任何配置，`.gitattributes` 留给 P2）

### A4 · 镜像源已生效 ✅

```
registry        = https://registry.npmmirror.com
ELECTRON_MIRROR = https://npmmirror.com/mirrors/electron/
```

镜像连通性实测（执行前探测）：`registry.npmmirror.com` **200**、`npmmirror.com/mirrors/node/` **200**、
`nodejs.org/dist/index.json` **200**、`github.com/Schniz/fnm/releases` **200**。

### A5 · 端到端冒烟 ✅

在 `%TEMP%\node24-smoketest` 中执行（**不在仓库内**，避免污染 A3 基线）：

```
node -v => v24.21.0
npm  -v => 11.19.0
node runs ok: 24.21.0
sha256 ok: 2d71
```

→ 证明 Node 24 **不只是版本号变了，而是真的能运行**（非坏二进制）。

**安装包完整性校验**（额外加固，蓝图未要求）：

```
官方 SHASUMS256.txt: 158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541
本地实算 SHA256:     158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541
>>> 校验通过 (MATCH)
```

---

## 五、执行中的关键发现（对 P8 有直接影响）

### 发现 1 · ⚠️ 当前会话中 `node -v` 仍显示 22（**PATH 传播机制**，非失败）

**现象**：改完用户 PATH 后，`cmd.exe /c "node -v"` **仍输出 `v22.23.2`**。

**根因**：Windows 进程的环境块是**创建时从父进程复制**的独立副本。
`HKCU\Environment\Path` 虽已更新，但**运行中的 explorer.exe 仍持有旧快照**，
新启动的子进程从 explorer 继承 → 仍是旧 PATH。

**验证**：注册表已确实持久化（`HKCU\Environment\Path` 首位 = `D:\data\node24`），
且在**显式前置 PATH 的会话**中 `node -v` → `v24.21.0`、A1 输出 `engines OK 24.21.0`。

**影响与处置**：

| 场景 | 结果 |
|---|---|
| 用户**注销 / 重启后**新开会话 | ✅ 自动 `node -v` = v24 |
| **当前 DSH 会话**及此后启动的进程 | ⚠️ 仍是 v22（继承旧快照） |

> 🔴 **P8 必读**：**不要依赖当前会话的 `node -v` 判断环境是否就绪。**
> 执行 P8 验证前，请在命令首行显式前置：
> ```powershell
> $env:PATH = "D:\data\node24;" + $env:PATH
> node -v    # 此时才是 v24.21.0
> ```
> 或者直接在**用户注销/重启后**新开的终端里执行 P8。
> 若忽略此点，P8 的 `npm ci` 会用 Node 22 跑，触发 `EBADENGINE` 并让全部验证结论失效。

### 发现 2 · ✅ DSH 本体在 Node 24 下兼容（已实测，非推断）

本机 Node 22 目录 `D:\data\node` 同时承载 **DSH 0.1.7-rc.2**（含 12 个 `.node` 原生模块）。
切换 PATH 是否会打断 DSH，是本 Phase 唯一的真实风险。**已实测排除**：

| 检验项 | 结果 |
|---|---|
| `D:\data\node24\node.exe ...\dsh\lib\bin.js --version` | **`0.1.7-rc.2`**，退出码 **0** ✅ |
| `require('node-pty')` @ Node 24 | **OK** ✅ |
| `require('sharp')` @ Node 24 | **OK** ✅ |
| `require('koffi')` @ Node 24 | **OK** ✅ |
| `dsh` 命令本身（`D:\data\node\dsh.cmd`） | **`0.1.7-rc.2`** ✅ |

**双重保险**：`D:\data\node\dsh.cmd` 内部**硬编码**了 `%dp0%\node.exe`：

```bat
IF EXIST "%dp0%\node.exe" (
  SET "_prog=%dp0%\node.exe"      ← 始终用 D:\data\node 里的 Node 22
)
```

→ 即便 PATH 改成了 Node 24，**`dsh` 命令仍固定走 Node 22**，DSH 运行时完全不受影响。

**结论**：所有 `.node` 均为 **N-API / prebuilds** 形态（`sharp-win32-x64-*.node`、
`node-pty\prebuilds\win32-x64\*.node`、`koffi.node`、`sherpa-onnx.node`），
N-API 的 ABI 跨 Node 大版本稳定，故 Node 24 可加载。**未发现任何兼容性问题**。

### 发现 3 · PowerShell 5.1（非 pwsh 7）

本机 `$PSVersionTable.PSVersion` = **5.1.26100.8875**，且 **`pwsh` 命令不存在**。

**影响**：蓝图中所有 PowerShell 片段都需注意 PS 5.1 的差异：
- `&&` / `||` **不可用**（需用 `;` 或 `-and`）
- `-Encoding UTF8` 会写 **BOM**，且 `Get-Content` 默认按 **ANSI** 解码（见偏差 3）
- `Get-ChildItem -Depth` 需 PS 5.0+（本机可用）

**建议**：后续 Phase 文档中的脚本如需精确处理编码，请统一使用
`[System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)`。

---

## 六、产出物清单

| 产出 | 验证方式 | 状态 |
|---|---|---|
| Node 24 可用（`v24.21.0`） | A1 | ✅ |
| Node 22 可切回（`D:\data\node`） | A2 | ✅ |
| npm 11（`11.19.0`） | A1 | ✅ |
| 仓库零副作用（219 / 1893 / eb6c311a / vite 7.3.6） | A3 | ✅ |
| 镜像源配置（registry + ELECTRON_MIRROR） | A4 | ✅ |
| 端到端冒烟通过 | A5 | ✅ |
| **本报告** | — | ✅ |

---

## 七、回退方法

本 Phase **未修改仓库**，回退 = 切回 Node 22（**无需卸载任何东西**）：

```powershell
# ① 临时切回（当前会话，最快）
$env:PATH = "D:\data\node;" + ($env:PATH -replace [regex]::Escape("D:\data\node24;"), "")
node -v    # → v22.23.2

# ② 永久切回（恢复用户 PATH 原始值）
$orig = Get-Content "D:\data\node_temp\user-path-backup-before-node24.txt" -Encoding UTF8
[Environment]::SetEnvironmentVariable("PATH", $orig, "User")
# 注销/重启后生效

# ③ 彻底移除 Node 24
Remove-Item "D:\data\node24" -Recurse -Force
# 并从用户 PATH 中删除 "D:\data\node24;"（同上②的脚本已处理）
```

**回退镜像源**：

```powershell
npm config set registry https://registry.npmjs.org/
[Environment]::SetEnvironmentVariable("ELECTRON_MIRROR", $null, "User")
```

**回退验证**：`node -v` 应回到 `v22.23.2`，`git status --porcelain` 应仍是 **219**。

---

## 八、给 P2 的交接提示

1. ✅ **环境已就绪**：Node **24.21.0** / npm **11.19.0**，**P8 的验证手段至此可用**
2. ✅ **仓库仍是 P0 基线**：`219` status 行 / **`137`** 未跟踪（口径修正，见偏差 2）
   / HEAD `eb6c311a` / 索引 `1893` / `vite` **7.3.6**
3. ✅ **锚点仍在**：`phase0-full` → `34f0669f`、`phase0-tracked` → `d48b0cc8`
4. ⚠️ **P2 的第一步是加 `.gitattributes`** —— 这是本任务中**第一个真正修改仓库**的 Phase，
   执行前请再次确认 `git tag --list phase0-full` 有输出
5. ⚠️ **P2 会 `git add --renormalize .` 并提交一次**，届时 `git status` 数量会**大幅变化**
   —— 这是**预期的**（行尾归一化），不是丢文件
6. ℹ️ **官方 HEAD `b11b8851` 已在本地**（`refs/remotes/official/master`），P3 无需再 fetch
7. 🔴 **执行任何 npm/node 命令前，先确认版本**：`node -v` 必须显示 **v24.21.0**。
   若显示 v22，请前置 `$env:PATH = "D:\data\node24;" + $env:PATH`（见发现 1）

---

## 九、已知坑（本 Phase 补充）

| 坑 | 症状 | 应对 |
|---|---|---|
| **PATH 不传播到运行中的会话** | 改完用户 PATH，`node -v` 仍是 22 | Windows 环境块是进程创建时的快照；**注销/重启**或在命令中**显式前置 PATH**（发现 1） |
| **蓝图未提及 PS 5.1** | 脚本用了 `&&`/`-Encoding UTF8` 读回乱码 | 本机是 **PS 5.1**，无 `pwsh`；用 `;` 分隔、显式指定 UTF-8 读取（发现 3） |
| **`baseline-untracked.txt` 编码假阳性** | `Compare-Object` 报 9 个文件"丢失" | 是 BOM/ANSI 解码问题，**不是丢文件**；用 `-Encoding UTF8` 读（偏差 3） |
| **未跟踪数 137 ≠ 蓝图 135** | 误触 P2 停止条件 | 已在偏差 2 中逐文件查清；**判定改为「不得低于 137」** |
| **误以为要装 fnm/nvm** | `winget` 不在 PATH、需管理员 | 本机走 **zip 绿色版**（与 Node 22 安装方式一致），无需管理员（偏差 1） |

---

## 十、交接状态

```
P0 ✅ ──► P1 ✅ ──► P2 ⏳ 待执行
                   ↑ 你在这里

环境：node v24.21.0 | npm 11.19.0 | Node22 可切回 | 镜像源已配
仓库：219 status / 137 未跟踪 / eb6c311a / 索引 1893 / vite 7.3.6
锚点：phase0-full=34f0669f | phase0-tracked=d48b0cc8
```
