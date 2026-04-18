/**
 * Shared subtitle splitting heuristics.
 * The splitter scores multiple candidate breakpoints instead of using a fixed
 * punctuation priority, and exposes a token-weighted timing ratio for better
 * subtitle time allocation.
 */

type SplitReason = "dialog" | "sentence" | "pause" | "space" | "midpoint";
type TextProfile = "latin" | "cjk" | "mixed";

export type SplitHeuristicOptions = {
  requirePunctuation?: boolean;
  relaxRepeatedBoundaryUnits?: boolean;
};

interface SplitCandidate {
  index: number;
  reason: SplitReason;
  score: number;
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

const REGEX_CJK =
  /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FFF\u3400-\u4DBF]/g;
const REGEX_LATIN_WORD = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;
const REGEX_TOKEN =
  /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*|[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FFF\u3400-\u4DBF]+|\s+|./g;

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
const LOW_PRIORITY_PAUSE_MARKS = new Set(["、"]);
const LOW_PRIORITY_CJK_BOUNDARIES = new Set(["的"]);

const MIN_PUNCTUATION_UNITS: Record<TextProfile, number> = {
  latin: 4,
  cjk: 8,
  mixed: 6,
};

const RELAXED_REPEATED_BOUNDARY_UNITS: Record<TextProfile, number> = {
  latin: 4,
  cjk: 6,
  mixed: 5,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function detectTextProfile(text: string): TextProfile {
  const cjkCount = (text.match(REGEX_CJK) || []).join("").length;
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

function getLastCjkChar(text: string): string {
  const match = text.trim().match(/([\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF])\W*$/);
  return match ? match[1] : "";
}

function getFirstCjkChar(text: string): string {
  const match = text.trim().match(/^([\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF])/);
  return match ? match[1] : "";
}

function canBreakAt(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) {
    return false;
  }

  const prev = text[index - 1];
  const curr = text[index];
  const next = text[index + 1];

  if ((curr === "." || curr === ",") && /\d/.test(prev) && next && /\d/.test(next)) {
    return false;
  }

  const textUpToSplit = text.slice(0, index + 1);
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

function getBaseReasonScore(reason: SplitReason, profile: TextProfile): number {
  const profileScores: Record<TextProfile, Record<SplitReason, number>> = {
    latin: {
      dialog: -42,
      pause: -24,
      sentence: -14,
      space: 6,
      midpoint: 18,
    },
    cjk: {
      dialog: -34,
      pause: -28,
      sentence: -18,
      space: 10,
      midpoint: 14,
    },
    mixed: {
      dialog: -38,
      pause: -24,
      sentence: -15,
      space: 8,
      midpoint: 16,
    },
  };

  return profileScores[profile][reason];
}

function getCandidatePenalty(
  text: string,
  splitIndex: number,
  reason: SplitReason,
  profile: TextProfile,
): number {
  const before = text.slice(0, splitIndex).trim();
  const after = text.slice(splitIndex).trim();
  if (!before || !after) {
    return 100;
  }

  const ratio = splitIndex / text.length;
  let penalty = Math.abs(ratio - 0.5) * 90;

  if (ratio < 0.2 || ratio > 0.8) {
    penalty += 18;
  }

  const beforeWords = before.split(/\s+/).filter(Boolean).length;
  const afterWords = after.split(/\s+/).filter(Boolean).length;
  if (profile !== "cjk" && (beforeWords < 2 || afterWords < 2)) {
    penalty += 22;
  }

  if (profile !== "latin") {
    if (before.length < 4 || after.length < 4) {
      penalty += 18;
    }
  }

  const prevWord = getLastWord(before);
  const nextWord = getFirstWord(after);
  if (prevWord && BAD_END_WORDS.has(prevWord)) {
    penalty += 18;
  }
  if (nextWord && BAD_START_WORDS.has(nextWord)) {
    penalty += 24;
  }

  const prevCjk = getLastCjkChar(before);
  const nextCjk = getFirstCjkChar(after);
  if (prevCjk && BAD_END_CJK.has(prevCjk)) {
    penalty += 10;
  }
  if (nextCjk && BAD_START_CJK.has(nextCjk)) {
    penalty += 12;
  }

  if (reason === "sentence") {
    penalty += 8;
    if (after.length < before.length * 0.4) {
      penalty += 14;
    }
  }

  if (reason === "space") {
    penalty += 6;
  }

  const prevChar = text[splitIndex - 1] ?? "";
  if (reason === "pause" && LOW_PRIORITY_PAUSE_MARKS.has(prevChar)) {
    penalty += 18;
  }
  if (prevCjk && LOW_PRIORITY_CJK_BOUNDARIES.has(prevCjk)) {
    penalty += 12;
  }
  if (nextCjk && LOW_PRIORITY_CJK_BOUNDARIES.has(nextCjk)) {
    penalty += 12;
  }

  return penalty;
}

function countMeaningfulUnits(text: string, profile: TextProfile): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  const cjkUnits = (trimmed.match(REGEX_CJK) || []).join("").length;
  const latinUnits = Array.from(trimmed.matchAll(REGEX_LATIN_WORD)).length;

  if (profile === "latin") {
    return latinUnits;
  }
  if (profile === "cjk") {
    return cjkUnits + latinUnits;
  }
  return cjkUnits + latinUnits;
}

function countStrongBoundaries(text: string): number {
  return Array.from(text).filter((char) =>
    [".", "?", "!", "。", "？", "！", ",", ";", ":", "，", "；", "："].includes(char),
  ).length;
}

function getMinimumBoundaryUnits(
  text: string,
  profile: TextProfile,
  options: SplitHeuristicOptions,
): number {
  const baseMinimum = MIN_PUNCTUATION_UNITS[profile];
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
    Math.max(RELAXED_REPEATED_BOUNDARY_UNITS[profile], repeatedClauseMinimum),
  );
}

