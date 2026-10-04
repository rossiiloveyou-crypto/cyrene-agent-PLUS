# 蓝图经验库 · 具体坑（L）

> **文档定位**：本库**只放 L（绑定具体技术栈）**——核心是某条具体命令 / 参数 / API / 库 / 配置项的行为细节，或**具体项目专有**的坑。
>
> **用法：按当前技术栈「检索」，不要通读本文件。**
> **写蓝图前的必读集不含本文件**：H/M 条目在 [BLUEPRINT-经验库-通用.md](BLUEPRINT-经验库-通用.md)；
> 全量档案（186 R + 10 X，逐条带 `文件:行号`）在 [BLUEPRINT-经验库-全量台账.md](BLUEPRINT-经验库-全量台账.md)。
>
> **三档分级定义（与通用库同一套判据）**：
>
> | 等级 | 判据（自评问句） | 读法 |
> |---|---|---|
> | **H** 跨环境通用 | 「换一种语言/框架，这条坑还成立吗？」→ 是 | 写蓝图前**必读**（在通用库） |
> | **M** 同类系统通用 | 「换一个同类系统/项目还成立吗？」→ 是，否 → L | 写蓝图前**必读**（在通用库） |
> | **L** 绑定具体技术栈 | 「核心是某条命令 / 某个 API / 某个库的行为吗？」→ 是 | **按当前技术栈检索，不通读**（在本文件） |
>
> **自检一句**：**换掉这一章的技术栈，这个坑就不成立了 → 它是 L，只留在本章**。
>
> **本库构成（v2.4 重扫）**：**74** 条 = 原 100 条取样里判为 L 的 **43** 条 + 台账附录 B 的 **10** 条 X 系列 + **1** 条原误判为 H 的（A15）
> + **P6–P10 与验收会话新增的 20 条**（18 条来自一次真实的多阶段合并，2 条来自其验收会话）。
> **口径**：**表格行、按 ID 去重**（`^\| \*\*[A-Z]\d+\*\* \| L \|`）；历史值 **54 → 72 → 74**（每次重扫都写口径，见通用库 §0 的 J-31 型教训）。
> 按技术栈分章：
>
> | 章 | 主题 | 条数 | 什么时候来查这一章 |
> |---|---|---|---|
> | §1 | git 与仓库操作 | **7** | 写回滚 / 合并 / 分支方案、预估冲突数、读冲突块方向、**用 git 批量取路径**时 |
> | §2 | Windows / PowerShell 环境 | **8** | 写脚本、跑命令，处理 `&&`/`;`、**编码与 BOM**、管道变量、退出码、后台任务时 |
> | §3 | Electron / Node 运行时 | **9** | 改桌面壳、动主进程/渲染边界、依赖同步 IO 与落盘时机、**装依赖 / 切构建链**时 |
> | §4 | TypeScript / 构建与测试工具链 | **14** | 改类型声明、写/跑测试、动 mock 与夹具、**多入口构建与产物判定**时 |
> | §5 | 本项目专有（Electron + TypeScript，本项目 cyrene-agent：渠道 / 记忆 / 群聊） | **33**（5.1 渠道·群聊 **8** / 5.2 记忆·擦除 **18** / 5.3 桌面外壳·配置 **7**） | 在 cyrene-agent 里动渠道、群聊 transcript、记忆与区块、擦除与删除、设置与落盘时 |
> | §6 | 其他具体库与 API（正则引擎） | 3 | 写正则、做字符串剥离/解析时 |
>
> 🔴 **键号更正（v2.4，只标注、不改旧值）**：新增批次里有 6 条与既有键号冲突、2 条库内重复，本包已改号。
> 引用**原始任务文档**里的旧键号时请按下表对照：
>
> | 本包键号 | 原编号 | 冲突原因 |
> |---|---|---|
> | **C26 / C27 / C28 / C29** | C20 / C21 / C22 / C23 | 与通用库既有的 C20–C23（H/M）撞号 |
> | **D25** | D17 | 与通用库既有的 D17（H）撞号 |
> | **E10** | E8 | 与本库 §5.1 既有的 E8 撞号（库内重复） |
> | **X20** | X10 | 与全量台账附录 B 的 X10 撞号（两套命名空间） |
>
> 通用库侧的 **E9** 同样是改号（原 E7，与具体坑 E7 冲突）。
>
> **每条反例是五元组**：错误做法 → 症状 → 根因 → 正确做法 → 出处（`文件:行号`）。
> 键号 `类型字母+序号` 沿用原编号池，稳定不变，可被蓝图与报告交叉引用。
>
> **「出处」列怎么读**：出处是**原始记录的文档标识 + 行号**（形如 `SELF-update 260925/phase2-zones-and-memory-isolation.md:1740`、
> `task-仓库合并/PHASE-2-完成报告.md:44`）。**这些原始文档未随本包分发**，所以它不是本包内的可打开路径，
> 只承担「溯源」与「唯一标识」两个作用——**条目自身是完整的**（四段齐全），不去解析出处也照样可用。

---

## §1 git 与仓库操作

**什么时候来查这一章**：写回滚方案、跑 `git merge` / 分支操作、处理冲突与提交状态、要预估冲突数时。

