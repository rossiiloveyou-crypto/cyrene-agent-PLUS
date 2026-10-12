import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { LearnExamAnswerValue, LearnExamChangedEvent, LearnExamView } from "../shared/learn-exam";
import { LearnExamPanel } from "./react/features/chat/components/LearnExamPanel";
import "./learn-exam-page.css";

function LearnExamPage() {
  const [exam, setExam] = useState<LearnExamView | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const result = await window.learnExamPage.getExam().catch(() => null);
    if (!result?.ok || !result.exam) {
      setError(result?.error ?? "暂时无法读取这份试卷，请关闭后重新打开。 ");
      return;
    }
    setError("");
    setExam(result.exam);
    document.title = `${result.exam.title} · 学习空间`;
  }, []);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      const result = await window.learnExamPage.getExam().catch(() => null);
      if (disposed) return;
      if (!result?.ok || !result.exam) {
        setError(result?.error ?? "暂时无法读取这份试卷，请关闭后重新打开。");
        return;
      }
      setError("");
      setExam(result.exam);
      document.title = `${result.exam.title} · 学习空间`;
    };
    const off = window.learnExamPage.onChanged((event: LearnExamChangedEvent) => {
      if (!exam || event.examId === exam.examId) void load();
    });
    void load();
    return () => { disposed = true; off(); };
  }, [exam?.examId]);

  const saveAnswer = useCallback(async (questionId: string, answer: LearnExamAnswerValue | null) => {
    const result = await window.learnExamPage.saveAnswer(questionId, answer).catch(() => null);
    if (!result?.ok || !result.exam) return false;
    setExam(result.exam);
    return true;
  }, []);

  const saveNavigation = useCallback((activeQuestionId: string, flaggedQuestionIds: string[]) => {
    void window.learnExamPage.saveNavigation(activeQuestionId, flaggedQuestionIds).then((result) => {
      if (result.ok && result.exam) setExam(result.exam);
      else setError("题目位置保存失败，重新打开页面后会恢复上次保存的位置。");
    }).catch(() => setError("题目位置保存失败，请稍后重试。"));
  }, []);

  const submit = useCallback(async () => {
    const result = await window.learnExamPage.submit().catch(() => null);
    if (!result?.ok || !result.exam) {
      setError(result?.error ?? "交卷失败，请检查后重试。");
      return;
    }
    setError("");
    setExam(result.exam);
  }, []);

  const retry = useCallback(async () => {
    const result = await window.learnExamPage.retry().catch(() => null);
    if (!result?.ok || !result.exam) {
      setError(result?.error ?? "重新提交批改失败，请稍后重试。");
      return;
    }
    setError("");
    setExam(result.exam);
  }, []);

  if (!exam) return <main className="learn-exam-page-state" role={error ? "alert" : "status"}>{error || "正在载入试卷…"}</main>;
  return <div className="learn-exam-page-root">
    {error && <div className="learn-exam-page-error" role="alert">{error}<button onClick={() => void refresh()}>重试</button></div>}
    <LearnExamPanel exam={exam} onAnswerChange={saveAnswer} onNavigationChange={saveNavigation} onSubmit={submit} onRetry={retry} />
  </div>;
}

const root = document.getElementById("learn-exam-preview-root");
if (root) createRoot(root).render(<LearnExamPage />);
