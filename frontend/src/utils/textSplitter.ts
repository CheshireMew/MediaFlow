/**
 * Shared subtitle text splitting.
 *
 * The decision flow is intentionally explicit:
 * protected spans -> candidate breakpoints -> reason priority -> balance score.
 */
import { clamp } from "./number";

type SplitReason = "dialog" | "sentence" | "pause" | "space" | "midpoint";
type TextProfile = "latin" | "cjk" | "mixed";

export type SplitHeuristicOptions = {
  requirePunctuation?: boolean;
  relaxRepeatedBoundaryUnits?: boolean;
};

interface SplitCandidate {
  index: number;
  reason: SplitReason;
  priority: number;
  score: number;
}

interface ProtectedSpan {
  start: number;
  end: number;
  strictEdges: boolean;
}

interface WeightedToken {
  start: number;
  end: number;
  text: string;
  weight: number;
}

const ABBREVIATIONS = [
  "Mr.",
  "Mrs.",
  "Dr.",
  "Ms.",
  "Prof.",
  "Sr.",
  "Jr.",
  "St.",
  "No.",
  "Vol.",
  "Fig.",
  "vs.",
];

const EAST_ASIAN_CHAR_CLASS =
  "\\u3040-\\u309F\\u30A0-\\u30FF\\u3130-\\u318F\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uAC00-\\uD7AF";
const LATIN_WORD_CHAR_CLASS = "A-Za-z0-9\\uFF10-\\uFF19\\uFF21-\\uFF3A\\uFF41-\\uFF5A";
const NUMERIC_CHAR_CLASS = "0-9\\uFF10-\\uFF19";
const REGEX_EAST_ASIAN = new RegExp(`[${EAST_ASIAN_CHAR_CLASS}]`, "g");
const REGEX_LATIN_WORD = new RegExp(
  `[${LATIN_WORD_CHAR_CLASS}]+(?:['’-][${LATIN_WORD_CHAR_CLASS}]+)*`,
  "g",
);
const REGEX_LATIN_WORD_TOKEN = new RegExp(
  `^[${LATIN_WORD_CHAR_CLASS}]+(?:['’-][${LATIN_WORD_CHAR_CLASS}]+)*$`,
);
const REGEX_NUMERIC_CHAR = new RegExp(`[${NUMERIC_CHAR_CLASS}]`);
const REGEX_TOKEN = new RegExp(
  `[${LATIN_WORD_CHAR_CLASS}]+(?:['’-][${LATIN_WORD_CHAR_CLASS}]+)*|[${EAST_ASIAN_CHAR_CLASS}]+|\\s+|.`,
  "g",
);
const REGEX_NUMERIC_EXPRESSION =
  /(?:[$￥€£]\s*)?[0-9０-９]+(?:[.,，．][0-9０-９]+)*(?:\s*(?:%|％|美元|美金|人民币|元|块|年期|年|月|日|万|亿|USD|usd|dollars?|K|M|B|k|m|b))?/g;

const SENTENCE_ENDINGS = new Set([".", "?", "!", "。", "？", "！"]);
const PAUSE_MARKS = new Set([",", ";", ":", "，", "；", "：", "、"]);
const LEADING_BREAK_PUNCTUATION = new Set([
  ...SENTENCE_ENDINGS,
  ...PAUSE_MARKS,
]);
const NAME_JOINERS = new Set(["·", "・", "･"]);
const LOW_PRIORITY_PAUSE_MARKS = new Set(["、"]);
const LOW_PRIORITY_CJK_BOUNDARIES = new Set(["的"]);

const BAD_START_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "because",
  "but",
  "by",
  "for",
  "from",
  "if",
  "in",
  "into",
  "of",
  "on",
  "or",
  "so",
  "than",
  "that",
  "the",
  "to",
  "with",
]);

const BAD_END_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "because",
  "but",
  "for",
  "from",
  "if",
  "in",
  "into",
  "of",
  "on",
  "or",
  "so",
  "than",
  "that",
  "the",
  "to",
  "with",
]);

const BAD_START_CJK = new Set(["的", "了", "呢", "吗", "は", "が", "を", "に", "で", "と", "か"]);
const BAD_END_CJK = new Set(["的", "了", "和", "与", "及", "は", "が", "を", "に", "で", "と"]);