| # | 级 | 错误做法 | 症状 | 根因 | 正确做法 | 出处 |
|---|---|---|---|---|---|---|
| **X4** | L | 执行 `git merge-tree --write-tree --name-only refs/remotes/official/master HEAD`，把输出里的 `CONFLICT` 行数当作冲突总数 | **实测 = 0**（只输出一个树哈希 `8d3250ec…`，无任何 `CONFLICT` 行）→ 误判为"完美无冲突"。而真实合并有 **46** 个冲突 | `merge-tree A B` 的语义是「以 `merge-base(A,B)` 为基合 A 与 B」，此时 `merge-base = HEAD`，**HEAD 一侧无独有改动 → 退化合并**；更关键的是它**只读已提交的树，看不到未提交工作区** | **必须先物化工作区**：`$st = (git stash create "m" 2>$null \| Select-Object -Last 1)`，再 `git merge-tree --write-tree --name-only refs/remotes/official/master $st`（得 46） | `task-仓库合并/PHASE-2-完成报告.md:44,48,60-64；task-仓库合并/BLUEPRINT-总蓝图.md:105-122` |
| **X8** | L | 在预估命令里带 `-c merge.renormalize=false` | A2 测出 **50** 而非 **46**（多出 4 个冲突） | 命令行 `-c` 覆盖了仓库里已配好的 `merge.renormalize=true`，于是测的不是真实合并行为 | 确认命令里**没有** `-c` 覆盖，用纯 `git merge-tree` 让仓库配置自然生效 | `task-仓库合并/PHASE-2-合并配置对齐.md:267` |
| **X6** | L | 凭蓝图/文档描述判断"某行属于 ours 还是 theirs" | P4 实测：原以为 `ChatPage.tsx` 的 `useChannelMirrorEvents` 在 ours 侧，**实际在 THEIRS 侧**（HEAD 侧为空块）→ 对 P6 的指示方向相反；同一 `git status` 码下**两侧内容方向不固定** | 冲突标记的语义方向**不由 status 码唯一决定**，只能由 `<<<<<<< / ======= / >>>>>>>` 三行本身确定 | **必须实际展开三行**判断归属，不能凭文档描述推断；每个冲突块单独读，不要批量套用 | `task-仓库合并/PHASE-5-移植适配.md:478-479；task-仓库合并/PHASE-4-完成报告.md:415` |
| **C26** | L | 用 `git grep <字面量>` 的**全仓**命中数当"删干净了"的判据 | 恒假红：删掉 1 个 i18n 键后，`git grep --untracked previewContinue` 仍有 **10+ 文件**命中（`.cyrene-merge-analysis/` 的 4 个备份 + 5 份任务文档 + 1 个参照模块） | `git grep` 的默认范围是**整个工作区**（含**故意保留**的参照物与**按纪律不清理**的证据目录）。它们**本来就该命中** —— 命中它们**不构成失败** | ① **限定 pathspec**：`git grep -n --untracked '<键>' -- 'src/renderer/react/**'`；② 排除噪音：`-- ':(exclude).cyrene-merge-analysis/**' ':(exclude)docs/**'`；③ 报告里**分作用域列命中数**（0/1/4/5）。⚠️ 本 git 构建**无 `-u` 短选项**（会得到 `error: unknown switch 'u'` + 一整屏 usage）—— 用 `--untracked` 全称 | `task-合并/PHASE-10-完成报告.md §五 偏差 4（判据 J-37）`〔原编号 C20；与通用库 C20 冲突，本包改为 **C26**〕 |
| **C27** | L | 用 `git commit-tree` 造"只改一个文件"的测试提交时，去动**真实索引**（`git read-tree` / 忘了给 `GIT_INDEX_FILE` 设临时路径） | 有**污染真实索引**的风险（紧接着的 `git write-tree` / `git status` 全部失真），而这类探针**只是为了一次判定** | `commit-tree` 只需要**对象库**里的 tree —— 改一个**根级文件**根本不需要索引：把 `git ls-tree <ref>` 的原文**改掉那一行**、再 `git mktree`，就是一个新根树 | 探针提交的**零副作用**造法（实测）：① `git hash-object -w --stdin` 写 blob；② `git ls-tree <upstream>` 原文改 1 行（`<mode> blob <newSha>\t<name>`）；③ `git mktree` 造根树（mktree 会自己排序）；④ `git commit-tree <tree> -p <upstream> -m probe`；⑤ `git update-ref refs/remotes/official/probe <commit>`；用完 `git update-ref -d`。全程**不碰工作区、不碰真实索引**（连 `GIT_INDEX_FILE` 都不需要） | `.cyrene-merge-analysis/p10/a2-probe.mjs`（可复跑）〔原编号 C21；与通用库 C21 冲突，本包改为 **C27**〕 |
| **C28** | L | 解析 `git diff --name-status` / `git ls-files` 的输出时，直接按 UTF-8 文本处理 | 非 ASCII 路径拿到的是**八进制转义**形态：`"docs/merge-plan/00-\346\200\273\344\275\223..."` → 与真实路径**比对永远不相等**（分类/统计静默漏项） | 仓库默认 `core.quotepath=true`：**非 ASCII 路径会被转义并加双引号** | ① 规范化输出：`git -c core.quotepath=false diff --name-only …`；② 或解析时还原：先剥两端 `"`，再把 `\ooo` 八进制转义换回字符。<br>⚠️ 同族坑：这类导出文本**首行可能带 UTF-8 BOM** → 读的时候先剥 BOM，否则**第一行永远匹配不上**（实测：79 条底稿只归到 78 条） | `task-合并/PHASE-10-完成报告.md §六 新坑 6/7`〔原编号 C22；与通用库 C22 冲突，本包改为 **C28**〕 |
| **X16** | L | 用 `git grep -u …`（凭记忆写"含未跟踪"的短选项） | `error: unknown switch 'u'` + **一整屏 usage**（80 余行），真正的匹配结果被淹没；脚本里更难发现 | **`-u` 不是 `git grep` 的选项**（`-u` 是 `git add` / `git status` 的 `--untracked-files` 短选项）。`git grep` 的正确写法是长选项 **`--untracked`**（另按语义选 `--cached` / `--no-index`）。**短选项在不同 git 子命令间不通用** | 用 `git grep --untracked -l -E '<pat>' -- '*.ts' '*.tsx'`；且**把 stderr 与 stdout 分开处理**（`2>$null` 或分别重定向），否则 usage 噪音会混进判据输出被当成命中行 | `判据台账 J-26；task-合并/PHASE-9-完成报告.md §五 偏差 2` |

---

## §2 Windows / PowerShell 环境

**什么时候来查这一章**：在 Windows 上写脚本、跑命令，处理 `&&`/`;` 语法、编码与 BOM、管道变量污染、退出码语义、后台任务时。

