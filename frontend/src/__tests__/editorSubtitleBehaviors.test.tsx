import { describe, expect, test } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { highlightSubtitleText } from "../components/editor/subtitleTextHighlight";
import {
  findTextMatches,
  replaceAllLiteral,
} from "../components/dialogs/findReplaceUtils";
import { useCrop } from "../components/dialogs/synthesis/hooks/useCrop";
import { useSubtitleStyle } from "../components/dialogs/synthesis/hooks/useSubtitleStyle";
import {
  DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES,
  restoreStoredSynthesisExecutionPreferences,
} from "../services/persistence/synthesisExecutionPreferences";
import {
  buildEmptySubtitlePreviewRenderSpec,
  buildPreviewTextShadow,
  computeDefaultSubtitleFontSize,
  computeSubtitleExportFontSize,
  DEFAULT_SUBTITLE_POSITION,
  hexToAss,
  hexWithOpacity,
  resolveContainedViewportFrame,
  resolveDefaultWatermarkLayout,
  resolvePreviewViewportMetrics,
  resolveSubtitlePreviewRenderSpec,
  resolveSubtitleRenderSourceSpec,
  resolveWatermarkPosition,
} from "../services/domain";
import {
  resolveSubtitleReferenceForSavedPath,
} from "../hooks/editor/useEditorActions";
import { createNavigationMediaPayload } from "../services/ui/navigation";
import { isSupportedEditorSubtitlePath } from "../hooks/editor/editorFileHelpers";
import {
  DEFAULT_SMART_SPLIT_TEXT_LIMIT,
  normalizeSmartSplitTextLimit,
  smartSplitSubtitleSegments,
} from "../utils/subtitleSmartSplit";
import {
  buildTranslatorOutputPath,
  getTranslatorAutoloadSuffixes,
  getTranslatorOutputSuffix,
  isSupportedTranslatorSubtitlePath,
  stripTranslatorSubtitleExtension,
} from "../hooks/useFileIO";
import { getSelectedTextForFindReplace } from "../hooks/editor/useEditorFindReplace";
import { buildSuffixedOutputPath } from "../services/ui/generatedOutputPath";
import { fixOverlaps } from "../utils/validation";