const STRICT_MIN_UNITS: Record<TextProfile, number> = {
  latin: 2,
  cjk: 4,
  mixed: 3,
};

const SOFT_MIN_UNITS: Record<TextProfile, number> = {
  latin: 4,
  cjk: 8,
  mixed: 6,
};

const RELAXED_SOFT_MIN_UNITS: Record<TextProfile, number> = {
  latin: 4,
  cjk: 6,
  mixed: 5,
};

const REASON_PRIORITY: Record<SplitReason, number> = {
  dialog: 1,
  sentence: 1,
  pause: 2,
  space: 3,
  midpoint: 4,
};

function detectTextProfile(text: string): TextProfile {
  const cjkCount = (text.match(REGEX_EAST_ASIAN) || []).join("").length;
  const latinCount = (text.match(REGEX_LATIN_WORD) || []).join("").length;

  if (cjkCount === 0 && latinCount > 0) {
    return "latin";
  }
  if (cjkCount > 0 && latinCount === 0) {
    return "cjk";
  }
  if (cjkCount > latinCount * 1.5) {
    return "cjk";
  }
  if (latinCount > cjkCount * 1.5) {
    return "latin";
  }
  return "mixed";
}

function hasLatinWords(text: string): boolean {
  return Array.from(text.matchAll(REGEX_LATIN_WORD)).length > 0;
}