| # | 级 | 错误做法 | 症状 | 根因 | 正确做法 | 出处 |
|---|---|---|---|---|---|---|
| **X3** | L | 在脚本里用 `&&` / `\|\|` 连接命令，或在括号内用 `;` 分隔语句，或用 `Set-Content -Encoding UTF8` 写中文再读回 | `Missing closing ')'`（括号内不能用 `;`）；`&&` 不可用直接报错；`-Encoding UTF8` 写出 BOM 而读回按 ANSI → **中文乱码** | 本机只有 PowerShell 5.1（无 `pwsh`），其解析器与编码默认值与 7.x 不同 | 用 `;` 分隔语句（不依赖 `&&`）；读文件一律 `[System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)`；命令均拆为独立语句 | `task-仓库合并/PHASE-4-处理删除类冲突.md:392；task-仓库合并/PHASE-2-合并配置对齐.md:265；task-仓库合并/BLUEPRINT-总蓝图.md:391` |
| **X2** | L | `git rm ... 2>&1` / `git add -A 2>&1` / `$st = git stash create ... 2>&1` | **stderr 的 warning 被灌进管道变量** —— `$st` 里塞满 `warning: …LF will be replaced…`，后续 `rev-parse` 报 `Filename too long`（已复现） | `2>&1` 把 stderr 合并进 stdout 流，于是"命令的输出"不再是"命令的结果" | 用 `2>$null` 抑制 stderr，或 `\| Select-Object -Last 1` 只取最后一行 | `task-仓库合并/PHASE-4-处理删除类冲突.md:391；task-仓库合并/PHASE-3-完成报告.md:251` |
| **X1** | L | 用 `@($g \| Where-Object Name -eq 'UU').Count` 数冲突条数（`$g` 是 `Group-Object` 的产物） | 结果**恒为 1**，导致冲突构成被误判为 1/1/1（PHASE-3-完成报告记为"**已复现**"） | `@()` 作用在**单个 GroupInfo 对象**上得到的是"含一个元素的数组"，`.Count` 恒为 1；分组结果不是"可计数的行集合" | 直接对**原始码列表**用 `$_ -match '^UU'` / `$_ -eq 'XX'` 计数，**不要** `Group-Object` 后再 `@()` 取 `.Count` | `task-仓库合并/PHASE-4-处理删除类冲突.md:390；task-仓库合并/PHASE-3-完成报告.md:260` |
| **X7** | L | 用 `robocopy /LOG:x` 记录日志并**以退出码**判断成功 | 带 `/LOG:` 时**日志恒为 2 字节空白**（仓库根有个名为 `NUL` 的 Windows 保留设备条目，无法枚举/重命名/删除，会吞掉日志写入）；退出码 9 可能是假警报 | Windows 保留设备名 `NUL` 在路径解析层吞掉写入；robocopy 的退出码语义（位标志）本身不表示成败 | 判定成功**看汇总的 `Files FAILED` 与 `Mismatch` 两列是否为 0**，不要只看退出码；要日志就用 `& robocopy.exe ... 2>&1 \| Set-Content` 捕获 | `task-仓库合并/BLUEPRINT-总蓝图.md:93；task-仓库合并/PHASE-0-完成报告.md:218` |
| **D25** | L | 用 `Set-Content -Encoding UTF8` 写**要给别的程序读**的文本/JSON/清单 | 下游（Node / git / python）读到的**首行多一个 BOM 字符** → 正则/解析**静默漏掉第一条记录**（实测：79 条底稿分类成 78 条，只差第一行） | **PowerShell 5.1 的 `-Encoding UTF8` = 带 BOM 的 UTF-8**（与 `pwsh 7+` 的 `utf8NoBOM` 语义不同） | ① 写：`[System.IO.File]::WriteAllText($p,$t,(New-Object System.Text.UTF8Encoding($false)))`，或直接交给 Node `fs.writeFileSync(p, t, "utf8")`；② `Get-Content -Encoding UTF8` **不解决** BOM（它只是不报错）→ 解析前先剥 BOM；③ 判据命令里把 BOM 当**已知变量**处理，别让它变成"少 1 条"的假结论 | `task-合并/PHASE-10-完成报告.md §六 新坑 6`〔原编号 D17；与通用库 D17 冲突，本包改为 **D25**〕 |
| **X12** | L | 用 PowerShell 的 `Set-Content` / `Out-File` / here-string + `Set-Content -Encoding UTF8` 写 **`git commit -F <file>` 的提交信息文件** | 提交信息**首行被污染**成 `\ufeffmerge(P8): …` —— 这个字符会**永久留在 git 历史里**，且 `git log --oneline` 看起来"只是多了一个看不见的字符"，极难排查 | Windows PowerShell 5.1 的 `-Encoding UTF8` **写 BOM**（`EF BB BF`）；而 `git commit -F` 把文件**原样**当提交信息首行，不会剥离 BOM | 用 .NET 显式无 BOM 写入：`[System.IO.File]::WriteAllText($p, $msg, (New-Object System.Text.UTF8Encoding($false)))`；**写完立刻回读校验首三字节**（期望不是 `EF BB BF`），实测首三字节 = `6D 65 72`（`mer`） | `task-合并/PHASE-8-提交合并与收口.md §零 0.4（陷阱 Y2）+ §四 4.5 ①` |
| **X14** | L | 在 **PowerShell 5.1** 里给 `git ls-tree`（或其它 git 命令）一次传**多个 pathspec**：`git ls-tree -r --name-only HEAD -- 'a.ts','b.ts','c.ts'` | **返回 0 条**（看起来像"文件全都不在提交里"，会得出**完全错误**的结论）。而逐个单路径查同一个 ref：**每个都是 1 条**。实测：4 个"应当保留"的模块 → 多路径 = **0**、单路径 = **1/1/1/1** → 差点误判为"保留失败" | PS 5.1 调用**原生 exe** 时，单引号包裹的**逗号分隔数组**不会按"多个独立参数"展开，而是被当成**一个**含逗号的畸形 pathspec（git 于是匹配不到任何路径，且**不报错**） | ① 多路径一律写成**空格分隔的独立引号项**（`-- 'a.ts' 'b.ts' 'c.ts'`）或直接用双引号；② **用 git 自带的批量方式**更稳：`git ls-files -- $array`（PowerShell 数组会正确展开）或把路径写进文件用 `--pathspec-from-file`；③ 🔴 **判据要用"正反两侧"**：只要看到"应该是 1 却得到 0"的结果，**先换单路径复核再下结论** | `task-合并/PHASE-8-完成报告.md §四 A3（实测：多路径 0 条 vs 单路径 4 条全在）` |
| **X15** | L | 在 Windows PowerShell 里按文档直接敲 `npx <tool>`（或 `npm <script>`） | `npx : File …\npx.ps1 cannot be loaded because running scripts is disabled on this system.` + `CategoryInfo: SecurityError` + `FullyQualifiedErrorId: UnauthorizedAccess`；**命令一条都没跑**，但看起来很像是"工具坏了" | 包的 bin 目录里同时有 `npx.cmd` 与 `npx.ps1`，**PowerShell 优先解析 `.ps1`**，于是执行受 `Get-ExecutionPolicy` 管辖。若策略为 `Restricted`（`-List` 会显示全 `Undefined` —— **那是"未设置"，默认即 Restricted**），`.ps1` 一律拒绝加载 | ① 显式调 `.cmd`：`& D:\data\node24\npx.cmd vitest run`（实测可用，`--version` → `11.19.0`）；② 或直接用 `node_modules\.bin\<tool>.cmd`；③ **判据里靠"退出码"的命令，先探一次包装器可用性**，别把"脚本被拒"读成"测试失败"（同族：通用库 **E9**「判据命令的环境前提」） | `task-合并/PHASE-9-完成报告.md §三 3.0；Get-ExecutionPolicy -List 实测六项全 Undefined` |

---

## §3 Electron / Node 运行时

**什么时候来查这一章**：改桌面壳（弹窗 / 设置 / 启动闸门）、动主进程与渲染进程边界、依赖"同步 IO""异步上下文（ALS）""userData 落盘时机"这类运行时行为，或**装依赖 / 切构建链**（`npm ci`、`install-scripts` 白名单、electron 二进制）时。

