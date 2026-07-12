import { describe, expect, it } from "vitest";

import { TASK_MESSAGE_CODES } from "../contracts/runtimeContracts";
import en from "../i18n/locales/en/taskmonitor.json";
import ja from "../i18n/locales/ja/taskmonitor.json";
import zh from "../i18n/locales/zh/taskmonitor.json";


describe("task message catalog", () => {
  it.each([
    ["en", en.taskMessages],
    ["zh", zh.taskMessages],
    ["ja", ja.taskMessages],
  ])("keeps the %s locale in exact sync with the wire catalog", (_locale, messages) => {
    expect(Object.keys(messages).sort()).toEqual([...TASK_MESSAGE_CODES].sort());
  });
});