function getLastWord(text: string): string {
  const match = text.trim().match(/([A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*)\W*$/);
  return match ? match[1].toLowerCase() : "";
}

function getFirstWord(text: string): string {
  const match = text.trim().match(/^([A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*)/);
  return match ? match[1].toLowerCase() : "";
}

function getLastRawLatinWord(text: string): string {
  const match = text.trim().match(/([A-Za-z]+(?:['’-][A-Za-z]+)*)\W*$/);
  return match ? match[1] : "";
}

function getFirstRawLatinWord(text: string): string {
  const match = text.trim().match(/^([A-Za-z]+(?:['’-][A-Za-z]+)*)/);
  return match ? match[1] : "";
}

function getLastCjkChar(text: string): string {
  const match = text.trim().match(
    new RegExp(`([${EAST_ASIAN_CHAR_CLASS}])\\W*$`),
  );
  return match ? match[1] : "";
}

function getFirstCjkChar(text: string): string {
  const match = text.trim().match(new RegExp(`^([${EAST_ASIAN_CHAR_CLASS}])`));
  return match ? match[1] : "";
}

function countMeaningfulUnits(text: string, profile: TextProfile): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  const cjkUnits = (trimmed.match(REGEX_EAST_ASIAN) || []).join("").length;
  const latinUnits = Array.from(trimmed.matchAll(REGEX_LATIN_WORD)).length;

  if (profile === "latin" && cjkUnits === 0) {
    return latinUnits;
  }

  return cjkUnits + latinUnits;
}

function countStrongBoundaries(text: string): number {
  return Array.from(text).filter(
    (char) => SENTENCE_ENDINGS.has(char) || PAUSE_MARKS.has(char),
  ).length;
}

function getSoftMinUnits(
  text: string,
  profile: TextProfile,
  options: SplitHeuristicOptions,
): number {
  const baseMinimum = SOFT_MIN_UNITS[profile];
  if (!options.relaxRepeatedBoundaryUnits) {
    return baseMinimum;
  }

  const clauseCount = countStrongBoundaries(text) + 1;
  if (clauseCount < 3) {
    return baseMinimum;
  }

  const repeatedClauseMinimum = Math.floor(
    countMeaningfulUnits(text, profile) / clauseCount,
  );

  return Math.min(
    baseMinimum,
    Math.max(RELAXED_SOFT_MIN_UNITS[profile], repeatedClauseMinimum),
  );
}

function getProtectedSpans(text: string): ProtectedSpan[] {
  const spans: ProtectedSpan[] = [];

  for (const match of text.matchAll(REGEX_NUMERIC_EXPRESSION)) {
    const start = match.index ?? 0;
    const value = match[0];
    if (value) {
      spans.push({ start, end: start + value.length, strictEdges: true });
    }
  }

  for (const match of text.matchAll(REGEX_LATIN_WORD)) {
    const start = match.index ?? 0;
    const value = match[0];
    if (value.length > 1) {
      spans.push({ start, end: start + value.length, strictEdges: false });
    }
  }

  return spans.sort((a, b) => a.start - b.start);
}

function isInsideProtectedSpan(index: number, spans: ProtectedSpan[]): boolean {
  return spans.some((span) => index > span.start && index < span.end);
}

function touchesProtectedSpanEdge(index: number, spans: ProtectedSpan[]): boolean {
  return spans.some(
    (span) => span.strictEdges && (index === span.start || index === span.end),
  );
}

function endsWithLatinInitialism(text: string): boolean {
  return /(?:^|[\s([{"'“‘])(?:[A-Za-z]\.)+$/.test(text);
}

function touchesLatinInitialismBoundary(text: string, splitIndex: number): boolean {
  const prev = text[splitIndex - 1] ?? "";
  const next = text[splitIndex] ?? "";
  const before = text.slice(0, splitIndex);

  if (prev === "." && endsWithLatinInitialism(before)) {
    return true;
  }

  if (/\s/.test(prev) && endsWithLatinInitialism(before.trimEnd())) {
    return Boolean(
      next && new RegExp(`[A-Za-z${EAST_ASIAN_CHAR_CLASS}]`).test(next),
    );
  }

  return false;
}

function isLikelyLatinNamePart(word: string): boolean {
  return /^[A-Z][a-z]+(?:['’-][A-Z]?[a-z]+)*$/.test(word);
}

function touchesLatinProperNameBoundary(text: string, splitIndex: number): boolean {
  const prev = text[splitIndex - 1] ?? "";
  if (!/\s/.test(prev)) {
    return false;
  }

  const before = text.slice(0, splitIndex);
  const after = text.slice(splitIndex);
  return (
    isLikelyLatinNamePart(getLastRawLatinWord(before)) &&
    isLikelyLatinNamePart(getFirstRawLatinWord(after))
  );
}

function touchesNumericWhitespaceBoundary(text: string, splitIndex: number): boolean {
  const prev = text[splitIndex - 1] ?? "";
  const next = text[splitIndex] ?? "";
  if (REGEX_NUMERIC_CHAR.test(prev) && /\s/.test(next)) {
    return true;
  }

  let index = splitIndex - 1;
  if (!/\s/.test(prev)) {
    return false;
  }

  while (index >= 0 && /\s/.test(text[index])) {
    index -= 1;
  }

  return index >= 0 && REGEX_NUMERIC_CHAR.test(text[index]);
}

function canBreakAt(
  text: string,
  splitIndex: number,
  spans = getProtectedSpans(text),
): boolean {
  if (splitIndex <= 0 || splitIndex >= text.length) {
    return false;
  }

  const prev = text[splitIndex - 1];
  const next = text[splitIndex];
  const charBeforeBoundary = text[splitIndex - 2];

  if (isInsideProtectedSpan(splitIndex, spans)) {
    return false;
  }

  if (touchesProtectedSpanEdge(splitIndex, spans)) {
    return false;
  }

  if (touchesNumericWhitespaceBoundary(text, splitIndex)) {
    return false;
  }

  if (LEADING_BREAK_PUNCTUATION.has(next)) {
    return false;
  }

  if (NAME_JOINERS.has(prev) || NAME_JOINERS.has(next)) {
    return false;
  }

  if (touchesLatinInitialismBoundary(text, splitIndex)) {
    return false;
  }

  if (touchesLatinProperNameBoundary(text, splitIndex)) {
    return false;
  }

  if (
    (prev === "." || prev === ",") &&
    charBeforeBoundary &&
    REGEX_NUMERIC_CHAR.test(charBeforeBoundary) &&
    next &&
    REGEX_NUMERIC_CHAR.test(next)
  ) {
    return false;
  }

  const textUpToSplit = text.slice(0, splitIndex);
  const lastWord = textUpToSplit.trim().split(/\s+/).pop();
  if (lastWord && ABBREVIATIONS.some((abbr) => lastWord.endsWith(abbr))) {
    return false;
  }

  if ("([".includes(prev)) {
    return false;
  }
  if (next && ")]}".includes(next)) {
    return false;
  }

  return true;
}

function getReasonPriority(reason: SplitReason): number {
  return REASON_PRIORITY[reason];
}

function getCandidateScore(
  text: string,
  splitIndex: number,
  reason: SplitReason,
  profile: TextProfile,
  options: SplitHeuristicOptions,
): number {
  const before = text.slice(0, splitIndex).trim();
  const after = text.slice(splitIndex).trim();
  if (!before || !after) {
    return Number.POSITIVE_INFINITY;
  }

  const beforeUnits = countMeaningfulUnits(before, profile);
  const afterUnits = countMeaningfulUnits(after, profile);
  const strictMinUnits = STRICT_MIN_UNITS[profile];
  if (beforeUnits < strictMinUnits || afterUnits < strictMinUnits) {
    return Number.POSITIVE_INFINITY;
  }

  let score = Math.abs(splitIndex / text.length - 0.5) * 100;
  const softMinUnits = getSoftMinUnits(text, profile, options);
  if (beforeUnits < softMinUnits) {
    score += (softMinUnits - beforeUnits) * 7;
  }
  if (afterUnits < softMinUnits) {
    score += (softMinUnits - afterUnits) * 7;
  }

  const beforeWords = before.split(/\s+/).filter(Boolean).length;
  const afterWords = after.split(/\s+/).filter(Boolean).length;
  if (profile !== "cjk" && (beforeWords < 2 || afterWords < 2)) {
    score += 22;
  }

  const prevWord = getLastWord(before);
  const nextWord = getFirstWord(after);
  if (prevWord && BAD_END_WORDS.has(prevWord)) {
    score += 18;
  }
  if (nextWord && BAD_START_WORDS.has(nextWord)) {
    score += 24;
  }

  const prevCjk = getLastCjkChar(before);
  const nextCjk = getFirstCjkChar(after);
  if (prevCjk && BAD_END_CJK.has(prevCjk)) {
    score += 10;
  }
  if (nextCjk && BAD_START_CJK.has(nextCjk)) {
    score += 12;
  }

  if (reason === "pause" && LOW_PRIORITY_PAUSE_MARKS.has(text[splitIndex - 1] ?? "")) {
    score += 18;
  }
  if (prevCjk && LOW_PRIORITY_CJK_BOUNDARIES.has(prevCjk)) {
    score += 12;
  }
  if (nextCjk && LOW_PRIORITY_CJK_BOUNDARIES.has(nextCjk)) {
    score += 12;
  }

  return score;
}

function addCandidate(
  candidates: SplitCandidate[],
  text: string,
  splitIndex: number,
  reason: SplitReason,
  profile: TextProfile,
  options: SplitHeuristicOptions,
  spans: ProtectedSpan[],
): void {
  if (!canBreakAt(text, splitIndex, spans)) {
    return;
  }

  if (options.requirePunctuation && reason !== "dialog" && reason !== "sentence" && reason !== "pause") {
    return;
  }

  const score = getCandidateScore(text, splitIndex, reason, profile, options);
  if (!Number.isFinite(score)) {
    return;
  }

  candidates.push({
    index: splitIndex,
    reason,
    priority: getReasonPriority(reason),
    score,
  });
}

function getBestCandidate(candidates: SplitCandidate[]): SplitCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.score - b.score;
  })[0];
}

function getTokenWeight(token: string, profile: TextProfile): number {
  if (!token) {
    return 0;
  }

  if (/^\s+$/.test(token)) {
    return 0.15;
  }

  if (REGEX_LATIN_WORD_TOKEN.test(token)) {
    return 1 + Math.min(token.length, 12) * 0.08;
  }

  if (new RegExp(`^[${EAST_ASIAN_CHAR_CLASS}]+$`).test(token)) {
    return token.length;
  }

  if (/^[,.;:!?，。！？；：、'"“”‘’()[\]-]+$/.test(token)) {
    return profile === "cjk" ? 0.12 : 0.18;
  }

  return Math.max(0.35, token.length * 0.35);
}

function getWeightedTokens(text: string, profile: TextProfile): WeightedToken[] {
  return Array.from(text.matchAll(REGEX_TOKEN)).map((match) => {
    const tokenText = match[0];
    const start = match.index ?? 0;
    return {
      start,
      end: start + tokenText.length,
      text: tokenText,
      weight: getTokenWeight(tokenText, profile),
    };
  });
}

function shouldUseWhitespaceBoundary(text: string, profile: TextProfile): boolean {
  return profile !== "cjk" || hasLatinWords(text);
}

function collectCandidates(
  text: string,
  options: SplitHeuristicOptions,
): SplitCandidate[] {
  const profile = detectTextProfile(text);
  const spans = getProtectedSpans(text);
  const candidates: SplitCandidate[] = [];

  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] === "-" && (text[i - 1] === " " || text[i - 1] === "\n")) {
      addCandidate(candidates, text, i, "dialog", profile, options, spans);
    }
  }

  for (let i = 0; i < text.length - 1; i++) {
    const char = text[i];
    if (SENTENCE_ENDINGS.has(char)) {
      addCandidate(candidates, text, i + 1, "sentence", profile, options, spans);
      continue;
    }
    if (PAUSE_MARKS.has(char)) {
      addCandidate(candidates, text, i + 1, "pause", profile, options, spans);
      continue;
    }
    if (
      char === " " &&
      !options.requirePunctuation &&
      shouldUseWhitespaceBoundary(text, profile)
    ) {
      addCandidate(candidates, text, i + 1, "space", profile, options, spans);
    }
  }

  return candidates;
}

function getMidpointCandidate(text: string): SplitCandidate | null {
  const profile = detectTextProfile(text);
  const spans = getProtectedSpans(text);
  const tokens = getWeightedTokens(text, profile);
  const midpoint = text.length / 2;
  const candidates: SplitCandidate[] = [];

  for (const token of tokens) {
    addCandidate(
      candidates,
      text,
      token.end,
      "midpoint",
      profile,
      {},
      spans,
    );
  }

  return [...candidates].sort((a, b) => {
    const distanceA = Math.abs(a.index - midpoint);
    const distanceB = Math.abs(b.index - midpoint);
    if (distanceA !== distanceB) {
      return distanceA - distanceB;
    }
    return a.score - b.score;
  })[0] ?? null;
}

export function getNearestSafeSplitIndex(text: string, preferredIndex: number): number {
  if (!text || text.length < 2) {
    return -1;
  }

  const profile = detectTextProfile(text);
  const spans = getProtectedSpans(text);
  const target = clamp(Math.round(preferredIndex), 1, text.length - 1);
  const candidates: SplitCandidate[] = [];

  for (let index = 1; index < text.length; index += 1) {
    addCandidate(candidates, text, index, "midpoint", profile, {}, spans);
  }

  return [...candidates].sort((a, b) => {
    const distanceA = Math.abs(a.index - target);
    const distanceB = Math.abs(b.index - target);
    if (distanceA !== distanceB) {
      return distanceA - distanceB;
    }
    return a.score - b.score;
  })[0]?.index ?? -1;
}

export function getSplitTimingRatio(text: string, splitIndex: number): number {
  if (!text) {
    return 0.5;
  }

  const profile = detectTextProfile(text);
  const tokens = getWeightedTokens(text, profile);
  const totalWeight = tokens.reduce((sum, token) => sum + token.weight, 0);

  if (totalWeight <= 0) {
    return clamp(splitIndex / text.length, 0.1, 0.9);
  }

  let prefixWeight = 0;
  for (const token of tokens) {
    if (token.end <= splitIndex) {
      prefixWeight += token.weight;
      continue;
    }
    if (token.start >= splitIndex) {
      continue;
    }

    const overlap = splitIndex - token.start;
    prefixWeight += token.weight * (overlap / Math.max(1, token.text.length));
  }

  return clamp(prefixWeight / totalWeight, 0.1, 0.9);
}

/**
 * Finds the best character index to split the text.
 * The split should happen at the returned index, i.e. the second part starts
 * at text[index].
 */
export function getBestSplitIndex(
  text: string,
  options: SplitHeuristicOptions = {},
): number {
  if (!text || text.length < 2) {
    return -1;
  }

  const candidate = getBestCandidate(collectCandidates(text, options));
  if (candidate) {
    return candidate.index;
  }

  if (options.requirePunctuation) {
    return -1;
  }

  return getMidpointCandidate(text)?.index ?? -1;
}
