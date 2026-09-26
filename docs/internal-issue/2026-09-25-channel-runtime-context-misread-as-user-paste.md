# 渠道轮：运行环境事实被模型读成"用户又粘贴了一大串" 已知问题（2026-09-25 实锤）

> 范围：`harness/adapter/prompt-builder.ts`（`materializeHarnessStartTranscript`）、
> `harness/internal-transcript.ts`（内部消息 role 契约）、`harness/cyrene-harness.ts`
> （`materializeInitialContext`）、`prompt-layers.ts`（ChatLoop 尾部注入的对照实现）。
> 用户侧现象由 QQ 私聊实测报告（BeiKia，2026-09-25 22:04–22:25），
> 归属已从 run 快照 + 模型 thinking 双证据链定案。

## 现象（用户报告原文）

> 「QQ 私聊对话中好像出了问题，我发出的跟她收到的不一样。」

时间线（`userData/channels/log.jsonl` L45-70，会话 `channel:qq:afc083f8a0114240`）：

| 时刻 | 用户实际发送 | 昔涟回复里的"她看到的" |
| --- | --- | --- |
| 22:06:35 | `1` | 「咦，BeiKia 怎么突然发了一大串像运行环境一样的东西呀？」 |
| 22:07:05 | `123` | 「怎么把一大堆配置信息一股脑发过来啦♪」 |
| 22:08:06 | `是风堇` | 「后面怎么又悄悄跟了一大截小尾巴♪」 |
| 22:23:48 | `你能粘贴原文给我嘛` | 「你刚才发过来的这一段，其实就正好是人家刚才看到的那串小尾巴呀！」 |
| 22:25:02 | `不是啦，我只了"你能粘贴原文给我嘛"…` | 「你的客户端或消息转发服务在打包发送消息时，把本该作为后台上下文的「运行环境、用户信息和预设配置」直接拼进你的聊天文本字段（content）里一起发出来了」 |

用户侧 `msg.text` **只有那几句话**（同上日志逐条核对无拼接），所以不是 QQ 客户端、
也不是 NapCat 打包出错——**昔涟那句话是模型对自己上下文的误读**，不是诊断结论，
不能当成排查线索（它把内部注入块当成了用户输入的一部分）。

## 实锤证据

1. **run 快照里用户的真话是干净的**：`cyrene-runs/sessions/run-1790345195765-lmr6yu.json`
   的 `messages` 为 `[... , {"role":"user","content":"1"}, {"role":"user","content":"## 运行环境…"}]`
   —— ②是 `visibility: "internal"` 的内部 transcript 消息，role 同样是 `user`。
2. **模型把它读成了同一轮用户输入**：同 run 的 `thinking` 原文
   *"I've received some data, likely leaked system information or a user's accidental paste,
   beginning with \"1\""* —— 它明确把「1」和环境块拼成了一条消息来理解（"beginning with 1"）。
3. **该形状与 `role` 契约同一处成因**：`internal-transcript.ts` 的
   `createInternalTranscriptMessage` 固定 `role: "user"`（kind run_start / recovery /
   state_delta），`materializeHarnessStartTranscript` 又把它**追加在用户真话之后**，
   于是同一次请求里出现连续两条 user 消息，且注入内容没有标签边界。
4. **对照实现有边界、生产的没有**：ChatLoop 尾部注入走
   `prompt-layers.ts` L55-60，内容是
   `<runtime_context>…</runtime_context>`；`cyrene-harness.test.ts` L1082 与文档约定
   也一直用 `<internal_context type="recovery">…</internal_context>`，
   但 `materializeHarnessStartTranscript` 生产路径此前直接塞裸文本（无包裹）。
5. **没被读成用户输入时的正常表现**：同会话 22:04「小明是谁？」没有触发误读，
   因为那轮模型没有把注入块当成"用户粘贴"（回复正常）——说明是**边界缺失**，
   不是注入本身该被去掉（环境/用户信息块本身是设计内的）。

## 修复（2026-09-25 已落）

- `materializeHarnessStartTranscript` 物化内部事实时统一裹
  `<internal_context type="run_start|recovery">…</internal_context>`（新增私有
  `wrapInternalContext`）。
  - 与 `prompt-layers.ts` 的 `<runtime_context>` 同族；
  - 与 `chat-time-context.ts` 的 `## Internal Context Policy` 对齐——该策略本来就写明
    "内部上下文可用于推理，但**不得出现在用户可见回复里**，不得引用/复述/解释/暴露标签名"；
  - 用户那条真话**一个字节不改**（包裹只作用于注入事实）。
- 回归守卫：`harness/adapter/prompt-builder.test.ts` 新增
  「labels injected runtime facts so they cannot be read as user speech」，
  断言注入块带标签、用户消息保持原样；既有「materializes runtime context …」
  同步断言新形状。
- 已知遗留（本次刻意不动）：`internal-transcript` 的 role 契约仍是 `user`，
  因此**结构上**注入块与用户消息仍相邻；标签只是语义边界。若要彻底分开，
  需把内部事实改成 system 消息或独立通道——那是 role 契约级改动，
  会动到恢复/压缩/缓存前缀，单独立项。

## 排查这类问题时的捷径

- 用户说"我发的跟她收到的不一样"时，**先看 run 快照的 messages 数组**
  （`%APPDATA%\live2d-cyrene\cyrene-runs\sessions\run-*.json`）：
  末条 user 消息是不是用户的真话；紧随其后的 user 消息是不是
  `<internal_context>` / 环境块 / 时间上下文类注入。
- **不要采信模型自己在对话里给出的归因**（本例它说"你的客户端把 prompt 拼进 content 了"，
  与事实相反），模型的因果解释没有观测能力，只是对上下文的自述。
