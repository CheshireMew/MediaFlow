import { describe, expect, test } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { highlightSubtitleText } from "../components/editor/subtitleTextHighlight";
import {
  findTextMatches,
  replaceAllLiteral,
} from "../components/dialogs/findReplaceUtils";
import { useCrop } from "../components/dialogs/synthesis/hooks/useCrop";
import { useSubtitleStyle } from "../components/dialogs/synthesis/hooks/useSubtitleStyle";
import { restoreStoredSynthesisExecutionPreferences } from "../services/persistence/synthesisExecutionPreferences";
import {
  computeSubtitleLineBottomMargins,
  shapeSubtitleLine,
} from "../components/dialogs/synthesis/textShaper";
import {
  buildPreviewTextShadow,
  computeDefaultSubtitleFontSize,
  computeSubtitleExportFontSize,
  hexWithOpacity,
  resolveSubtitlePreviewRenderSpec,
  resolveSubtitleRenderSourceSpec,
} from "../components/dialogs/synthesis/subtitleRender";
import { resolvePreviewViewportMetrics } from "../components/dialogs/synthesis/previewViewport";
import {
  DEFAULT_SUBTITLE_POSITION,
  hexToAss,
} from "../components/dialogs/synthesis/types";
import {
  resolveSubtitleReferenceForTranslation,
  resolveSubtitlePathForTranslation,
  resolveTranslationNavigationPayload,
} from "../hooks/editor/useEditorActions";
import { isSupportedEditorSubtitlePath } from "../hooks/editor/editorFileHelpers";
import {
  DEFAULT_SMART_SPLIT_TEXT_LIMIT,
  normalizeSmartSplitTextLimit,
  smartSplitSubtitleSegments,
} from "../utils/subtitleSmartSplit";
import {
  getTranslatorAutoloadSuffixes,
  getTranslatorOutputSuffix,
  isSupportedTranslatorSubtitlePath,
  stripTranslatorSubtitleExtension,
} from "../hooks/useFileIO";
import { getSelectedTextForFindReplace } from "../hooks/editor/useEditorFindReplace";
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
        text: "这是一个刚好触发智能分割的前半句，而且后半句也足够长",
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

  test("smart split can use a balanced comma boundary even below the length threshold", () => {
    const input = [
      {
        id: "1",
        start: 0,
        end: 6,
        text: "那就是大多数人从未获得那些经历，因为他们从不开口询问。",
      },
    ];

    const result = smartSplitSubtitleSegments(input, { textLimit: 28 });

    expect(result.splitCount).toBe(1);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].text).toBe("那就是大多数人从未获得那些经历，");
    expect(result.segments[1].text).toBe("因为他们从不开口询问。");
  });

  test("smart split can use repeated short clauses separated by two punctuation marks", () => {
    const input = [
      {
        id: "1",
        start: 0,
        end: 6,
        text: "7 个有效单元，7 个有效单元，7 个有效单元",
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
    expect(getTranslatorOutputSuffix("Chinese", "proofread")).toBe("_PR");
    expect(getTranslatorOutputSuffix("Japanese", "standard")).toBe("_JP");
  });

  test("translator autoload prefers the current target language before other saved translations", () => {
    expect(getTranslatorAutoloadSuffixes("Japanese", "standard")).toEqual([
      "_JP",
      "_CN",
      "_EN",
      "_ES",
      "_FR",
      "_DE",
      "_RU",
    ]);
    expect(getTranslatorAutoloadSuffixes("Chinese", "proofread")[0]).toBe("_PR");
  });

  test("translator navigation keeps the actual saved subtitle path", () => {
    expect(
      resolveSubtitlePathForTranslation(
        "E:/video/demo.mp4",
        "E:/subs/demo_CN.srt",
        null,
        "E:/exports/demo_final.srt",
      ),
    ).toBe("E:/exports/demo_final.srt");

    expect(
      resolveSubtitlePathForTranslation(
        "E:/video/demo.mp4",
        "E:/subs/demo_CN.srt",
        null,
        false,
      ),
    ).toBe("E:/subs/demo_CN.srt");

    expect(
      resolveSubtitlePathForTranslation(
        "E:/video/demo.mp4",
        "E:/workspace/demo_CN.srt",
        {
          path: "E:/canonical/demo_CN.srt",
          name: "demo_CN.srt",
        },
        false,
      ),
    ).toBe("E:/canonical/demo_CN.srt");
  });

  test("editor translation subtitle adapter keeps canonical refs as the single source", () => {
    expect(
      resolveSubtitleReferenceForTranslation({
        currentFilePath: "E:/video/demo.mp4",
        currentSubtitlePath: "E:/workspace/demo_CN.srt",
        currentSubtitleRef: {
          path: "E:/canonical/demo_CN.srt",
          name: "demo_CN.srt",
        },
        savedPath: false,
      }),
    ).toEqual({
      path: "E:/canonical/demo_CN.srt",
      name: "demo_CN.srt",
    });

    expect(
      resolveSubtitleReferenceForTranslation({
        currentFilePath: "E:/video/demo.mp4",
        currentSubtitlePath: "E:/workspace/demo_CN.srt",
        currentSubtitleRef: {
          path: "E:/canonical/demo_CN.srt",
          name: "demo_CN.srt",
        },
        savedPath: "E:/exports/demo_final.srt",
      }),
    ).toEqual({
      path: "E:/exports/demo_final.srt",
      name: "demo_final.srt",
    });
  });

  test("editor translation navigation preserves canonical media refs", () => {
    expect(
      resolveTranslationNavigationPayload({
        currentFilePath: "E:/workspace/demo.mp4",
        currentSubtitlePath: "E:/workspace/demo_CN.srt",
        currentFileRef: {
          path: "E:/canonical/demo.mp4",
          name: "demo.mp4",
        },
        currentSubtitleRef: {
          path: "E:/canonical/demo_CN.srt",
          name: "demo_CN.srt",
        },
        savedPath: false,
      }),
    ).toEqual({
      video_path: null,
      subtitle_path: null,
      video_ref: {
        path: "E:/canonical/demo.mp4",
        name: "demo.mp4",
      },
      subtitle_ref: {
        path: "E:/canonical/demo_CN.srt",
        name: "demo_CN.srt",
      },
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
    const { result } = renderHook(() => useCrop());

    expect(result.current.isEnabled).toBe(false);
    expect(result.current.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  test("subtitle position reset uses the standard default anchor", () => {
    expect(DEFAULT_SUBTITLE_POSITION).toEqual({ x: 0.5, y: 0.9 });
  });

  test("subtitle shaping keeps CJK punctuation off the next line start", () => {
    expect(shapeSubtitleLine("你好，世界你好", 40, 12)).toBe("你好，\n世界你\n好");
  });

  test("subtitle shaping breaks latin text at spaces when possible", () => {
    expect(shapeSubtitleLine("alpha beta gamma", 50, 12)).toBe("alpha\nbeta\ngamma");
  });

  test("subtitle shaping can use browser font measurement to avoid premature wrapping", () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() =>
      ({
        font: "",
        measureText: (text: string) => ({ width: text === "W" ? 8 : 6 }),
      }) as unknown as CanvasRenderingContext2D) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    try {
      expect(
        shapeSubtitleLine("WWW", 24, 24, { fontFamily: "Arial" }),
      ).toBe("WWW");
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  test("multiline center alignment uses symmetric bottom margins", () => {
    expect(computeSubtitleLineBottomMargins(3, 40, 20, "center")).toEqual([
      60, 40, 20,
    ]);
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
    ).toEqual({
      isReady: false,
      width: 960,
      height: 540,
      fontSize: 0,
      outlineSize: 0,
      shadowSize: 0,
      backgroundPadding: 0,
      lineInsetSize: 0,
      lineStep: 0,
      marginV: 0,
      marginL: 0,
      marginR: 0,
      availableWidth: 0,
      backgroundColor: "transparent",
      padding: "0px",
    });
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

  test("source render spec anchors subtitles against the cropped output height", () => {
    const viewport = resolvePreviewViewportMetrics({
      sourceWidth: 1920,
      sourceHeight: 1080,
      crop: { x: 0, y: 0.1, w: 1, h: 0.8 },
    });

    const source = resolveSubtitleRenderSourceSpec({
      fontSize: 24,
      fontColor: "#FFFFFF",
      fontName: "Arial",
      isBold: false,
      isItalic: false,
      outlineSize: 2,
      shadowSize: 0,
      outlineColor: "#000000",
      bgEnabled: false,
      bgColor: "#000000",
      bgOpacity: 0.5,
      bgPadding: 5,
      alignment: 2,
      multilineAlign: "center",
      subPos: { x: 0.5, y: 0.9 },
      outputWidth: viewport.outputSourceWidth,
      outputHeight: viewport.outputSourceHeight,
    });

    expect(source.outputHeight).toBe(864);
    expect(source.marginV).toBe(86);
  });

  test("subtitle export font size compensates for ass rendering being smaller than css", () => {
    expect(computeSubtitleExportFontSize(24)).toBe(30);
    expect(computeSubtitleExportFontSize(40)).toBe(50);
  });

  test("default subtitle font size adapts to the video height", () => {
    expect(computeDefaultSubtitleFontSize(0)).toBe(24);
    expect(computeDefaultSubtitleFontSize(240)).toBe(12);
    expect(computeDefaultSubtitleFontSize(320)).toBe(16);
    expect(computeDefaultSubtitleFontSize(720)).toBe(40);
    expect(computeDefaultSubtitleFontSize(1080)).toBe(60);
    expect(computeDefaultSubtitleFontSize(2160)).toBe(120);
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
        ({ videoHeight, videoPath }) =>
          useSubtitleStyle(
            true,
            [],
            0,
            videoHeight,
            videoPath,
            persistedPreferences,
          ),
        {
          initialProps: { videoHeight: 1080, videoPath: "E:/video-a.mp4" },
        },
      );

      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.fontSize).toBe(60);

      rerender({ videoHeight: 720, videoPath: "E:/video-b.mp4" });
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.fontSize).toBe(40);
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
          subtitleEnabled: true,
          watermarkEnabled: true,
          quality: "balanced",
          useGpu: true,
          lastOutputDir: null,
          subtitleStyle: {
            fontSize: 40,
            fontColor: "#FFFFFF",
            fontName: "Arial",
            isBold: false,
            isItalic: false,
            outlineSize: 2,
            shadowSize: 0,
            outlineColor: "#000000",
            bgEnabled: false,
            bgColor: "#000000",
            bgOpacity: 0.5,
            bgPadding: 5,
            alignment: 2,
            multilineAlign: "center",
            subPos: { x: 0.5, y: 0.9 },
            customPresets: [],
          },
          watermark: {
            wmScale: 0.2,
            wmOpacity: 0.8,
            wmPos: { x: 0.5, y: 0.5 },
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
          720,
          "E:/video-a.mp4",
          persistedPreferences,
        ),
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.fontSize).toBe(40);
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
        ({ videoHeight, videoPath }) =>
          useSubtitleStyle(
            true,
            [],
            0,
            videoHeight,
            videoPath,
            persistedPreferences,
          ),
        {
          initialProps: { videoHeight: 1080, videoPath: "E:/video-a.mp4" },
        },
      );

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        result.current.setFontSize(30);
      });
      rerender({ videoHeight: 720, videoPath: "E:/video-b.mp4" });
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.fontSize).toBe(40);
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
        ({ videoHeight }) =>
          useSubtitleStyle(
            true,
            [],
            0,
            videoHeight,
            "E:/video-a.mp4",
            persistedPreferences,
          ),
        {
          initialProps: { videoHeight: 0 },
        },
      );

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        result.current.setFontSize(32);
      });

      rerender({ videoHeight: 1080 });
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
