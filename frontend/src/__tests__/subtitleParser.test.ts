import { expect, test } from "vitest";
import {
  parseASS,
  parseSRT,
  parseSubtitleContent,
} from "../utils/subtitleParser";

test("parses simple SRT content correctly", () => {
  const srtContent = `1
00:00:01,000 --> 00:00:02,000
Hello World

2
00:00:03,500 --> 00:00:05,000
Second Line`;

  const parsed = parseSRT(srtContent);
  expect(parsed).toHaveLength(2);
  expect(parsed[0].text).toBe("Hello World");
  expect(parsed[0].start).toBe(1);
  expect(parsed[0].end).toBe(2);
  expect(parsed[1].start).toBe(3.5);
});

test("parses webvtt timestamps with period separators", () => {
  const vttContent = `WEBVTT

00:01.250 --> 00:03.500
hello vtt`;

  const parsed = parseSubtitleContent(vttContent, "sample.vtt");
  expect(parsed).toHaveLength(1);
  expect(parsed[0].start).toBe(1.25);
  expect(parsed[0].end).toBe(3.5);
  expect(parsed[0].text).toBe("hello vtt");
});

test("parses ass dialogue events into segments", () => {
  const assContent = `[Script Info]
Title: Demo

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.20,0:00:02.80,Default,,0,0,0,,{\\i1}Hello\\Nworld
Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,Second line`;

  const parsed = parseASS(assContent);
  expect(parsed).toHaveLength(2);
  expect(parsed[0]).toMatchObject({
    id: "1",
    start: 1.2,
    end: 2.8,
    text: "Hello world",
  });
  expect(parsed[1].text).toBe("Second line");
});
