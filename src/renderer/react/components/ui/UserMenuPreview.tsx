import { createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { UserAvatar } from "./UserAvatar";

let previewSettings = { uiTheme: "pearl-white", language: "zh-CN" };

Object.assign(window, {
  system: {
    openExternal: async () => ({ ok: true }),
  },
  settings: {
    getGeneral: async () => ({ ...previewSettings }),
    saveGeneral: async (patch: Record<string, unknown>) => {
      previewSettings = { ...previewSettings, ...patch };
      return { ok: true };
    },
  },
  user: {
    getProfile: async () => ({ nickname: "林", gender: "secret", callPreference: "伙伴", birthday: "", defaultCity: "", timezone: "Asia/Shanghai" }),
    getAvatar: async () => null,
    onProfileChanged: () => () => {},
    onAvatarChanged: () => () => {},
    saveProfile: async () => ({ ok: true }),
    uploadAvatar: async () => null,
  },
});

function Preview() {
  const [section, setSection] = useState("聊天");
  return createElement("div", { className: "user-menu-preview" },
    createElement("aside", { className: "user-menu-preview__sidebar" },
      createElement("div", { className: "user-menu-preview__brand" }, "Cyrene"),
      createElement("div", { className: "user-menu-preview__nav" },
        ...["新建任务", "搜索", "定时任务", "空间动态"].map((item) => createElement("button", { key: item, type: "button" }, item)),
      ),
      createElement("div", { className: "user-menu-preview__bottom" },
        createElement(UserAvatar, { label: "林" }),
        createElement("button", { type: "button", onClick: () => setSection("设置") }, "⚙ 设置"),
      ),
    ),
    createElement("main", { className: "user-menu-preview__main" },
      createElement("h1", null, section === "设置" ? "设置面板示意" : "头像菜单预览"),
      createElement("p", null, "点击左下角的头像和名称，打开个人信息与快捷设置。"),
    ),
  );
}

const root = document.getElementById("preview-root");
if (root) createRoot(root).render(createElement(Preview));
