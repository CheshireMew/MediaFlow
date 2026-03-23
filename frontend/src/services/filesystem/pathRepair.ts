import path from "path";

const COMMON_REPLACEMENTS: Array<[string | RegExp, string]> = [
  [/鈥檛/g, "’t"],
  [/鈥檚/g, "’s"],
  [/鈥檓/g, "’m"],
  [/鈥檇/g, "’d"],
  [/鈥檒/g, "’l"],
  [/鈥淎/g, "“A"],
  [/鈥淏/g, "“B"],
  [/鈥淐/g, "“C"],
  [/鈥淒/g, "“D"],
  [/鈥淓/g, "“E"],
  [/鈥淔/g, "“F"],
  [/鈥淕/g, "“G"],
  [/鈥淗/g, "“H"],
  [/鈥淚/g, "“I"],
  [/鈥淛/g, "“J"],
  [/鈥淜/g, "“K"],
  [/鈥淟/g, "“L"],
  [/鈥淢/g, "“M"],
  [/鈥淣/g, "“N"],
  [/鈥淥/g, "“O"],
  [/鈥淧/g, "“P"],
  [/鈥淨/g, "“Q"],
  [/鈥淩/g, "“R"],
  [/鈥淪/g, "“S"],
  [/鈥淫/g, "“T"],
  [/鈥淯/g, "“U"],
  [/鈥淰/g, "“V"],
  [/鈥淲/g, "“W"],
  [/鈥淴/g, "“X"],
  [/鈥淵/g, "“Y"],
  [/鈥淶/g, "“Z"],
  [/鈥?/g, "”"],
  [/鈥�/g, "“"],
];

function joinPathLikeInput(filePath: string, basename: string) {
  if (filePath.includes("/") && !filePath.includes("\\")) {
    return path.posix.join(path.dirname(filePath).replace(/\\/g, "/"), basename);
  }
  return path.join(path.dirname(filePath), basename);
}

export function repairMojibakeText(text: string) {
  if (!text) {
    return text;
  }

  let repaired = text;
  for (const [pattern, replacement] of COMMON_REPLACEMENTS) {
    repaired = repaired.replace(pattern, replacement);
  }
  return repaired;
}

function buildCandidateNames(filePath: string, fallbackName?: string) {
  const basename = path.basename(filePath);
  const candidates = new Set<string>();

  for (const value of [
    basename,
    fallbackName,
    repairMojibakeText(basename),
    fallbackName ? repairMojibakeText(fallbackName) : null,
  ]) {
    if (typeof value === "string" && value.trim()) {
      candidates.add(value.trim());
    }
  }

  return [...candidates];
}

export function resolvePathFromDirectoryEntries(
  filePath: string,
  directoryEntries: string[],
  fallbackName?: string,
) {
  if (!filePath) {
    return null;
  }

  const candidateNames = buildCandidateNames(filePath, fallbackName);
  const exactEntries = new Set(directoryEntries);

  for (const candidateName of candidateNames) {
    if (exactEntries.has(candidateName)) {
      return joinPathLikeInput(filePath, candidateName);
    }
  }

  const repairedCandidates = new Set(candidateNames.map((candidate) => repairMojibakeText(candidate)));
  for (const entry of directoryEntries) {
    if (repairedCandidates.has(repairMojibakeText(entry))) {
      return joinPathLikeInput(filePath, entry);
    }
  }

  return null;
}
