import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CodeHighlighter } from "@ant-design/x";
import { createMathPlugin } from "@streamdown/math";
import { BookOpen, Check, ChevronLeft, ChevronRight, Circle, Clock3, Flag, Moon, Send, Sun } from "lucide-react";
import { defaultRehypePlugins, Streamdown, type Components, type ControlsConfig } from "streamdown";
import type { ReactNode } from "react";
import type { PluggableList } from "unified";
import type { LearnExamAnswerValue, LearnExamQuestionView, LearnExamView } from "../../../../../shared/learn-exam";
import "./LearnExamPanel.css";

const TYPE_LABEL: Record<LearnExamQuestionView["type"], string> = {
  single_choice: "单选题",
  multiple_choice: "多选题",
  true_false: "判断题",
  fill_blank: "填空题",
  short_answer: "简答题",
  essay: "解答题",
};

function isAnswered(answer?: LearnExamAnswerValue): boolean {
  if (!answer) return false;
  if (Array.isArray(answer.value)) return answer.value.some((value) => value.trim().length > 0);
  if (typeof answer.value === "string") return answer.value.trim().length > 0;
  return true;
}

function getCodeBlock(children: ReactNode): { code: string; language: string } | null {
  let result: { code: string; language: string } | null = null;
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ className?: string; children?: ReactNode }>(child)) return;
    const language = /language-([\S]+)/.exec(child.props.className ?? "")?.[1] ?? "text";
    result = { code: React.Children.toArray(child.props.children).map((part) => typeof part === "string" ? part : "").join("").replace(/\n$/, ""), language };
  });
  return result;
}

function ExamCodeBlock({ children }: { children?: ReactNode }) {
  const block = getCodeBlock(children);
  if (!block) return <pre>{children}</pre>;
  return <CodeHighlighter
    className="learn-exam-panel__code-block"
    lang={block.language}
    prismLightMode={false}
    styles={{
      root: { color: "var(--rb-text-primary)", background: "var(--rb-code-bg)" },
      header: { color: "var(--rb-text-primary)", background: "var(--rb-bg-2)" },
      code: { color: "var(--rb-text-primary)", background: "transparent", borderColor: "var(--rb-border-default)" },
    }}
  >{block.code}</CodeHighlighter>;
}

const examMathPlugin = createMathPlugin({ singleDollarTextMath: true });
const examComponents: Components = {
  code: ({ className, children, ...props }) => <code className={className} {...props}>{children}</code>,
  pre: ({ children }) => <ExamCodeBlock>{children}</ExamCodeBlock>,
};
const examPlugins = { math: examMathPlugin };
const examRehypePlugins: PluggableList = [
  defaultRehypePlugins.raw,
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.harden,
];
const examControls: ControlsConfig = { table: false };

function ExamRichText({ text, className }: { text: string; className?: string }) {
  return <Streamdown
    mode="static"
    plugins={examPlugins}
    components={examComponents}
    rehypePlugins={examRehypePlugins}
    controls={examControls}
    className={className ?? "learn-exam-panel__rich-text"}
  >{text}</Streamdown>;
}

