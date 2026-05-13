import { defineConfig } from "wxt";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  manifest: {
    name: "CNC1 UserPanel",
    version: "1.0.0",
    description: "Панель инструментов администратора для CNC1/Bitrix",
    permissions: ["storage", "activeTab", "scripting", "sidePanel"],
    host_permissions: ["https://cnc1.ru/*", "https://www.cnc1.ru/*"],
    action: {
      default_title: "CNC1 UserPanel",
      default_popup: "popup.html"
    },
    side_panel: {
      default_path: "sidepanel.html"
    }
  },
  vite: () => ({
    plugins: [preact(), tailwindcss()]
  })
});