function hasEnoughPunctuationContext(
  text: string,
  splitIndex: number,
  reason: SplitReason,
  profile: TextProfile,
  options: SplitHeuristicOptions,
): boolean {
  if (!options.requirePunctuation) {
    return true;
  }

  if (reason !== "dialog" && reason !== "sentence" && reason !== "pause") {
    return false;
  }

  const before = text.slice(0, splitIndex);
  const after = text.slice(splitIndex);
  const minUnits = getMinimumBoundaryUnits(text, profile, options);

  return (
    countMeaningfulUnits(before, profile) >= minUnits &&
    countMeaningfulUnits(after, profile) >= minUnits
  );
}

function addCandidate(
  candidates: SplitCandidate[],
  text: string,
  splitIndex: number,
  reason: SplitReason,
  profile: TextProfile,
  options: SplitHeuristicOptions,
): void {
  if (splitIndex <= 0 || splitIndex >= text.length) {
    return;
  }

  if (!hasEnoughPunctuationContext(text, splitIndex, reason, profile, options)) {
    return;
  }

  const score =
    getBaseReasonScore(reason, profile) +
    getCandidatePenalty(text, splitIndex, reason, profile);

  candidates.push({ index: splitIndex, reason, score });
}

function getTokenWeight(token: string, profile: TextProfile): number {
  if (!token) {
    return 0;
  }

  if (/^\s+$/.test(token)) {
    return 0.15;
  }

  if (/^[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*$/.test(token)) {
    return 1 + Math.min(token.length, 12) * 0.08;
  }

  if (/^[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF]+$/.test(token)) {
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

function getMidpointBoundaryIndex(text: string, profile: TextProfile): number {
  const tokens = getWeightedTokens(text, profile);
  const midpoint = text.length / 2;

  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (const token of tokens) {
    if (token.end <= 0 || token.end >= text.length) {
      continue;
    }

    const distance = Math.abs(token.end - midpoint);
    const penalty = getCandidatePenalty(text, token.end, "midpoint", profile);

    if (
      distance < bestDistance ||
      (distance === bestDistance && penalty < bestPenalty)
    ) {
      bestIndex = token.end;
      bestDistance = distance;
      bestPenalty = penalty;
    }
  }

  return bestIndex > 0 ? bestIndex : Math.floor(text.length / 2);
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

  const len = text.length;
  const profile = detectTextProfile(text);
  const candidates: SplitCandidate[] = [];

  for (let i = 1; i < len - 1; i++) {
    if (text[i] === "-" && (text[i - 1] === " " || text[i - 1] === "\n")) {
      addCandidate(candidates, text, i, "dialog", profile, options);
    }
  }

  const sentenceEndings = [".", "?", "!", "。", "？", "！"];
  const pauseMarks = [",", ";", ":", "，", "；", "：", "、"];

  for (let i = 0; i < len - 1; i++) {
    const char = text[i];
    if (!canBreakAt(text, i)) {
      continue;
    }

    if (sentenceEndings.includes(char)) {
      addCandidate(candidates, text, i + 1, "sentence", profile, options);
    } else if (pauseMarks.includes(char)) {
      addCandidate(candidates, text, i + 1, "pause", profile, options);
    } else if (
      char === " " &&
      !options.requirePunctuation &&
      shouldUseWhitespaceBoundary(text, profile)
    ) {
      addCandidate(candidates, text, i + 1, "space", profile, options);
    }
  }

  if (candidates.length === 0) {
    if (options.requirePunctuation) {
      return -1;
    }
    return getMidpointBoundaryIndex(text, profile);
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0].index;
}
