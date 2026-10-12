import { SegmentedControl } from "@mantine/core";
import { BookOpen, FolderCode, MessageCircle, Monitor } from "lucide-react";

interface ModeSwitchProps {
  value: string;
  onChange: (mode: string) => void;
}

const iconProps = {
  size: 15,
  strokeWidth: 1.8,
  "aria-hidden": true as const,
  focusable: false as const,
};

const modes = [
  { value: "work", label: <><Monitor {...iconProps} /><span>Work</span></> },
  { value: "chat", label: <><MessageCircle {...iconProps} /><span>Chat</span></> },
  { value: "code", label: <><FolderCode {...iconProps} /><span>Code</span></> },
  { value: "learn", label: <><BookOpen {...iconProps} /><span>Learn</span></> },
];

export function ModeSwitch({ value, onChange }: ModeSwitchProps) {
  return (
    <SegmentedControl
      aria-label="Conversation mode"
      classNames={{
        root: "cy-mode-switch",
        control: "cy-mode-switch__control",
        input: "cy-mode-switch__input",
        label: "cy-mode-switch__label",
        indicator: "cy-mode-switch__indicator",
        innerLabel: "cy-mode-switch__content",
      }}
      name="conversation-mode"
      onChange={onChange}
      data={modes}
      value={value}
      size="sm"
      radius="md"
      transitionDuration={180}
      withItemsBorders={false}
    />
  );
}