| # | 级 | 错误做法 | 症状 | 根因 | 正确做法 | 出处 |
|---|---|---|---|---|---|---|
| **C13** | L | `showInputModal` 不传 `icon` 时执行 `iconEl.textContent = "<svg …>"` | 整段标记被当普通文字渲染，从弹窗铺满整个面板（用户看到的"乱码"） | 同一个"设置图标"语义在三个弹窗里实现不一致（`textContent` vs `innerHTML`），而默认值是 SVG 字符串 | 新增 `applyModalIcon(el, icon, fallback)`：以 `<` 开头走 `innerHTML`，否则走 `textContent`；默认图标提成常量 | `SELF-update 260925/phase2-zones-and-memory-isolation.md:1806-1817` |
| **C15** | L | 在设置框输入后不回车、不切焦点就去检查落盘 | `app-settings.json` 里**根本没有**该键，用的是默认值 → 误判"设置没生效" | 设置入口是 `change` 事件保存，`change` 只在回车/失焦时触发 | 输入后必须回车或切走焦点；核对该文件的 **mtime** 与键是否存在 | `SELF-update 260925/phase2-zones-and-memory-isolation.md:1928-1929` |
| **C17** | L | 用 `KeyedQueue` 串行化两条写路径来防竞态 | 队列拿不到，且两条写路径也不在队列里 → 串行化方案落空 | 真正的保证来自另一处：`history-log` **全部 IO 同步、零 `await`** → 纯同步重写不可能被打断 | 依据真实的同步性设计并发假设；**一旦在重写循环里加 `await`，这个保证立刻失效**（须在代码里留注释锁住） | `SELF-update 260925/phase3-p3-erasure-and-console.md:169-183` |
| **E1** | L | 直接读 `dialog.showMessageBoxSync(...)` 的返回值为 `number` | 新版 Electron 返回 `{ response: number }`，直接比较数字会走错分支 | Electron 各版本该 API 返回类型不统一，类型声明不足以暴露运行期差异 | `typeof result === "number" ? result : result.response` | `SELF-update 260925/phase2-zones-and-memory-isolation.md:232` |
| **A18** | L | 用 ALS（AsyncLocalStorage）在作用域内取归属信息并透传到调度层 | 透传链的**终点在 ALS 作用域之外**——run 结束回调已离开发起请求时的上下文，取不到 | ALS 的生存期与"一次 run"不重合；把"请求期上下文"当成"run 全生命周期可用" | 显式沿调用链透传，把归属做成**参数**而不是隐式上下文 | `SELF-update 260925/phase3-p2-l2-person-attribution.md:136` |
| **A34** | L | schema 闸门返回"用户主动退出"后，调用方按**普通错误**抛出 | 用户只是想退出应用，却看到"启动失败"红框——把用户的主动选择渲染成故障 | "受控退出"与"启动失败"共用同一个错误通道，UI 无法区分 | 抛专用哨兵错误（带 code），上层识别后**跳过错误框**直接受控退出 | `SELF-update 260925/phase2-zones-and-memory-isolation.md:1742` |
| **A35** | L | 假定存储一定能落盘（取不到 userData 时直接写） | 测试环境 / 启动早期写盘失败或抛错 | 把"运行环境必然具备某能力"当成前提，而单测与启动早期恰恰不满足 | 取不到路径时返回 `null`，退化为纯内存；与既有同类模块的约定保持一致 | `SELF-update 260925/phase2-zones-and-memory-isolation.md:1743` |
| **E10** | L | 用 `Test-Path node_modules/electron/dist/electron.exe` 为 `False` 就断定"postinstall 被白名单拦了"，于是去 `approve electron` | `npm install-scripts ls` **根本不列 electron**（只有 `esbuild` / `electron-winstaller`）→ `approve electron` 无对象、无从下手；而 `electron.exe` 确实缺失（**蓝图的原假定在此版本上不成立**） | **electron@44 上游已删除 `scripts.postinstall`**：`node_modules/electron/package.json` 的 `scripts` 为 `undefined`，二进制改由 `bin: {"install-electron":"install.js"}` + **`index.js` 在 `require()` 时懒下载**（`fs.existsSync(pathFile)` 为假即 `spawnSync(install.js)`）。它**既没被拦、也没被跳过**，只是"没人 require 过它" | 判据要分层：① 先看 `node_modules/electron/package.json` 的 `scripts` 是否存在 postinstall（**版本相关**，不要照抄旧经验）；② 无 postinstall 时，直接 `node -e "require('electron')"` 触发懒下载；③ 再用 `Test-Path .../dist/electron.exe` + `& .../electron.exe --version` **双判据**收口。**不要**把 `allowScripts` 里 `electron@43.1.0` 的条目改写成 44（那是无关动作） | `task-合并/PHASE-7-边界编译修复与构建链切换.md §四 4.3 X1；P7 实测 electron.exe --version → v44.4.3`〔原编号 E8（与本库 §5.1 的 E8 重复），本包改为 **E10**〕 |
| **X20** | L | 换依赖版本后只跑 `npm ci` 就认为安装期脚本都跑过了；不检查 `install-scripts` 白名单与真实产物 | `npm ci` **exit 0 且无报错**，但 `node_modules/electron/dist/electron.exe` 缺失 → `electron .` 起不来（症状与"代码坏了"难以区分） | 本环境的 npm 挂了 **`install-scripts` 白名单**机制（配置在 `package.json` 的 `allowScripts`）。**未列入白名单的包，其 `install`/`postinstall` 会被静默跳过**，只在 `stderr` 留一句 `npm warn install-scripts N packages have install scripts not yet covered by allowScripts`；而该提示**默认被埋在几十行 deprecate/peer 警告里**。白名单条目**带版本号**，所以**升级依赖会让旧条目失配** | ① 升级依赖后**必读 stderr** 的 `install-scripts` 行（不要只看 exit code）；② `npm install-scripts ls` 列出未覆盖项，`npm install-scripts approve <pkg>` 批准（它会**自动把旧版本条目替换为新版本**——属对 `package.json` 的**计划外改动，必须单列进完成报告**）；③ 对**产物**而非退出码下判据（`dist/electron.exe`、platform 二进制、`path.txt`）；④ 包自身**没有** postinstall 时不要乱 approve（见 **E10**） | `task-合并/PHASE-7-边界编译修复与构建链切换.md §四 4.3；P7 实测 approve esbuild 后 allowScripts 由 esbuild@0.21.5 变为 esbuild@0.28.2`〔原编号 X10；与全量台账附录 B 的 X10 重名，本包改为 **X20**〕 |

---

## §4 TypeScript / 构建与测试工具链

**什么时候来查这一章**：改类型声明与注入契约、写或跑 vitest 用例、动 mock 与被 `exclude` 的文件、增删落盘目录与测试夹具时。

