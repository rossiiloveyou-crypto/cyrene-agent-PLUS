import { useEffect, useState, type ReactNode } from "react";
import { ChevronUp } from "lucide-react";
import { useTranslation } from "../../../i18n";
import { AskUserPanel, PermissionPanel, PlanApprovalPanel, PopQuizPanel } from "./InteractionPanel";
import { resolveComposerSlot, type ComposerInteraction } from "./run-presentation";
import type { PopQuizGradedQuestion, PopQuizSubmission } from "../../../../../shared/pop-quiz";
import "./RunExperience.css";

export function ComposerSlot({
  composer,
  interaction,
  interactionBusy = false,
  onAnswer,
  onIgnore,
  onPermissionDecision,
  onQuizSubmit,
  onQuizSkip,
}: {
  composer: ReactNode;
  interaction?: ComposerInteraction;
  interactionBusy?: boolean;
  onAnswer?: (interactionId: string, answer: unknown) => void;
  onIgnore?: (interactionId: string) => void;
  onPermissionDecision?: (interactionId: string, allowed: boolean) => void;
  onQuizSubmit?: (submission: PopQuizSubmission) => Promise<{ ok: boolean; error?: string; graded?: PopQuizGradedQuestion[] }>;
  onQuizSkip?: (quizId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const slot = resolveComposerSlot(interaction);
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(false);
  }, [interaction?.id, interaction?.kind]);

  return (
    <div className={`cy-composer-slot is-${slot}${collapsed ? " is-collapsed" : ""}`}>
      <div className="cy-composer-slot__composer" aria-hidden={interaction ? true : undefined}>
        {composer}
      </div>
      {interaction && collapsed ? (
        <button
          type="button"
          className="cy-composer-slot__collapsed"
          aria-label={t("interaction.reopenCard")}
          onClick={() => setCollapsed(false)}
        >
          <span className="cy-composer-slot__collapsed-dot" aria-hidden="true" />
          <span>{t("interaction.pendingCard")}</span>
          <ChevronUp size={15} aria-hidden="true" />
        </button>
      ) : null}
      {interaction?.kind === "ask" && (
        <div className="cy-composer-slot__interaction" aria-hidden={collapsed || undefined}>
          {interaction.cardMode === "plan_approval" ? (
            <PlanApprovalPanel
              interaction={interaction}
              disabled={interactionBusy}
              onCollapse={() => setCollapsed(true)}
              onAnswer={(answer) => onAnswer?.(interaction.id, answer)}
            />
          ) : (
            <AskUserPanel
              interaction={interaction}
              disabled={interactionBusy}
              onCollapse={() => setCollapsed(true)}
              onAnswer={(answer) => onAnswer?.(interaction.id, answer)}
              onIgnore={() => onIgnore?.(interaction.id)}
            />
          )}
        </div>
      )}
      {interaction?.kind === "permission" && (
        <div className="cy-composer-slot__interaction" aria-hidden={collapsed || undefined}>
          <PermissionPanel
            interaction={interaction}
            disabled={interactionBusy}
            onCollapse={() => setCollapsed(true)}
            onDecision={(allowed) => onPermissionDecision?.(interaction.id, allowed)}
          />
        </div>
      )}
      {interaction?.kind === "quiz" && (
        <div className="cy-composer-slot__interaction" aria-hidden={collapsed || undefined}>
          <PopQuizPanel
            interaction={interaction}
            disabled={interactionBusy}
            onCollapse={() => setCollapsed(true)}
            onSubmit={onQuizSubmit}
            onSkip={onQuizSkip}
          />
        </div>
      )}
    </div>
  );
}
