import type { ChatPagePanel } from "./ChatPageNavigation";
import { ModelModePanel } from "./ModelModePanel";
import { PluginModePanel } from "./PluginModePanel";
import { SkillModePanel } from "./SkillModePanel";
import { ToolConsolePanel } from "./ToolConsolePanel";
import { ToolModePanel } from "./ToolModePanel";
import { MomentsPanel } from "../../moments/MomentsPanel";

export function ChatPagePanelHost({ panel }: { panel: ChatPagePanel }) {
  switch (panel) {
    case "model": return <ModelModePanel />;
    case "plugin": return <PluginModePanel />;
    case "skill": return <SkillModePanel />;
    case "tool": return <ToolModePanel />;
    case "console": return <ToolConsolePanel />;
    case "moments": return <MomentsPanel />;
  }
}