| # | 级 | 错误做法 | 症状 | 根因 | 正确做法 | 出处 |
|---|---|---|---|---|---|---|
| **C11** | L | 顺手"整理"截断算术，改 `MAX_FILE_LINES + 1` 与 `slice` 写法 | 既有断言（截断后最老 `msg50`、最新 `msg249`）变红 | `+1` 是"实现细节与测试断言"的隐式契约，不属可读性优化范围 | 明确标注"不要动"；要动就先改测试并说明语义变化 | `SELF-update 260925/phase1.5-speaker-attribution-patch.md:624` |
| **A25** | L | 用 `require()` 懒加载被测试的模块 | **该路径完全无法单测**——`require` 在 ESM 打包产物与 vitest 下都不可拦截 | `vi.mock` 只能拦 ESM `import`；`require` 在 ESM 产物里是另一套解析机制 | 改为动态 `import()`（懒加载语义不变，但可 mock）；排查全仓其他 `require()` 懒加载点 | `SELF-update 260925/phase3-p2-l2-person-attribution.md:901,934-935` |
| **F8** | L | 新增了一个落盘目录，但测试夹具的清理清单没同步扩展 | 归档相关用例互相污染（上一用例的归档文件被下一用例读到） | 夹具的生命周期与产物的生命周期脱钩 | 每新增一个落盘目录，同批次把它加进所有相关套件的清理；更稳的是按"整个数据根目录"清理 | `SELF-update 260925/phase1.5-speaker-attribution-patch.md:797` |
| **X5** | L | 跑测试时加 `--reporter=basic`（旧版本常用） | `Failed to load custom Reporter from basic` + `Failed to load url basic`，**整个 vitest 启动失败**（看起来像代码坏了） | reporter 名称随大版本变更（vitest 4.1.9 已删除 `basic`）；启动失败与测试失败在输出上不易区分 | 用默认 reporter 或 `--reporter=default`；**不要把这个启动错误误判为测试失败** | `task-仓库合并/PHASE-5-移植适配.md:480；task-仓库合并/PHASE-4-完成报告.md:414` |
| **X9** | L | 用 `npm test > test-result.log 2>&1 &`（cmd 后台）跑测试；随后改用 `--reporter=json --outputFile` | cmd 的 `&` 后台语法导致 **exitCode 语义混乱，无法确认测试完成**；`--reporter=json --outputFile` **未产出文件**（连续弯路） | 宿主 shell 的后台语义与"任务是否完成"的判定耦合；reporter 的输出落盘行为未经验证就依赖 | 用受管后台作业并显式轮询结果文件；**先验证 reporter 真的会写文件再用它做判据** | `internal-issue/2026-09-06-shell-output-truncation-timeout-known-issues.md:36,38` |
| **A42** | L | 以为"测试文件里的类型错误会被 `tsc` 抓到"，于是靠类型系统保证测试桩完整 | 桩缺了接口的 3 个方法，`tsc -p tsconfig.main.json` **一条都不报**；运行到第 3 个方法时抛 `TypeError: this.deps.context.resolvePriorMessages is not a function` | 本仓库三份 tsconfig **全部 exclude `*.test.ts`**（`tsconfig.main.json:17`、`tsconfig.renderer.json` 的 `exclude`），`check:renderer` 同样不看测试 → **测试桩的接口缺口编译器永不提醒**（与通用库 **D4** 同源：tsc 根本不看这些文件） | 测试桩必须**手工与接口逐项对齐**；当被测实现新增一次接口调用时，**同批次**去补齐所有桩（可 grep 该接口名反查全部桩点）；把"测试文件不在类型检查范围内"写进本仓库的已知约束 | `task-合并/PHASE-6-完成报告.md §五 偏差 6；tsconfig.main.json:17` |
| **A43** | L | 删掉公共类型的一个字段后，只修"构造该类型字面量的地方" | 同批次炸出两类**不同**的错误：构造处 `TS2353 对象字面量只能指定已知属性`、**导出处** `TS2305 模块没有导出成员` —— 后者出现在另一个文件（仍 `import type { X }`） | 该类型是**跨 3 个文件 + 3 个测试的公共契约**，删除动作同时打到"对象字面量面"与"导出面"；而导出面只在**导入方**报错，离改动点很远 | 删公共类型字段后**立刻**跑全仓 `tsc`（不要只看改动文件）；顺便检查该类型的**导出链**（谁 `export type { X }`、谁 `import type { X }`）；测试里的 `as` 断言会掩盖"多余属性"，需逐个去掉断言核对 | `task-合并/PHASE-6-完成报告.md §五 偏差 7` |
| **C29** | L | 写"**源码级守卫**"测试时，按**字面量**在源文件里搜"某写法不得复发" | 守卫**被自己的注释触发**：组件里那段**解释这个 bug** 的注释恰好写进了同一个字面量 → 断言 `not.toContain(...)` **假红**（或反过来，把注释当成"已修复"的证据） | 源码断言是**纯文本匹配**，**不区分代码与注释、字符串与真实调用**；而注释里**最该出现**的恰恰是被禁的那个写法（因为要解释它） | 三选一（按稳健度排序）：① **让注释不写出那个字面量**（做法：注释写成"上限常量**减去它自己**"，并在注释里**说明为何刻意不写**）；② 守卫实现里**先剥注释**（用 TS 编译器 API / AST，而不是正则）；③ 以**正向锚点**断言为主（"必须包含 `f(x, round)`"）、禁止式断言为辅。<br>📌 通用教训：**"不得出现 X"这类断言，必须先定义"在哪个语法位置不得出现 X"** | `task-合并/PHASE-10-完成报告.md §六 新坑 4`〔原编号 C23；与通用库 C23 冲突，本包改为 **C29**〕 |
| **X11** | L | 用 `npm run build` / `npm run build:renderer` 的**退出码**判断多入口构建是否真的产出了全部入口 | 构建 **exit 0**、终端刷满产物行、看起来完全正常，但入口 HTML 一个都没生成（或只生成默认那个） | `vite.config.mts` 用的是 **`rolldownOptions`（vite 8 专属字段）**。在 vite 7.x 下该字段**不被识别**——它**既不报错、也不警告，而是静默退回默认配置**（默认只处理 `root` 下的 `index.html`）→ **6 个入口只剩 1 个**。退出码对"配置被忽略"这一失效模式**零信息量** | **按产物清单判定，不按退出码**：构建后逐条 `Test-Path` 期望的每个入口 HTML（本项目 6 个：`dist/renderer/{,react/,call-react/,music/,toast/,sticker-manager/}index.html`）。同时把工具链版本本身作为判据（`npx vite --version` 必须 ≥8），因为该失效是**版本错配**引起的 | `task-合并/PHASE-7-边界编译修复与构建链切换.md §四 4.6 X2；P7 实测：vite 8.3.0 + 6/6 入口 True` |
| **X13** | L | 用 `npx vitest run … 2>&1 \| Tee-Object -FilePath <目录>\xxx.txt` **在后台作业里**落盘测试日志，而该目录**还不存在** | 🔴 **整个测试根本没跑**：作业立刻以 `EXIT=-1` 结束，stderr 只有 `out-file : Could not find a part of the path '…'`。**若只看"作业完成了"就会误以为基线已取到** | 管道里 `Tee-Object` / `Out-File` 的**目标路径在管道启动时就求值**（不是上游命令跑完才求值）→ 目录不存在则**先报错、上游命令一次都没执行**（与 **X9** 同源：落盘行为未经验证就依赖） | ① 落盘前**先** `New-Item -ItemType Directory -Force -Path (Split-Path $out)`，并用**绝对路径**；② 关键日志用 `npx vitest run 2>&1 \| Out-File -FilePath $abs -Encoding UTF8`；③ **回读文件确认有内容**（`Get-Content $out \| Select-String 'Test Files'`）才算取到，别拿作业的"完成"当证据 | `task-合并/PHASE-8-完成报告.md §五 偏差 1（实测：第一次基线作业 EXIT=-1，日志未产出）` |
| **X17** | L | 在 `useCallback` / 回调里用 `if (!obj?.method) return;` 做守卫后，**在闭包体内**再调 `obj.method()` | `tsc` 报 `error TS2722: Cannot invoke an object which is possibly 'undefined'`（**同一个函数体内**的守卫看起来完全正确） | TypeScript 的**可选链窄化不跨越函数边界**：`obj?.method` 的窄化只对**当前作用域**有效；`async () => { obj.method() }` 是**新作用域**，窄化在进入时已失效（编译器无法证明回调执行时 `obj` 未变） | **先把方法抓成局部 const 再进闭包**：`const clear = obj.method;` 然后回调里 `await clear();`（实测 exit 0）。或把守卫与调用放进同一个非 `async` 包装函数里 | `task-合并/PHASE-9-完成报告.md §五 偏差 3` |
| **X18** | L | 在 PowerShell 里用 `Get-Content <file>`（**不带 `-Encoding`**）读 **BOM-less UTF-8** 源码，再用 `.Count` / `Measure-Object -Line` 数行数 | 数字**静默偏小、且每个文件偏得不一样**：实测六个新文件默认口径 `164 / 245 / 519 / 180 / 411 / 116` vs 真值 `197 / 254 / 529 / 188 / 417 / 131`（少 6–33 行）。**不报错、不告警**，只会让人得出"对方的数字虚高"这种**反向结论** | PS 5.1 的 `Get-Content` 默认按**系统 ANSI（GBK）**解码 BOM-less 的 UTF-8 字节流 → 多字节序列被错误合并、**行边界被吞**。🔴 `history-log.ts` 恰好**一行不丢** ⇒ **不能靠"试一个文件"确认安全**（同一批文件里"偏 0 行"与"偏 33 行"并存） | ① 一律写 `Get-Content -LiteralPath <f> -Encoding UTF8`；② **行数权威口径**：新增文件用 `git diff --numstat`，已存在文件数 LF（末行无换行时 +1）；③ `Measure-Object -Line` 得到的是**非空行数**（实测 556 = 598 − 42 空行）；④ 报任何计数**先说口径** | `判据台账 J-31；task-合并/PHASE-9-完成报告.md §十二 12.2` |
| **X19** | L | 把"全量测试 `0 failed`"当成**自足**判据（代码对就该绿），跑之前不看**宿主 PATH 上的工具链能不能用** | 全量**假红** `Test Files 1 failed \| 562 passed (563)`：`work-verification-closure.test.ts` 的「build 通过共享 Runner 实际执行工作区脚本」断言 `exitCode: 0 / passed: true`，实测 `exitCode: 1 / passed: false`；日志里唯一线索是 `run_verification 完成: build exitCode=1 passed=false … stderrLen=1403`（**没有 stderr 原文**） | 该用例会在**临时工作区真的 `spawn("npm", ["run","build"], { shell:false })`** → 它的绿色**取决于 PATH 上第一个 `npm` 是否可用**。本机 PATH 首位是 `D:\data\node\npm.cmd`（Node **v22.23.2**），而该安装的 `node_modules\npm\bin\npm-cli.js` **缺失** → `Cannot find module '…npm-cli.js'`，**stderr 恰好 1403 字节**（与用例捕获的 `stderrLen` 吻合）；`D:\data\node24\npm.cmd` 则正常（npm **11.19.0**） | ① 跑全量前**校准 PATH**：`$env:PATH = 'D:\data\node24;' + $env:PATH`，并用 `where npm` + `npm --version` 确认解析到可用的一份；② **失败先证明可归因再定性**（四步：改动面是否为空 / 单跑该文件是否仍红 / 捕获的 `stderrLen` 与手工复现的 stderr 字节数是否吻合 / 修环境后是否转绿）；③ 报告"全量 0 failed"**必须带 PATH 前提**；④ 复现脚本 `.cyrene-merge-analysis/p95/repro-build-verify.mjs`（建临时工作区 + 两种 `shell` 各跑一次）。同族：通用库 **D21**（判据的隐藏前提） | `判据台账 J-35；task-合并/PHASE-9.5-完成报告.md §十二 12.2` |
| **X22** | L | 改完源码、重启应用，就认为"跑的是新代码" | 人工验收**可能在旧产物上做**：实测 `dist/renderer` 产物的时间（23:57:19）晚于源文件最后修改（≤23:55:22），且在产物 bundle 里 grep 本次改动特有的字符串得 **0 命中** → 说明"这份产物含修复"；不做这三步核对，就无法区分"改完没生效"与"跑的是旧包" | dev 模式用 vite **现编源文件**，而打包产物是**上一次构建的产物** —— 两条路径读的不是同一份东西；**"重启"只保证进程重启，不保证产物重建** | ① 关键验收前核对**产物新鲜度**（产物 mtime > 源文件 mtime）；② 在**产物 bundle 里 grep 一个只属于本次改动的字符串**（0 命中 = 没进去）；③ 报告写明"本次验的是 **dev** 还是**打包产物**"；④ 两者都会被人用到就**两边都验** | `task-合并/验证作业单-执行报告.md（产物新鲜度三重核验）；dist bundle 内 mirrorToDesktop 0 命中` |

