import "./message-typography";
import { normalizeUiTheme, resolveUiTheme, type UiTheme, type UiThemeChoice } from "../../shared/ui-theme";

declare global {
  interface Window {
    cyreneTheme?: {
      get: () => Promise<UiTheme>;
      onChanged: (callback: (theme: UiTheme) => void) => () => void;
      getRadius: () => Promise<boolean>;
      onRadiusChanged: (callback: (theme: boolean) => void) => () => void;
    };
  }
}

export function applyUiTheme(theme: unknown): void {
  document.documentElement.dataset.uiTheme = normalizeUiTheme(theme);
  delete document.documentElement.dataset.uiThemePending;
}

export function applyUiThemeChoice(choice: UiThemeChoice): void {
  applyUiTheme(resolveUiTheme(choice, window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false));
}

function applyRadius(radius: boolean): void {
  document.documentElement.dataset.uiRadius = radius ? undefined : "false";
}

document.documentElement.dataset.uiFont = "source-han";

void window.cyreneTheme?.get()
  .then(applyUiTheme)
  .catch(() => applyUiTheme("pearl-white"));

window.cyreneTheme?.onChanged((theme) => {
  applyUiTheme(theme);
});

void window.cyreneTheme?.getRadius()
  .then(applyRadius)
  .catch(() => applyRadius(true));

window.cyreneTheme?.onRadiusChanged((theme) => {
  applyRadius(theme);
});
