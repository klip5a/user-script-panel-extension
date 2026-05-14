import { defineConfig } from "wxt";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  manifest: {
    name: "CNC1 UserPanel",
    version: "1.1.0",
    description: "Панель инструментов администратора для CNC1/Bitrix",
    permissions: ["storage", "activeTab", "scripting", "sidePanel"],
    host_permissions: ["https://cnc1.ru/*", "https://www.cnc1.ru/*"],
    icons: {
      16: "icon/16.png",
      32: "icon/32.png",
      48: "icon/48.png",
      96: "icon/96.png",
      128: "icon/128.png"
    },
    action: {
      default_title: "CNC1 UserPanel",
      default_icon: {
        16: "icon/16.png",
        32: "icon/32.png",
        48: "icon/48.png",
        96: "icon/96.png",
        128: "icon/128.png"
      }
    },
    side_panel: {
      default_path: "sidepanel.html"
    }
  },
  outDir: ".output/cnc1-admin-extension",
  vite: () => ({
    plugins: [preact(), tailwindcss()]
  })
});