---

## §5 本项目专有（Electron + TypeScript，本项目 cyrene-agent：渠道 / 记忆 / 群聊）

**什么时候来查这一章**：在 cyrene-agent 里动渠道与群聊 transcript、动记忆 / 区块（zone）/ 归属与擦除、动桌面外壳与配置、或对照本项目文档写判据时。
下面按三个子域分开列，命中哪个子域就只看那一张表。

### 5.1 渠道与群聊（QQ 渠道 / 群白名单 / transcript 格式）

**什么时候来查**：改渠道适配、群白名单、群上下文与旁听块、transcript 前缀与引用行、造群聊验证数据时。

| # | 级 | 错误做法 | 症状 | 根因 | 正确做法 | 出处 |
|---|---|---|---|---|---|---|
| **E2** | L | transcript 文件找不到时先怀疑代码 | `<userData>/channels/history/` 下没有群对应文件 | 两个前置条件没满足：群不在 `allowedGroupIds` 白名单；或改了配置**没重启**（配置在启动期读取） | ① 查 `channels-settings.json` 的 `qq.allowedGroupIds` ② 重启 ③ 发一条**不 @** 的消息再找最新修改的文件 | `SELF-update 260925/phase1-manual-verification.md:244-252` |
| **E8** | L | 把"@ 昔涟"的消息拿去攒群上下文样本 | 旁听条数攒不起来 | `buildGroupContextBlock` 只统计 `observedOnly`（**没 @ 的旁听消息**），触发轮不进这个块 | 喂数据必须发普通消息（不 @、不命中触发词） | `SELF-update 260925/phase2-zones-and-memory-isolation.md:1926-1927` |
| **F11** | L | 用"@ 昔涟"或"已触发"的消息构造验证数据 | 验证条件从根上不满足（该块只统计**没 @** 的旁听消息） | 构造数据的形态与判据统计口径不一致 | 先读清判据统计的是哪一类消息，再按该类构造数据 | `SELF-update 260925/phase2-zones-and-memory-isolation.md:1926-1927` |
| **A5** | L | 群聊写入 `msg.text`（丢引用行）或 `modelText` 整段（双前缀） | 前者丢引用行；后者得到 `[小明]: [群聊发送者：小明 (10001)]\n…` | `modelText` 同时含"发送者前缀"（元数据）与"引用行/触发提示行"（正文语义），一刀切都会错 | 写 `stripSpeakerPrefix(modelText)`——**只砍发送者前缀，保留引用行** | `SELF-update 260925/phase1.5-speaker-attribution-patch.md:414,519-520` |
| **A29** | L | 群白名单并入配置时移除了旧输入框，却没补新入口；成员选择器数据源只含"已产生过对话的会话" | "想给一个从没说过话的新群加白"在 UI 上**无路可走** | 数据源被当成"全集"使用，而它其实是"**历史观测集**" | 区块卡片新增「手动加群」；**sessionId 由主进程现算，不接受渲染进程传入**，否则会出现"加白了但记忆是另一个域" | `SELF-update 260925/phase2-zones-and-memory-isolation.md:1819-1829` |
| **A30** | L | 手动加群对某渠道接受纯数字群号 | 填群号**不报错但永远匹配不上任何群**（该渠道只认 openid）——等于写死配置、无法排查 | 校验只做了"格式合法性"，没做"该渠道的**语义可匹配性**" | 按渠道分别校验并**显式拒绝**不合法形态；规则放共享模块，渲染与主进程共用 | `SELF-update 260925/phase2-zones-and-memory-isolation.md:1831-1833` |
| **A36** | L | 成员选择器把"桌面对话"也列为可选项 | 与「桌面只属于 root」的契约冲突：桌面对话若可被选进自定义区块，就等于绕过 root 归属 | UI 清单与"域归属**不变量**"没有对齐；可选项集合必须由不变量约束，而不是"能列就列" | 只列外部会话；桌面对话在 root 卡片**只读**展示 | `SELF-update 260925/phase2-zones-and-memory-isolation.md:1779` |
| **A39** | L | 桌面会话为持久化成区成员而写进成员表 | 删除/重建桌面对话后留下**悬空引用** | 桌面隐式属于 root，把它物化成"成员记录"会引入一个本不需要维护的引用关系 | 桌面**直接返回 root**，不做成员存储，从数据模型上消除悬空引用的可能 | `SELF-update 260925/phase2-zones-and-memory-isolation.md:1740` |

### 5.2 记忆与区块 / 归属与擦除（scope / 向量 / personKey / 删除）

**什么时候来查**：改记忆写入与召回、区块（zone）与域过滤、归属字段（speakerIds / subjectIds）与按人擦除、向量库与级联删除时。

