// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LearnExamView } from "../shared/learn-exam";
import { LearnExamPanel } from "./react/features/chat/components/LearnExamPanel";

const exam: LearnExamView = {
  examId: "exam-123e4567-e89b-12d3-a456-426614174000",
  conversationId: "conversation-a",
  title: "极限基础测试",
  subject: "数学",
  durationMinutes: 40,
  totalPoints: 10,
  questions: [{
    id: "q1", type: "single_choice", prompt: "当 x 趋近于 0 时，哪个是无穷小量？", points: 10,
    learningObjective: "极限", options: [{ id: "a", label: "1/x" }, { id: "b", label: "x" }],
  }],
  answers: {}, activeQuestionId: "q1", flaggedQuestionIds: [], status: "draft", createdAt: 1, updatedAt: 1,
};

describe("LearnExamPanel page workflow", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("renders a single-question exam and flushes the latest answer before submission", async () => {
    const order: string[] = [];
    const saveAnswer = vi.fn(async (questionId: string, answer: { value: string } | null) => {
      order.push(`save:${questionId}:${answer?.value ?? ""}`);
      return true;
    });
    const submit = vi.fn(async () => { order.push("submit"); });

    await act(async () => {
      root.render(createElement(LearnExamPanel, { exam, onAnswerChange: saveAnswer, onNavigationChange: vi.fn(), onSubmit: submit, onRetry: vi.fn() }));
    });
    expect(host.textContent).toContain("第 1 题 / 共 1 题");

    const answer = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')][1];
    expect(answer).toBeDefined();
    await act(async () => answer!.click());
    await act(async () => host.querySelector<HTMLButtonElement>(".learn-exam-panel__footer .is-primary")!.click());
    await act(async () => host.querySelector<HTMLButtonElement>(".learn-exam-panel__modal .is-primary")!.click());

    expect(saveAnswer).toHaveBeenCalledWith("q1", { value: "b" });
    expect(order).toEqual(["save:q1:b", "submit"]);
    expect(submit).toHaveBeenCalledOnce();
  });
});
