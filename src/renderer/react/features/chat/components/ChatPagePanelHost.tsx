import type { ChatPagePanel } from "./ChatPageNavigation";
import { PluginModePanel } from "./PluginModePanel";
import { ToolConsolePanel } from "./ToolConsolePanel";
import { MomentsPanel } from "../../moments/MomentsPanel";
import { ScheduledTasksPanel } from "../../scheduler/ScheduledTasksPanel";

export function ChatPagePanelHost({
  panel,
  onPickWorkspace,
  onOpenSession,
}: {
  panel: ChatPagePanel;
  onPickWorkspace: () => Promise<{ ok: boolean; path?: string; displayName?: string; error?: string }>;
  onOpenSession: (sessionId: string) => void;
}) {
  switch (panel) {
    case "plugin": return <PluginModePanel />;
    case "console": return <ToolConsolePanel />;
    case "moments": return <MomentsPanel />;
    case "scheduledTasks": return <ScheduledTasksPanel onPickWorkspace={onPickWorkspace} onOpenSession={onOpenSession} />;
  }
}
