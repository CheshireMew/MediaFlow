import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// --- Chinese ---
import zhCommon from "./locales/zh/common.json";
import zhSidebar from "./locales/zh/sidebar.json";
import zhSettings from "./locales/zh/settings.json";
import zhDashboard from "./locales/zh/dashboard.json";
import zhEditor from "./locales/zh/editor.json";
import zhDownloader from "./locales/zh/downloader.json";
import zhTranscriber from "./locales/zh/transcriber.json";
import zhTranslator from "./locales/zh/translator.json";
import zhPreprocessing from "./locales/zh/preprocessing.json";
import zhTaskmonitor from "./locales/zh/taskmonitor.json";
import zhSynthesis from "./locales/zh/synthesis.json";

// --- English ---
import enCommon from "./locales/en/common.json";
import enSidebar from "./locales/en/sidebar.json";
import enSettings from "./locales/en/settings.json";
import enDashboard from "./locales/en/dashboard.json";
import enEditor from "./locales/en/editor.json";
import enDownloader from "./locales/en/downloader.json";
import enTranscriber from "./locales/en/transcriber.json";
import enTranslator from "./locales/en/translator.json";
import enPreprocessing from "./locales/en/preprocessing.json";
import enTaskmonitor from "./locales/en/taskmonitor.json";
import enSynthesis from "./locales/en/synthesis.json";

// --- Japanese ---
import jaCommon from "./locales/ja/common.json";
import jaSidebar from "./locales/ja/sidebar.json";
import jaSettings from "./locales/ja/settings.json";
import jaDashboard from "./locales/ja/dashboard.json";
import jaEditor from "./locales/ja/editor.json";
import jaDownloader from "./locales/ja/downloader.json";
import jaTranscriber from "./locales/ja/transcriber.json";
import jaTranslator from "./locales/ja/translator.json";
import jaPreprocessing from "./locales/ja/preprocessing.json";
import jaTaskmonitor from "./locales/ja/taskmonitor.json";
import jaSynthesis from "./locales/ja/synthesis.json";

export const SUPPORTED_LANGUAGES = [
  { code: "zh", label: "简体中文" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
] as const;

export function initI18n(language: string = "zh") {
  return i18n.use(initReactI18next).init({
    resources: {
      zh: {
        common: zhCommon, sidebar: zhSidebar, settings: zhSettings,
        dashboard: zhDashboard, editor: zhEditor, downloader: zhDownloader,
        transcriber: zhTranscriber, translator: zhTranslator, preprocessing: zhPreprocessing,
        taskmonitor: zhTaskmonitor, synthesis: zhSynthesis,
      },
      en: {
        common: enCommon, sidebar: enSidebar, settings: enSettings,
        dashboard: enDashboard, editor: enEditor, downloader: enDownloader,
        transcriber: enTranscriber, translator: enTranslator, preprocessing: enPreprocessing,
        taskmonitor: enTaskmonitor, synthesis: enSynthesis,
      },
      ja: {
        common: jaCommon, sidebar: jaSidebar, settings: jaSettings,
        dashboard: jaDashboard, editor: jaEditor, downloader: jaDownloader,
        transcriber: jaTranscriber, translator: jaTranslator, preprocessing: jaPreprocessing,
        taskmonitor: jaTaskmonitor, synthesis: jaSynthesis,
      },
    },
    lng: language,
    fallbackLng: "en",
    defaultNS: "common",
    interpolation: { escapeValue: false },
  });
}

export default i18n;