| # | 级 | 错误做法 | 症状 | 根因 | 正确做法 | 出处 |
|---|---|---|---|---|---|---|
| **C19** | L | 把某个纯函数的两条读入口当"暂时不可用就整体失败" | RAG / 关系日志暂时不可用会把整次擦除打挂 | 辅助读入口的失败面被放大成主流程的失败面 | 两个新读入口都包 `safe*()`——读不到就当空，有用例锁住 | `SELF-update 260925/phase3-p3-erasure-and-console.md`（§9.3e 第 25 条） |
| **E4** | L | 看到每轮打印 `RAG not initialized` / `reconciliation skipped` / `StickerEmbedding Model not found` 就当成回归 | `searchMemoryEntries` 返回 `[]`、L2 全 `sync_failed`、`ragId` 为空、`memory-store.json` 永不生成 | `models` 是空目录（只有 `.gitignore`）→ `getEmbeddingProvider()` 返回 null → `addL2MemoryVector` 第一行就 throw。**是 dev 环境既定状态，不是回归** | 记录为"环境说明（非缺陷）"，并写明它对结论的影响：向量召回路径不可用，隔离只能靠 L2 注入路径 + 单测 | `SELF-update 260925/phase2-zones-and-memory-isolation.md:2011-2042` |
| **D7** | L | 群聊判定写成 `if (sessionId?.includes(":group:"))` | 真实 sessionId 是 `channel:qq:<sha256 前16位>`，**不含 `:group:`** → 群上下文注入永远不触发 | 用"看起来像"的字符串片段当类型判据，而 sessionId 是哈希派生的不透明 id | 由 `IncomingMessage.chatType`（或渠道侧显式字段）判定；需从 id 反推时走权威映射函数 | `SELF-update 260925/phase1-group-context-observe.md:104` |
| **D14** | L | 指望 judge 把"跨批提到的人"也映射成 `personKey` | `subjectNames → subjectIds` 只能依赖"本批说过话的人"名册 → 跨批提到的人无法归属、被丢弃 | 名册构造范围是"本批 turns"（受 prompt 长度与判定窗口限制），而人名可以出现在任何一批 | 把限制**写进 judge prompt**，并明确"这是可接受的降级，不是 bug"；映射不上就丢弃 | `SELF-update 260925/phase3-p2-l2-person-attribution.md:211` |
| **D16** | L | 把"场景全绿"当作某条路径已被验证 | **`【相关记忆】`（L2 按域注入）从未真正触发过**——两条 L2 `weight=0`、未达阈值 | 验证样本的激活强度不足，导致"有内容的路径"始终没有内容 | 覆盖表里**显式登记未覆盖项**并写明替代防线；不要用"总表全绿"掩盖"某路径从未被执行" | `SELF-update 260925/phase2-zones-and-memory-isolation.md:2274-2279` |
| **F12** | L | 复验时把两个待比较的群放进**同一个区块** | 验证退化成"同区块共享"而不是"跨域隔离"（此前已误判过一次） | 实验分组没有区分"同域内共享"与"跨域不串"这两个待证命题 | 让每个域两两不同（一个 solo、一个区块、一个 root），顺带覆盖两个方向都不串 | `SELF-update 260925/phase2-zones-and-memory-isolation.md:2201-2202` |
| **A9** | L | `compressMemories()` 在**全局 L2** 上聚类；总结**不带 scope** | 群聊记忆与桌面记忆被合并成同一条总结 → 既串味，又从此召回不到 | 聚类候选集没按域分桶；"总结不带 scope"让它在分域读取下成为不可见数据 | 先按 `scope` 分桶再聚类；总结继承 `group[0].l2.scope` | `SELF-update 260925/phase2-zones-and-memory-isolation.md:1752` |
| **A11** | L | 隔离清单按"文件/模块"枚举，漏掉 `tool-registry.ts` 的 `user_memory` / `read_memory` / `write_memory` | 域隔离在这条路径上完全失效——**而这正是后来认定的串记忆主战场** | 真正的隔离面是"**所有读写该数据的入口**"，工具层被当成"上层"漏掉了 | 三者都按 `ctx.conversationId` 解析域：读只读本域、写给候选钉上域 | `SELF-update 260925/phase2-zones-and-memory-isolation.md:1756` |
| **A12** | L | 删除后**不删向量**，只删结构化条目 | 被删记忆的向量留在库里，语义召回仍能命中一条**已经不存在的**记忆；只有下次启动对账才回收 | `deleteL2Cascade` 的契约是**有意不删向量**（顺序必须"先 store 后 vector"），调用方要自己拿 `removed[].ragId` 去删 | 调用方补这一刀；且要**逐个调用点核对**——三个调用点接了、控制台那一处没接 | `SELF-update 260925/phase3-p3-erasure-and-console.md:1585-1592` |
| **A13** | L | 只擦"原始载体"，不管**向量/副本载体** | 向量库 19 → 14，消失的全是 A 类；B 类（对话向量）**12 条一条没动**，其中 8 条与该人有关，仍可被按域语义召回到**已删掉的经历** | 痕迹**同时存在于原始载体与向量副本**；而且启动对账的视野里根本没有 B 类，**不会自愈** | 按"痕迹的形态"逐类清点（见 §5 形态矩阵思路）；只要某痕迹同时存在于原始与副本载体，**单删原始载体就等于没删** | `SELF-update 260925/phase3-p3-erasure-and-console.md:1599-1604` |
| **A14** | L | 逐行擦除的判据是 `speakerId === <被擦者>` | 擦除后 7 分钟被问及，她答出了**已删掉的经历**——泄漏来自她自己复述他的行，而**这些行没有 `speakerId`**，一条都没动 | assistant 行不带 speakerId，判据**结构上抓不到它**；而这类行**每轮都进上下文**，比向量召回更直接 | 判据加两条：① 正文含别名 ② **轮次配对**（这一行的上一行就是他的行）。**② 是必须的**——泄漏那行一个字都没提他 | `SELF-update 260925/phase3-p3-erasure-and-console.md:1622-1646` |
| **A17** | L | 只在"自动注入"通道上治串记忆，方案重心放在 `buildMemoryInjection` | 全仓核实后推翻：该函数**只有两个调用方**（语音通话、主动消息），主聊天走 `buildAlwaysOnContext` **不调用它** → 整套 L2 + DMAE 在主聊天路径上**空转** | 真实主战场是**工具路径**：模型调 `user_memory` → 检索池里混着所有人 → 把小红的事当小明的事说出来，**且直接当成"你说过的话"复述** | 承认"串记忆没消失，只是换了扇门，而且更严重"；把本阶段**收窄为纯铺垫**，召回侧独立成下一阶段 | `SELF-update 260925/phase3-p2-l2-person-attribution.md:61-103,519-537` |
| **A20** | L | 让"无归属"与"有字段但为空数组"在磁盘上呈两种形状 | 读取侧要判两种形态；回归比对会误报 | 序列化层把"空"与"缺席"当成不同的东西，语义上它们是同一件事 | **空数组不落字段**；按需展开字段（不写 `undefined` 键），用 `Object.keys` 断言锁住形状 | `SELF-update 260925/phase3-p2-l2-person-attribution.md:911,913` |
| **A21** | L | 只给部分字段定退化规则，`speakerIds` 遇到"来源轮取不到"时留空 | 一批记忆没有说话人指针，"谁说的"不可溯 | 同类字段的降级策略不统一 → 最需要兜底的字段反而没有兜底 | 采用同一规则：缺失时退化为整批——**"一批指向"优于"没有指针"** | `SELF-update 260925/phase3-p2-l2-person-attribution.md:908` |
| **A23** | L | 设计时假定"记忆写入时 assistant 消息的 id 已存在"，让 `sourceMessageIds` 同时指向两侧 | 真实顺序是 user 落盘 → run（期间触发写入）→ assistant 才落盘 → **触发时 assistant 的 id 还不存在** | 把"run 结束后"当成了"消息都写完了" | 记忆只需指向 **user 消息**（判定本就要求"必须是用户主动表达的信息"） | `SELF-update 260925/phase3-p1-message-identity.md:83` |
| **A28** | L | 往 `AgentRunFinishedContext` 加字段，未考虑它与插件 `turn:completed` 事件**同源** | 存在顺带把群成员标识泄进**第三方插件事件流**的风险 | 同一个 context 对象被两条消费者链共享（内部链路 vs 插件契约），加字段等于同时扩了两边接口 | 加用例锁住"该字段只走内部链路、不进插件事件契约"；改共享 context 必须逐个消费者确认边界 | `SELF-update 260925/phase3-p2-l2-person-attribution.md:904` |
| **A32** | L | 把"清空/删除"与"按人删除"当同族功能复用实现 | 两者**语义不同、作用域重叠**：一个是目录级、一个是行级过滤重写；共用实现会让"删一个人"顺手动到别人的记录 | 复用点只能落在"路径清单"，**绝不能落在"删除动作"** | 明确两者不能共用一套实现，并用架构守卫测试断言"擦除链路源码里不许出现整体删除函数" | `SELF-update 260925/phase3-p1-message-identity.md:642-645` |
| **X10** | L | 依赖 `history-log` 的文件名反解（`safeName` / `sessionIdFromFileName`）把文件名还原成 sessionId | 该审计项在上游任务记录里**反复登记为"未审计"**（"官方 `chats-store.ts` 重写是否改变会话 ID 空间"），而它直接决定反解是否还成立；同文件另指出渠道名捕获组 `[a-z][a-z0-9]*` **不含下划线**，与 `safeName` 把 `:` 换成 `_` 会发生歧义 | 文件名编码是**多对一**的，反解本就不可靠；再叠加会话 id 空间可能被上游重写，风险翻倍 | 用权威名册而非反解；把"id 空间是否变化"作为上游重写的必查项而非待办 | `task-仓库合并/04-审计-chats-store与会话ID空间.md:52,73,118；task-仓库合并/01-已拍板决策与技术修正.md:138` |

