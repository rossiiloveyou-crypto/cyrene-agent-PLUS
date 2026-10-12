import { useEffect, useState, type ReactNode } from "react";
import { ConfigProvider, theme } from "antd";
import { MantineProvider } from "@mantine/core";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";

interface AppProvidersProps {
  children: ReactNode;
}

// 跟随昔涟主题：主色和次色都换粉色，组件库默认蓝换成项目色。
// 粉值与 --rb-accent 保持一致（#FF5B8A），详见 pearl-white.css。
const ANTD_TOKENS = {
  token: {
    colorPrimary: "#FF5B8A",
    colorInfo: "#FF5B8A",
    colorLink: "#FF5B8A",
    borderRadius: 10,
  },
};

const MANTINE_THEME = {
  primaryColor: "pink",
};

export function AppProviders({ children }: AppProvidersProps) {
  const [dark, setDark] = useState(() => document.documentElement.dataset.uiTheme === "charcoal-pink");

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setDark(root.dataset.uiTheme === "charcoal-pink"));
    observer.observe(root, { attributes: true, attributeFilter: ["data-ui-theme"] });
    return () => observer.disconnect();
  }, []);

  return (
    <ConfigProvider theme={{
      ...ANTD_TOKENS,
      token: { ...ANTD_TOKENS.token, colorTextLightSolid: dark ? "#24151B" : "#FFFFFF" },
      algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    }}>
      <MantineProvider theme={MANTINE_THEME} forceColorScheme={dark ? "dark" : "light"}>
        <FeedbackProvider>{children}</FeedbackProvider>
      </MantineProvider>
    </ConfigProvider>
  );
}