export function LearnExamPanel({
  exam,
  onAnswerChange,
  onNavigationChange,
  onSubmit,
  onRetry,
}: {
  exam: LearnExamView;
  onAnswerChange: (questionId: string, answer: LearnExamAnswerValue | null) => boolean | Promise<boolean>;
  onNavigationChange: (activeQuestionId: string, flaggedQuestionIds: string[]) => void;
  onSubmit: () => void;
  onRetry: () => void;
}) {
  const [answers, setAnswers] = useState(exam.answers);
  const [activeId, setActiveId] = useState(exam.activeQuestionId || exam.questions[0]?.id || "");
  const [flagged, setFlagged] = useState(exam.flaggedQuestionIds);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [isDark, setIsDark] = useState(() => {
    const savedTheme = localStorage.getItem("learn-exam-preview-theme");
    const theme = savedTheme ?? document.documentElement.dataset.uiTheme ?? "pearl-white";
    document.documentElement.dataset.uiTheme = theme;
    return theme === "charcoal-pink";
  });
  const answerTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingAnswers = useRef(new Map<string, LearnExamAnswerValue | null>());
  const onAnswerChangeRef = useRef(onAnswerChange);
  useEffect(() => { onAnswerChangeRef.current = onAnswerChange; }, [onAnswerChange]);

  useEffect(() => setAnswers(exam.answers), [exam.examId, exam.updatedAt, exam.answers]);
  useEffect(() => {
    setActiveId(exam.activeQuestionId || exam.questions[0]?.id || "");
    setFlagged(exam.flaggedQuestionIds);
  }, [exam.examId]);

  const activeIndex = Math.max(0, exam.questions.findIndex((question) => question.id === activeId));
  const question = exam.questions[activeIndex];
  const answeredCount = exam.questions.filter((item) => isAnswered(answers[item.id])).length;
  const sections = useMemo(() => {
    const grouped = new Map<string, LearnExamQuestionView[]>();
    for (const item of exam.questions) {
      const type = TYPE_LABEL[item.type];
      grouped.set(type, [...(grouped.get(type) ?? []), item]);
    }
    return [...grouped.entries()];
  }, [exam.questions]);
  const activeSection = sections.find(([, questions]) => questions.some((item) => item.id === activeId));
  const activeSectionIndex = activeSection?.[1].findIndex((item) => item.id === activeId) ?? 0;
  const isLocked = exam.status !== "draft";

  function toggleTheme() {
    const nextIsDark = !isDark;
    const theme = nextIsDark ? "charcoal-pink" : "pearl-white";
    setIsDark(nextIsDark);
    document.documentElement.dataset.uiTheme = theme;
    localStorage.setItem("learn-exam-preview-theme", theme);
  }

  async function flushAnswer(questionId: string): Promise<boolean> {
    const timer = answerTimers.current.get(questionId);
    if (timer) clearTimeout(timer);
    answerTimers.current.delete(questionId);
    if (!pendingAnswers.current.has(questionId)) return true;
    const answer = pendingAnswers.current.get(questionId) ?? null;
    pendingAnswers.current.delete(questionId);
    const saved = await onAnswerChangeRef.current(questionId, answer);
    if (!saved) setSaveError("答案保存失败，请检查连接后重试。");
    return saved;
  }

  useEffect(() => () => {
    for (const timer of answerTimers.current.values()) clearTimeout(timer);
    for (const questionId of pendingAnswers.current.keys()) {
      const answer = pendingAnswers.current.get(questionId) ?? null;
      void onAnswerChangeRef.current(questionId, answer);
    }
    answerTimers.current.clear();
    pendingAnswers.current.clear();
  }, []);

  function saveAnswer(questionId: string, answer: LearnExamAnswerValue | null) {
    setAnswers((current) => {
      const next = { ...current };
      if (answer === null) delete next[questionId];
      else next[questionId] = answer;
      return next;
    });
    setSaveError("");
    pendingAnswers.current.set(questionId, answer);
    const previousTimer = answerTimers.current.get(questionId);
    if (previousTimer) clearTimeout(previousTimer);
    answerTimers.current.set(questionId, setTimeout(() => { void flushAnswer(questionId); }, 450));
  }

  async function flushPendingAnswers(): Promise<boolean> {
    const results = await Promise.all([...pendingAnswers.current.keys()].map((questionId) => flushAnswer(questionId)));
    return results.every(Boolean);
  }

  function navigate(id: string) {
    setActiveId(id);
    onNavigationChange(id, flagged);
  }

  function toggleFlag() {
    if (!question || isLocked) return;
    const next = flagged.includes(question.id)
      ? flagged.filter((id) => id !== question.id)
      : [...flagged, question.id];
    setFlagged(next);
    onNavigationChange(activeId, next);
  }

  return (
    <div className="learn-exam-panel" data-exam-status={exam.status}>
      <header className="learn-exam-panel__header">
        <div className="learn-exam-panel__identity">
          <span className="learn-exam-panel__brand-mark"><BookOpen size={16} /></span>
          <div>
            <span className="learn-exam-panel__eyebrow">学习空间 / 模拟考试</span>
            <h1>{exam.title}</h1>
            <p>{exam.subject} · 共 {exam.questions.length} 题 · 满分 {exam.totalPoints} 分</p>
          </div>
        </div>
        <div className="learn-exam-panel__meta"><span className="learn-exam-panel__subject">{exam.subject}</span><span><Clock3 size={14} /> {exam.durationMinutes} 分钟</span><span>{answeredCount}/{exam.questions.length} 已作答</span><button className="learn-exam-panel__theme-toggle" type="button" aria-label={isDark ? "切换浅色模式" : "切换暗色模式"} title={isDark ? "切换浅色模式" : "切换暗色模式"} aria-pressed={isDark} onClick={toggleTheme}>{isDark ? <Sun size={16} /> : <Moon size={16} />}</button></div>
      </header>

      <div className="learn-exam-panel__layout">
        <aside className="learn-exam-panel__sidebar" aria-label="试卷导航">
          <div className="learn-exam-panel__progress"><span>答题进度</span><strong>{answeredCount} / {exam.questions.length}</strong><i><b style={{ width: `${exam.questions.length ? answeredCount / exam.questions.length * 100 : 0}%` }} /></i></div>
          <nav>
            {sections.map(([label, questions]) => {
              const isCollapsed = collapsed.includes(label);
              const done = questions.filter((item) => isAnswered(answers[item.id])).length;
              return <section className="learn-exam-panel__section" key={label}>
                <button className="learn-exam-panel__section-head" onClick={() => setCollapsed((current) => isCollapsed ? current.filter((name) => name !== label) : [...current, label])} aria-expanded={!isCollapsed}>
                  <span>{label}</span><small>{done}/{questions.length}</small>
                </button>
                {!isCollapsed && <div className="learn-exam-panel__question-links">
                  {questions.map((item) => {
                    const index = exam.questions.findIndex((entry) => entry.id === item.id);
                    return <button key={item.id} className={item.id === activeId ? "is-active" : ""} onClick={() => navigate(item.id)} aria-current={item.id === activeId ? "page" : undefined}>
                      <span className={isAnswered(answers[item.id]) ? "is-answered" : ""}>{isAnswered(answers[item.id]) && <Check size={12} />}</span>
                      <b>{index + 1}.</b><em>{item.learningObjective || TYPE_LABEL[item.type]}</em>
                      {flagged.includes(item.id) && <Flag size={12} />}
                    </button>;
                  })}
                </div>}
              </section>;
            })}
          </nav>
          <div className="learn-exam-panel__saved"><span />{isLocked ? "答案已提交" : "答案会自动保存"}</div>
        </aside>

        <main className="learn-exam-panel__main">
          {question ? <>
            <div className="learn-exam-panel__toolbar">
              <span><strong>{activeSection?.[0] ?? TYPE_LABEL[question.type]}</strong><i>/</i>第 {activeSectionIndex + 1} 题</span>
              <button className={flagged.includes(question.id) ? "is-flagged" : ""} onClick={toggleFlag} disabled={isLocked}><Flag size={14} />{flagged.includes(question.id) ? "已标记" : "标记待检查"}</button>
            </div>
            <div className="learn-exam-panel__question-meta"><span>{TYPE_LABEL[question.type]}</span><b>{question.points} 分</b><i>·</i><span>第 {activeIndex + 1} 题 / 共 {exam.questions.length} 题</span></div>
            <div className="learn-exam-panel__prompt" role="heading" aria-level={2}><ExamRichText text={question.prompt} /></div>
            <QuestionAnswer question={question} answer={answers[question.id]} disabled={isLocked} onChange={(answer) => saveAnswer(question.id, answer)} />
            <p className="learn-exam-panel__hint"><Circle size={14} />{question.type === "multiple_choice" ? "本题为多选题，请选择所有你认为正确的选项。" : question.type === "essay" ? "尽量写出完整思路，提交后 Cyrene 会结合评分标准批改。" : "可以通过左侧导航随时切换题目，已经填写的答案会保留。"}</p>
            {exam.status === "graded" && exam.gradingResult && <GradingResult exam={exam} question={question} />}
            {exam.status === "grading" && <p className="learn-exam-panel__notice">已交卷，正在批改…</p>}
            {exam.status === "grading_failed" && <p className="learn-exam-panel__notice is-error">批改没有完成，可以重试。</p>}
            {saveError && <p className="learn-exam-panel__notice is-error">{saveError}</p>}
          </> : <p>这份试卷没有题目。</p>}
        </main>
      </div>

      <footer className="learn-exam-panel__footer">
        <span>当前进度 <b>{activeIndex + 1} / {exam.questions.length}</b></span>
        <div className="learn-exam-panel__footer-actions">
          <button onClick={() => navigate(exam.questions[Math.max(0, activeIndex - 1)]?.id ?? activeId)} disabled={activeIndex <= 0}><ChevronLeft size={15} /> 上一题</button>
          {activeIndex < exam.questions.length - 1
            ? <button className="is-primary" onClick={() => navigate(exam.questions[activeIndex + 1]?.id ?? activeId)}>下一题 <ChevronRight size={15} /></button>
            : exam.status === "draft" ? <button className="is-primary" onClick={() => setSubmitDialogOpen(true)}><Send size={14} /> 交卷</button> : null}
          {(exam.status === "grading_failed" || exam.status === "submitted") && <button className="is-primary" onClick={onRetry}>重试批改</button>}
        </div>
      </footer>

      {submitDialogOpen && <div className="learn-exam-panel__modal-backdrop" role="presentation">
        <section className="learn-exam-panel__modal" role="dialog" aria-modal="true" aria-labelledby="learn-exam-submit-title">
          <h2 id="learn-exam-submit-title">确认交卷？</h2>
          <p>已作答 {answeredCount} 题，尚有 {exam.questions.length - answeredCount} 题未作答。交卷后不能再修改答案。</p>
          <div><button onClick={() => setSubmitDialogOpen(false)}>继续检查</button><button className="is-primary" onClick={async () => { if (!await flushPendingAnswers()) return; setSubmitDialogOpen(false); await onSubmit(); }}>确认交卷</button></div>
        </section>
      </div>}
    </div>
  );
}