### 5.3 桌面外壳 / 配置 / 项目文档载体

**什么时候来查**：改窗口与本地化、改配置落盘与启动读取、写"删除类"文案、清理"暂时没人用"的项目代码、动面板之间的引用时。

| # | 级 | 错误做法 | 症状 | 根因 | 正确做法 | 出处 |
|---|---|---|---|---|---|---|
| **C12** | L | 手工验证前不备份，直接改配置/发消息 | 老 transcript 被启动闸门清空 → 验收项失去真实样本 | 兼容性分析只看了"格式解析"，没看"生命周期"——数据可能被别的功能的删除路径带走 | 做 transcript 相关手工验证前先备份 `channels/`；`channels-settings.json` 改完**必须重启**（配置在启动期读取） | `SELF-update 260925/phase1-manual-verification.md:244-252` |
| **E3** | L | 靠 `logs/cyrene.log` 排查 | 该文件 36 行后**静默停止落盘**（此后两次正常启动 + 十余轮渠道运行都没写进去），而 `memory-trace.log` 正常追加 | 主日志在某个时间点静默失效，表现是"看起来一切正常" | 排查改看 dev 终端与 `memory-trace.log`；把主日志降级为"待查项" | `SELF-update 260925/phase2-zones-and-memory-isolation.md:2044-2049` |
| **E7** | L | 假定 `index.html` 里的 `data-i18n` 短 key 会生效 | **不生效**——界面靠 HTML 中文硬编码兜底，多语言切换在该窗口无效 | `applyTranslations` 全仓无调用点，`data-i18n` 属性没有任何运行时消费者 | 静态骨架直接写中文，动态文本用 TS 侧 `t("settings.…")`；知其当前是死属性 | `SELF-update 260925/phase2-zones-and-memory-isolation.md:1780` |
| **D10** | L | 删除类文案按"记忆"这个词的直觉写："旧记忆将被清空（桌面对话记录会保留）" | **没提渠道聊天记录也会一起没** —— 文案与 `MEMORY_TARGETS` 实际范围不一致，用户在被删之前没被告知 | 文案由功能作者凭直觉写，没对着目标清单逐项核对 | 删除类文案必须由目标清单生成或逐项核对；预演报告显式列出保留项与"整份销毁"项 | `SELF-update 260925/phase3-p1-message-identity.md:646-647` |
| **A16** | L | 把"目前没有生产消费者的纯函数"当无用代码删掉 | 下一阶段的擦除流程要重写一遍"从 sessionId 取渠道"的逻辑 | "无消费者"被当成"无用"，但它的消费者在**下一个阶段**（输入清单里已列） | 按完整规格实现并配用例，**不删**；文档注明"先于消费者的纯函数"以防后人清理 | `SELF-update 260925/phase3-p2-l2-person-attribution.md:912` |
| **A33** | L | 为实现跨面板跳转直接 `import` 顶点入口模块 | 循环依赖成环 | 面板之间通过顶层入口互相引用，必然成环 | 新增独立的跳转钩子模块；风险在蓝图里已列出、缓解方式写的是"注入式，不 import 入口" | `SELF-update 260925/phase2-zones-and-memory-isolation.md:1777` |
| **X21** | L | 用"**猜出来的文件名**"核对"设置有没有保存" | 文件不存在、时间戳没变 → 当场判定"**点了保存却没落盘**"（正是要抓的那类静默失败），并据此**向用户报了一次误判**；而真实文件名是 `app-settings.json`，写入时间与操作完全吻合，**保存其实是成功的** | 源码注释与测试名里出现过另一个名字（`general-settings.json`），而**真实路径由函数 `getGeneralSettingsPath()` 决定** —— "名字像"被当成了"路径是" | ① 核对落盘**先读路径函数 / 常量**，不要从命名推断；② 下"没保存"结论前先**列出候选文件与 mtime**（`Get-ChildItem $dir -Filter *.json \| Sort-Object LastWriteTime -Descending`），看整批文件的时间线；③ 结论抛出前**自查一次**"我查的是不是同一个文件"；④ **误报也要写进报告**（它同样是一次"判据缺前提"的实例，见通用库 **D26/D35**） | `task-合并/人工验证-回执-V与C类-2026-10-01.md（general-settings.json vs 真实的 app-settings.json）` |

---

## §6 其他具体库与 API（正则引擎）

**什么时候来查这一章**：写正则（尤其做前缀剥离、定界、贪婪/惰性选择）或做字符串切片解析时。

| # | 级 | 错误做法 | 症状 | 根因 | 正确做法 | 出处 |
|---|---|---|---|---|---|---|
| **A15** | L | 正则用"第一个 `]`"当分隔符（`[^\]\n]+`）匹配昵称 | 对 `[b°t]BEIKIA` 只剥掉 `[群聊发送者：[b°t]`，剩下 `BEIKIA (2914636187)]\n111`，**且已污染下游**（`memory.json` 里两条记忆的 `triggerText` 就是这个残片） | 昵称本身可以含 `]`；终止符没有锚定到"行尾 / `(数字)` 之前"这一结构性位置 | lookahead 锚定；**两个文件（写入侧与读取侧）都要镜像修改**，且两处 lookahead 故意不同 | `SELF-update 260925/phase2-zones-and-memory-isolation.md:2051-2072` |
| **C8** | L | 剥离前缀写成贪婪 `[^\n]*` | 对**无换行的旧记录**会一路吞到最后一个 `]`，把用户正文吃掉 | 贪婪在"有换行的新格式"上恰好正确、在旧格式上错误；单用例通过就写进文档 | 用 lookahead 把分隔锚定为"行尾 / `(数字)` 之前"：`(?=\n\|$\|\(\d{1,32}\))`；文档**显式标注旧提案已失效**并指向新方案 | `SELF-update 260925/phase2-zones-and-memory-isolation.md:2091-2092` |
| **C9** | L | 剥离前缀依次尝试 `[^\]\n]+` → `[^\n]{0,300}?` → `[^\n]*` | 旧版在昵称内部的 `]` 收尾；**惰性有界照样错**；贪婪版吃掉旧记录正文 | "惰性/贪婪"只调节匹配长度偏好，不改变**候选起点**；本质是终止符需要结构性锚点 | lookahead 锚定 + 11 组真实格式（多括号昵称、无 QQ 号、legacy 标记、带引用、命中触发词）验证 span | `SELF-update 260925/phase2-zones-and-memory-isolation.md:2140-2163` |

---

## 追加模板

发现新的 L 反例时，追加到**对应技术栈章**（键号续编，不要重排已有编号；判不准是 H/M 还是 L 时先看通用库抬头的分级定义）：

```markdown
| **<类型字母><序号>** | L | <错误做法：具体到命令/代码/配置项> | <症状：含原样错误信息或真实数字> | <根因：机制层，指向该技术栈的固有行为> | <正确做法：可执行> | `<文件:行号>` |
```

判为 H/M 的条目请追加到 [BLUEPRINT-经验库-通用.md](BLUEPRINT-经验库-通用.md)，不要留在本库；两处都要回到 `BLUEPRINT-经验库-全量台账.md` 补一行 `- 等级:`。