describe("editor subtitle behaviors", () => {
  test("highlights repeated matches consistently", () => {
    const { container } = render(
      <div>{highlightSubtitleText("test alpha test beta test", "test", false)}</div>,
    );

    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(3);
    expect(Array.from(marks).map((node) => node.textContent)).toEqual([
      "test",
      "test",
      "test",
    ]);
  });

  test("auto-fix does not move subtitles that already have enough gap", () => {
    const input = [
      { id: "1", start: 0, end: 1, text: "A" },
      { id: "2", start: 1.02, end: 2, text: "B" },
    ];

    expect(fixOverlaps(input)).toBe(input);
  });

  test("auto-fix adjusts real overlaps with tolerance buffer", () => {
    const input = [
      { id: "1", start: 0, end: 1, text: "A" },
      { id: "2", start: 0.9, end: 2, text: "B" },
    ];

    const fixed = fixOverlaps(input);
    expect(fixed).not.toBe(input);
    expect(fixed[1].start).toBe(1.05);
    expect(fixed[1].end).toBe(2.15);
  });

  test("smart split reuses one rule set for long subtitle rows and renumbers the result", () => {
    const input = [
      {
        id: "7",
        start: 0,
        end: 6,
        text: "hello world this sentence is intentionally long enough, and the second clause is also long enough to split cleanly",
      },
      {
        id: "9",
        start: 6,
        end: 7.2,
        text: "short",
      },
    ];

    const result = smartSplitSubtitleSegments(input);

    expect(result.splitCount).toBe(1);
    expect(result.segments).toHaveLength(3);
    expect(result.segments.map((segment) => segment.id)).toEqual(["1", "2", "3"]);
    expect(result.segments[0].text).not.toBe("");
    expect(result.segments[1].text).not.toBe("");
    expect(result.segments[2].text).toBe("short");
  });

  test("smart split still uses a strong boundary even when the length threshold is raised", () => {
    const input = [
      {
        id: "1",
        start: 0,
        end: 6,
        text: "This sentence has a strong punctuation boundary, and the second half is long enough too.",
      },
    ];

    expect(DEFAULT_SMART_SPLIT_TEXT_LIMIT).toBe(24);
    expect(normalizeSmartSplitTextLimit(undefined)).toBe(24);
    expect(smartSplitSubtitleSegments(input).splitCount).toBe(1);
    expect(smartSplitSubtitleSegments(input, { textLimit: 40 }).splitCount).toBe(1);
  });

  test("smart split can still split long lines that have no punctuation boundary", () => {
    const input = [
      {
        id: "1",
        start: 0,
        end: 6,
        text: "this is a very long subtitle sentence with enough words to trigger the length limit but there is no punctuation anywhere in it",
      },
    ];

    const result = smartSplitSubtitleSegments(input);

    expect(result.splitCount).toBe(1);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].text.length).toBeGreaterThan(0);
    expect(result.segments[1].text.length).toBeGreaterThan(0);
  });

  test("smart split does not break immediately after a number followed by whitespace", () => {
    const input = [
      {
        id: "1",
        start: 0,
        end: 6,
        text: "this subtitle has enough words before marker 1 and enough words after marker to force a split without punctuation",
      },
    ];

    const result = smartSplitSubtitleSegments(input, { textLimit: 12 });
    const joined = result.segments.map((segment) => segment.text).join("|");

    expect(result.splitCount).toBe(1);
    expect(joined).not.toContain("1|and");
  });

  test("smart split keeps short CJK numeric amounts with their clause", () => {
    const input = [
      {
        id: "1",
        start: 75.65,
        end: 80.16,
        text: "然后股价下跌，他们一直在等了三四年，等它涨回60美元",
      },
    ];

    const result = smartSplitSubtitleSegments(input);

    expect(result.splitCount).toBe(1);
    expect(result.segments.map((segment) => segment.text)).toEqual([
      "然后股价下跌，他们一直在等了三四年，",
      "等它涨回60美元",
    ]);
  });

  test("smart split keeps english words intact inside mixed CJK subtitles", () => {
    const input = [
      {
        id: "1",
        start: 0,
        end: 6,
        text: "浣嗕粬涓嶅厑璁稿彶钂傚か路涔斿竷鏂 Apple One 鐢佃剳鍋氫换浣曟敼鍔ㄨ繖鐪熺殑闈炲父绂昏氨",
      },
    ];

    const result = smartSplitSubtitleSegments(input, { textLimit: 24 });
    const joined = result.segments.map((segment) => segment.text).join("|");

    expect(result.splitCount).toBe(1);
    expect(result.segments).toHaveLength(2);
    expect(joined.includes("Ap|ple")).toBe(false);
    expect(joined.includes("O|ne")).toBe(false);
    expect(result.segments.some((segment) => segment.text.includes("Apple"))).toBe(true);
  });

  test("smart split can use a balanced comma boundary even below the length threshold", () => {
    const input = [
      {
        id: "1",
        start: 0,
        end: 6,
        text: "This sentence has a strong punctuation boundary, and the second half is long enough too.",
      },
    ];

    const result = smartSplitSubtitleSegments(input, { textLimit: 28 });

    expect(result.splitCount).toBe(1);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].text).toBe("This sentence has a strong punctuation boundary,");
    expect(result.segments[1].text).toBe("and the second half is long enough too.");
  });

  test("smart split prefers a substantial comma boundary over midpoint whitespace", () => {
    const input = [
      {
        id: "1",
        start: 0,
        end: 6,
        text: '"Pydantic is still all you need", 大概是在去年这个时候,',
      },
    ];

    const result = smartSplitSubtitleSegments(input);

    expect(result.splitCount).toBe(1);
    expect(result.segments[0].text).toBe('"Pydantic is still all you need",');
    expect(result.segments[1].text).toBe("大概是在去年这个时候,");
  });

  test("smart split keeps latin initialisms and middle-dot names intact", () => {
    const input = [
      {
        id: "1",
        start: 0,
        end: 6,
        text: "这段内容正在讨论 J.P. 摩根如何影响市场并持续扩展业务",
      },
      {
        id: "2",
        start: 6,
        end: 12,
        text: "这段内容正在讨论西格蒙德·弗洛伊德理论如何影响现代心理学",
      },
    ];

    const result = smartSplitSubtitleSegments(input, { textLimit: 12 });
    const joinedRows = result.segments.map((segment) => segment.text).join("|");

    expect(result.splitCount).toBe(2);
    expect(joinedRows).not.toContain("J.P.|摩根");
    expect(joinedRows).not.toContain("西格蒙德·|弗洛伊德");
    expect(joinedRows).not.toContain("西格蒙德|·弗洛伊德");
  });

  test("smart split keeps multi-word latin and Hangul names intact", () => {
    const input = [
      {
        id: "1",
        start: 0,
        end: 6,
        text: "我不知道 David Pereira 是否会认为我们正在做的是正确的决定",
      },
      {
        id: "2",
        start: 6,
        end: 12,
        text: "중구청장 후보 이동현의 공약은 골목 상권과 주민 생활을 함께 바꾸는 계획입니다",
      },
    ];

    const result = smartSplitSubtitleSegments(input, { textLimit: 12 });
    const joinedRows = result.segments.map((segment) => segment.text).join("|");

    expect(result.splitCount).toBe(2);
    expect(joinedRows).not.toContain("David|Pereira");
    expect(joinedRows).not.toContain("이동|현");
  });

  test("smart split can use repeated short clauses separated by two punctuation marks", () => {
    const input = [
      {
        id: "1",
        start: 0,
        end: 6,
        text: "This sentence has a strong punctuation boundary, and the second half is long enough too.",
      },
    ];

    const result = smartSplitSubtitleSegments(input, { textLimit: 28 });

    expect(result.splitCount).toBe(1);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].text.length).toBeGreaterThan(0);
    expect(result.segments[1].text.length).toBeGreaterThan(0);
  });

  test("editor only accepts srt subtitle files", () => {
    expect(isSupportedEditorSubtitlePath("demo.srt")).toBe(true);
    expect(isSupportedEditorSubtitlePath("demo.vtt")).toBe(false);
    expect(isSupportedEditorSubtitlePath("demo.ass")).toBe(false);
  });

  test("translator only accepts subtitle files", () => {
    expect(isSupportedTranslatorSubtitlePath("demo.srt")).toBe(true);
    expect(isSupportedTranslatorSubtitlePath("demo.ass")).toBe(true);
    expect(isSupportedTranslatorSubtitlePath("demo.ssa")).toBe(true);
    expect(isSupportedTranslatorSubtitlePath("demo.txt")).toBe(false);
    expect(isSupportedTranslatorSubtitlePath("demo.mp4")).toBe(false);
    expect(isSupportedTranslatorSubtitlePath("demo.mp3")).toBe(false);
  });

  test("translator strips supported subtitle extensions before looking for the video", () => {
    expect(stripTranslatorSubtitleExtension("E:/clips/demo.ssa")).toBe(
      "E:/clips/demo",
    );
    expect(stripTranslatorSubtitleExtension("E:/clips/demo.ass")).toBe(
      "E:/clips/demo",
    );
    expect(stripTranslatorSubtitleExtension("E:/clips/demo.srt")).toBe(
      "E:/clips/demo",
    );
  });

  test("proofread exports to a dedicated suffix instead of language suffix", () => {
    expect(getTranslatorOutputSuffix("SimplifiedChinese", "proofread")).toBe("_PR");
    expect(getTranslatorOutputSuffix("Japanese", "standard")).toBe("_JP");
  });

  test("translator output path preserves normal names and shortens Windows edge paths", () => {
    expect(buildTranslatorOutputPath("E:/subs/demo.srt", "_ZH-CN")).toBe(
      "E:/subs/demo_ZH-CN.srt",
    );
    expect(buildTranslatorOutputPath("E:/subs/demo.ts.srt", "_ZH-CN")).toBe(
      "E:/subs/demo.ts_ZH-CN.srt",
    );

    const longPath = buildTranslatorOutputPath(
      "C:\\Users\\Lenovo\\Downloads\\Cannibal Stocks (@cannibalstocks)- 'Mohnish Pabrai just revealed that Charlie Munger was buying Alpha Metallurgical Resources literally days before he passed away. Still making long-term bets at 99.9 years old. $AMR traded ar.ts.srt",
      "_ZH-CN",
    );

    expect(longPath.length).toBeLessThanOrEqual(240);
    expect(longPath).toMatch(/-[0-9a-f]{8}_ZH-CN\.srt$/);
  });

  test("synthesis output path uses mp4 even when the source is transport stream", () => {
    expect(
      buildSuffixedOutputPath("E:/clips/demo.ts", "_synthesized", ".mp4"),
    ).toBe("E:/clips/demo_synthesized.mp4");

    const longPath = buildSuffixedOutputPath(
      "C:\\Users\\Lenovo\\Downloads\\Cannibal Stocks (@cannibalstocks)- 'Mohnish Pabrai just revealed that Charlie Munger was buying Alpha Metallurgical Resources literally days before he passed away. Still making long-term bets at 99.9 years old. $AMR traded ar.ts",
      "_synthesized",
      ".mp4",
    );

    expect(longPath.length).toBeLessThanOrEqual(240);
    expect(longPath).toMatch(/-[0-9a-f]{8}_synthesized\.mp4$/);
  });

  test("translator autoload prefers the current target language before other saved translations", () => {
    expect(getTranslatorAutoloadSuffixes("Japanese", "standard")).toEqual([
      "_JP",
      "_ZH-CN",
      "_ZH-TW",
      "_EN",
      "_ES",
      "_FR",
      "_DE",
      "_RU",
    ]);
    expect(getTranslatorAutoloadSuffixes("SimplifiedChinese", "proofread")[0]).toBe("_PR");
  });

  test("saved subtitle reference is derived from the canonical document", () => {
    const video = { path: "E:/video/demo.ts", name: "demo.ts" };
    const subtitle = {
      path: "E:/canonical/demo.ts_ZH-CN.srt",
      name: "demo.ts_ZH-CN.srt",
    };

    expect(
      resolveSubtitleReferenceForSavedPath({
        video,
        subtitle,
        savedPath: "E:/workspace/demo.ts_ZH-CN.srt",
      }),
    ).toEqual({
      path: "E:/workspace/demo.ts_ZH-CN.srt",
      name: "demo.ts_ZH-CN.srt",
    });
    expect(
      resolveSubtitleReferenceForSavedPath({
        video,
        subtitle,
        savedPath: false,
      }),
    ).toEqual(subtitle);
    expect(
      resolveSubtitleReferenceForSavedPath({
        video,
        subtitle: null,
        savedPath: false,
      }).path,
    ).toBe("E:/video/demo.srt");

    expect(createNavigationMediaPayload({ videoRef: video, subtitleRef: subtitle })).toEqual({
      video_ref: video,
      subtitle_ref: subtitle,
    });
  });

  test("find and replace-all use non-overlapping matches consistently", () => {
    expect(findTextMatches("banana", "ana", false)).toEqual([
      { start: 1, end: 4 },
    ]);

    expect(replaceAllLiteral("banana", "ana", "X", false)).toBe("bXna");
  });

  test("replace-all treats replacement text literally", () => {
    expect(replaceAllLiteral("a a", "a", "$1", false)).toBe("$1 $1");
  });

  test("find replace prefills the current textarea selection", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "hello selected world";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.setSelectionRange(6, 14);

    expect(getSelectedTextForFindReplace(document)).toBe("selected");

    textarea.remove();
  });

  test("crop starts from the full frame until the user adjusts it", () => {
    const { result } = renderHook(() =>
      useCrop(true, "E:/video-a.mp4"),
    );

    expect(result.current.isEnabled).toBe(false);
    expect(result.current.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  test("crop resets instead of restoring stale values when the video changes", async () => {
    const { result, rerender } = renderHook(
      ({ videoPath }) => useCrop(true, videoPath),
      { initialProps: { videoPath: "E:/video-a.mp4" } },
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    act(() => {
      result.current.setIsEnabled(true);
      result.current.setCrop({ x: 0.1, y: 0.2, w: 0.7, h: 0.6 });
    });

    rerender({ videoPath: "E:/video-b.mp4" });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isEnabled).toBe(false);
    expect(result.current.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  test("subtitle position reset uses the standard default anchor", () => {
    expect(DEFAULT_SUBTITLE_POSITION).toEqual({ x: 0.5, y: 0.9 });
  });


  test("preview subtitle render waits for source metadata before scaling styles", () => {
    const source = resolveSubtitleRenderSourceSpec({
      fontSize: 24,
      fontColor: "#FFFFFF",
      fontName: "Arial",
      isBold: false,
      isItalic: false,
      outlineSize: 2,
      shadowSize: 1,
      outlineColor: "#000000",
      bgEnabled: false,
      bgColor: "#000000",
      bgOpacity: 0.5,
      bgPadding: 5,
      alignment: 2,
      multilineAlign: "center",
      subPos: { x: 0.5, y: 0.9 },
      outputWidth: 0,
      outputHeight: 0,
    });

    expect(
      resolveSubtitlePreviewRenderSpec({
        source,
        previewWidth: 960,
        previewHeight: 540,
      }),
    ).toEqual(buildEmptySubtitlePreviewRenderSpec(960, 540));
  });

  test("preview subtitle render comes from a single source spec once metadata is ready", () => {
    const source = resolveSubtitleRenderSourceSpec({
      fontSize: 48,
      fontColor: "#FFFFFF",
      fontName: "Arial",
      isBold: false,
      isItalic: false,
      outlineSize: 4,
      shadowSize: 2,
      outlineColor: "#000000",
      bgEnabled: true,
      bgColor: "#000000",
      bgOpacity: 0.5,
      bgPadding: 6,
      alignment: 2,
      multilineAlign: "center",
      subPos: { x: 0.5, y: 0.9 },
      outputWidth: 1920,
      outputHeight: 1080,
    });

    expect(
      resolveSubtitlePreviewRenderSpec({
        source,
        previewWidth: 960,
        previewHeight: 540,
      }),
    ).toMatchObject({
      isReady: true,
      fontSize: 24,
      outlineSize: 2,
      shadowSize: 1,
      backgroundPadding: 3,
      lineInsetSize: 3,
      lineStep: 30,
      marginV: 54,
      marginL: 19,
      marginR: 19,
      availableWidth: 922,
      backgroundColor: "#00000080",
      padding: "3px",
    });
  });

  test("cropped preview viewport exposes the final output aspect and content offsets", () => {
    expect(
      resolvePreviewViewportMetrics({
        sourceWidth: 1920,
        sourceHeight: 1080,
        crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 },
      }),
    ).toMatchObject({
      outputSourceWidth: 960,
      outputSourceHeight: 540,
      aspectRatio: 960 / 540,
      contentWidthPercent: 200,
      contentHeightPercent: 200,
      contentOffsetXPercent: -20,
      contentOffsetYPercent: -40,
    });
  });

  test("contained preview frame keeps portrait videos inside the editor stage", () => {
    const viewport = resolvePreviewViewportMetrics({
      sourceWidth: 1080,
      sourceHeight: 1920,
    });

    expect(viewport.aspectRatio).toBe(1080 / 1920);
    expect(
      resolveContainedViewportFrame({
        containerWidth: 1200,
        containerHeight: 800,
        aspectRatio: viewport.aspectRatio,
      }),
    ).toEqual({
      width: 450,
      height: 800,
    });
  });

  test("source render spec anchors subtitles against the cropped output height", () => {
    const viewport = resolvePreviewViewportMetrics({
      sourceWidth: 1920,
      sourceHeight: 1080,
      crop: { x: 0, y: 0.1, w: 1, h: 0.8 },
    });

    const source = resolveSubtitleRenderSourceSpec({
      ...DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle,
      outputWidth: viewport.outputSourceWidth,
      outputHeight: viewport.outputSourceHeight,
    });

    expect(source.outputHeight).toBe(864);
    expect(source.marginV).toBe(86);
  });

  test("subtitle export font size uses the authored preview size", () => {
    expect(computeSubtitleExportFontSize(24)).toBe(24);
    expect(computeSubtitleExportFontSize(40)).toBe(40);
  });

  test("default subtitle font size adapts to the constrained output edge", () => {
    expect(computeDefaultSubtitleFontSize({ width: 0, height: 0 })).toBe(24);
    expect(computeDefaultSubtitleFontSize({ width: 426, height: 240 })).toBe(14);
    expect(computeDefaultSubtitleFontSize({ width: 568, height: 320 })).toBe(18);
    expect(computeDefaultSubtitleFontSize({ width: 1280, height: 720 })).toBe(44);
    expect(computeDefaultSubtitleFontSize({ width: 1920, height: 1080 })).toBe(66);
    expect(computeDefaultSubtitleFontSize({ width: 3840, height: 2160 })).toBe(132);
    expect(computeDefaultSubtitleFontSize({ width: 1080, height: 1920 })).toBe(66);
    expect(computeDefaultSubtitleFontSize({ width: 1440, height: 1080 })).toBe(60);
    expect(computeDefaultSubtitleFontSize({ width: 628, height: 480 })).toBe(26);
  });

  test("portrait watermark defaults use portrait scale and edge-safe top-right position", () => {
    const layout = resolveDefaultWatermarkLayout({
      outputWidth: 1080,
      outputHeight: 1920,
      watermarkWidth: 400,
      watermarkHeight: 120,
    });

    expect(layout.wmScale).toBe(0.16);
    expect(layout.wmPos.x).toBeCloseTo(0.875);
    expect(layout.wmPos.y).toBeCloseTo(0.0485);
  });

  test("watermark presets resolve against the current output aspect", () => {
    const position = resolveWatermarkPosition({
      preset: "BR",
      outputWidth: 1080,
      outputHeight: 1920,
      watermarkWidth: 400,
      watermarkHeight: 120,
      wmScale: 0.16,
    });

    expect(position.x).toBeCloseTo(0.875);
    expect(position.y).toBeCloseTo(0.9515);
  });

  test("subtitle style recommends a new font size when switching videos before manual override", async () => {
    localStorage.removeItem("sub_fontSize");
    localStorage.removeItem("synthesis_execution_preferences");
    const persistedPreferences = restoreStoredSynthesisExecutionPreferences();
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() =>
      ({
        font: "",
        measureText: () => ({ width: 10 }),
      }) as unknown as CanvasRenderingContext2D) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    try {
      const { result, rerender } = renderHook(
        ({ outputSize, videoPath }) =>
          useSubtitleStyle(
            true,
            [],
            0,
            outputSize,
            videoPath,
            persistedPreferences,
          ),
        {
          initialProps: { outputSize: { w: 1920, h: 1080 }, videoPath: "E:/video-a.mp4" },
        },
      );

      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.fontSize).toBe(66);

      rerender({ outputSize: { w: 1280, h: 720 }, videoPath: "E:/video-b.mp4" });
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.fontSize).toBe(44);
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  test("subtitle style ignores the last persisted font size when opening and recomputes from video height", async () => {
    localStorage.setItem(
      "synthesis_execution_preferences",
      JSON.stringify({
        schema_version: 1,
        payload: {
          ...DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES,
          subtitleStyle: {
            ...DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES.subtitleStyle,
            fontSize: 40,
          },
        },
      }),
    );
    const persistedPreferences = restoreStoredSynthesisExecutionPreferences();
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() =>
      ({
        font: "",
        measureText: () => ({ width: 10 }),
      }) as unknown as CanvasRenderingContext2D) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    try {
      const { result } = renderHook(() =>
        useSubtitleStyle(
          true,
          [],
          0,
          { w: 1280, h: 720 },
          "E:/video-a.mp4",
          persistedPreferences,
        ),
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.fontSize).toBe(44);
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  test("subtitle style recalculates the recommended font size whenever the video changes", async () => {
    localStorage.removeItem("sub_fontSize");
    localStorage.removeItem("synthesis_execution_preferences");
    const persistedPreferences = restoreStoredSynthesisExecutionPreferences();
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() =>
      ({
        font: "",
        measureText: () => ({ width: 10 }),
      }) as unknown as CanvasRenderingContext2D) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    try {
      const { result, rerender } = renderHook(
        ({ outputSize, videoPath }) =>
          useSubtitleStyle(
            true,
            [],
            0,
            outputSize,
            videoPath,
            persistedPreferences,
          ),
        {
          initialProps: { outputSize: { w: 1920, h: 1080 }, videoPath: "E:/video-a.mp4" },
        },
      );

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        result.current.setFontSize(30);
      });
      rerender({ outputSize: { w: 1280, h: 720 }, videoPath: "E:/video-b.mp4" });
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.fontSize).toBe(44);
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  test("subtitle style keeps the manual font size when the same video metadata arrives late", async () => {
    localStorage.removeItem("sub_fontSize");
    localStorage.removeItem("synthesis_execution_preferences");
    const persistedPreferences = restoreStoredSynthesisExecutionPreferences();
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() =>
      ({
        font: "",
        measureText: () => ({ width: 10 }),
      }) as unknown as CanvasRenderingContext2D) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    try {
      const { result, rerender } = renderHook(
        ({ outputSize }) =>
          useSubtitleStyle(
            true,
            [],
            0,
            outputSize,
            "E:/video-a.mp4",
            persistedPreferences,
          ),
        {
          initialProps: { outputSize: { w: 0, h: 0 } },
        },
      );

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        result.current.setFontSize(32);
      });

      rerender({ outputSize: { w: 1920, h: 1080 } });
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.fontSize).toBe(32);
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  test("ass-like preview shadow includes outline ring and drop shadow", () => {
    const shadow = buildPreviewTextShadow({
      outlineSize: 2,
      outlineColor: "#000000",
      shadowSize: 2,
      backgroundEnabled: false,
    });

    expect(shadow).toContain("-2px 0px 0 #000000");
    expect(shadow).toContain("1px 1px 0 #000000");
    expect(shadow).toContain("2px 2px 0 rgba(0,0,0,0.88)");
    expect(shadow).toContain("2px 2px 2px rgba(0,0,0,0.35)");
  });

  test("background panel mode suppresses outline ring but keeps drop shadow", () => {
    const shadow = buildPreviewTextShadow({
      outlineSize: 3,
      outlineColor: "#000000",
      shadowSize: 2,
      backgroundEnabled: true,
    });

    expect(shadow).toBe("2px 2px 0 rgba(0,0,0,0.88), 2px 2px 2px rgba(0,0,0,0.35)");
    expect(hexWithOpacity("#000000", 0.5)).toBe("#00000080");
  });

  test("ass background color tracks the selected preview opacity instead of a fixed alpha", () => {
    const bgAlphaHex = Math.round((1 - 0.35) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
    const assBackgroundColor = hexToAss("#123456", bgAlphaHex);

    expect(assBackgroundColor).toBe("&HA6563412");
    expect(assBackgroundColor).not.toBe("&H80000000");
  });
});
