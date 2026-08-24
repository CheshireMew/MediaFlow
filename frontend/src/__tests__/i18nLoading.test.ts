import { afterAll, describe, expect, it } from "vitest";
import i18n, {
  getStartupStatusFallback,
  initI18nWithNamespaces,
} from "../i18n";
import { translateTaskMessage } from "../services/ui/taskMessage";

describe("i18n loading paths", () => {
  afterAll(async () => {
    await initI18nWithNamespaces("zh", ["common"]);
  });

  it("sources startup fallbacks from the eager Chinese common resource", () => {
    expect(getStartupStatusFallback("checkingHealth")).toBe(
      "已发现后端，正在检查服务健康状态...",
    );
    expect(getStartupStatusFallback("ready")).toBe("后端已就绪。");
  });

  it.each([
    [
      "zh",
      "后端已就绪。",
      "启用",
      "停用",
      "正在执行步骤：download",
    ],
    [
      "en",
      "Backend is ready.",
      "Enable",
      "Disable",
      "Running step: download",
    ],
    [
      "ja",
      "バックエンドの準備ができました。",
      "有効にする",
      "無効にする",
      "ステップを実行中：download",
    ],
  ] as const)(
    "loads localized UI resources for %s",
    async (
      language,
      readyText,
      enableText,
      disableText,
      taskMessageText,
    ) => {
      await initI18nWithNamespaces(language, [
        "common",
        "taskmonitor",
      ]);
      expect(i18n.t("startup.status.ready")).toBe(readyText);
      expect(i18n.t("common:enable")).toBe(enableText);
      expect(i18n.t("common:disable")).toBe(disableText);
      expect(
        translateTaskMessage(i18n.t, {
          message_code: "pipeline_step_running",
          message_params: { step: "download" },
        }),
      ).toBe(taskMessageText);
    },
  );

  it("loads the English fallback before initialization returns", async () => {
    await initI18nWithNamespaces("ja", ["common"]);

    expect(i18n.hasResourceBundle("en", "common")).toBe(true);
    expect(i18n.options.fallbackLng).toBe("en");
  });
});