function QuestionAnswer({ question, answer, disabled, onChange }: { question: LearnExamQuestionView; answer?: LearnExamAnswerValue; disabled: boolean; onChange: (answer: LearnExamAnswerValue | null) => void }) {
  const options = question.options ?? [];
  if (question.type === "true_false") {
    const selected = typeof answer?.value === "boolean" ? answer.value : undefined;
    return <div className="learn-exam-panel__answers">{[{ label: "正确", value: true }, { label: "错误", value: false }].map((option, index) => <label key={String(option.value)} className={selected === option.value ? "is-selected" : ""}>
      <input type="radio" name={`answer-${question.id}`} checked={selected === option.value} disabled={disabled} onChange={() => onChange({ value: option.value })} />
      <b>{String.fromCharCode(65 + index)}</b><div className="learn-exam-panel__answer-text"><ExamRichText text={option.label} /></div>
    </label>)}</div>;
  }
  if (question.type === "single_choice") {
    const selected = typeof answer?.value === "string" ? answer.value : "";
    return <div className="learn-exam-panel__answers">{options.map((option, index) => <label key={option.id} className={selected === option.id ? "is-selected" : ""}>
      <input type="radio" name={`answer-${question.id}`} checked={selected === option.id} disabled={disabled} onChange={() => onChange({ value: option.id })} />
      <b>{String.fromCharCode(65 + index)}</b><div className="learn-exam-panel__answer-text"><ExamRichText text={option.label} /></div>
    </label>)}</div>;
  }
  if (question.type === "multiple_choice") {
    const selected = Array.isArray(answer?.value) ? answer.value : [];
    return <div className="learn-exam-panel__answers">{options.map((option, index) => {
      const checked = selected.includes(option.id);
      return <label key={option.id} className={checked ? "is-selected" : ""}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={() => onChange({ value: checked ? selected.filter((id) => id !== option.id) : [...selected, option.id] })} />
        <b>{String.fromCharCode(65 + index)}</b><div className="learn-exam-panel__answer-text"><ExamRichText text={option.label} /></div>
      </label>;
    })}</div>;
  }
  if (question.type === "fill_blank") {
    const values = Array.isArray(answer?.value) ? answer.value : [];
    return <div className="learn-exam-panel__blanks">{Array.from({ length: question.blankCount ?? 1 }, (_, index) => <label key={index}><span>填空 {index + 1}</span><input value={values[index] ?? ""} disabled={disabled} onChange={(event) => {
      const next = [...values]; next[index] = event.target.value;
      onChange(next.every((value) => !value.trim()) ? null : { value: next });
    }} placeholder="填写答案" /></label>)}</div>;
  }
  return <textarea className="learn-exam-panel__essay" value={typeof answer?.value === "string" ? answer.value : ""} disabled={disabled} onChange={(event) => onChange(event.target.value.trim() ? { value: event.target.value } : null)} placeholder={question.type === "essay" ? "写下完整的分析过程和方案…" : "在这里输入你的回答…"} />;
}

function GradingResult({ exam, question }: { exam: LearnExamView; question: LearnExamQuestionView }) {
  const result = exam.gradingResult;
  const item = result?.questionResults.find((entry) => entry.questionId === question.id);
  if (!result || !item) return null;
  return <section className="learn-exam-panel__grading"><div><strong>{item.awardedPoints} / {question.points} 分</strong>{item.ability && <span>{item.ability}</span>}</div><p>{item.feedback}</p><h3>总评：{result.totalScore} / {exam.totalPoints}</h3><p>{result.summary}</p>{result.nextSteps.length > 0 && <ul>{result.nextSteps.map((step, index) => <li key={index}>{step}</li>)}</ul>}</section>;
}
