import { createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { PlanApprovalPanel } from "./InteractionPanel";
import type { AskUserInteraction } from "./run-presentation";

const interaction: AskUserInteraction = {
  kind: "ask",
  id: "preview-plan-approval",
  cardMode: "plan_approval",
  responseKind: "submission",
  question: "是否批准此计划？",
  options: [
    { id: "approve", label: "批准" },
    { id: "revise", label: "需要修改" },
    { id: "reject", label: "不批准" },
  ],
  allowCustomInput: true,
};

function Preview() {
  const [result, setResult] = useState("");
  return createElement(
    "main",
    null,
    createElement("header", null,
      createElement("h1", null, "计划批准卡预览"),
      createElement("p", null, "下面是项目当前审批卡布局。按钮仅更新预览状态，不会提交真实审批。"),
    ),
    createElement("section", { className: "preview-context", "aria-label": "计划内容示意" },
      createElement("h2", { className: "preview-context__title" }, "计划内容在单独的计划面板中查看"),
      createElement("p", { className: "preview-context__copy" }, "这里展示底部审批区。批准和不批准会立即提交；选择“需要修改”后会在卡片内展开意见输入框。"),
    ),
    createElement("div", { className: "preview-panel" },
      createElement(PlanApprovalPanel, {
        interaction,
        onAnswer: (answer) => setResult(JSON.stringify(answer)),
      }),
    ),
    createElement("div", { className: "preview-result", role: "status" }, result),
  );
}

const root = document.getElementById("preview-root");
if (root) createRoot(root).render(createElement(Preview));
