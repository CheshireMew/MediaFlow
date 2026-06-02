const GENERATED_OUTPUT_MAX_PATH_LENGTH = 240;
const GENERATED_OUTPUT_MAX_FILENAME_LENGTH = 240;

function stableFilenameHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function splitPathForOutput(path: string) {
  const lastSepIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (lastSepIndex < 0) {
    return { directoryPrefix: "", fileName: path };
  }
  return {
    directoryPrefix: path.slice(0, lastSepIndex + 1),
    fileName: path.slice(lastSepIndex + 1),
  };
}

export function buildSuffixedOutputPath(
  sourcePath: string,
  suffix: string,
  extension: string,
): string {
  const normalizedExtension = extension.startsWith(".") ? extension : `.${extension}`;
  let stemPath = sourcePath;
  const lastDotIndex = stemPath.lastIndexOf(".");
  const lastSepIndex = Math.max(
    stemPath.lastIndexOf("/"),
    stemPath.lastIndexOf("\\"),
  );

  if (lastDotIndex > lastSepIndex) {
    stemPath = stemPath.substring(0, lastDotIndex);
  }

  const candidatePath = `${stemPath}${suffix}${normalizedExtension}`;
  const { directoryPrefix, fileName: stemName } = splitPathForOutput(stemPath);
  const candidateFilename = `${stemName}${suffix}${normalizedExtension}`;
  if (
    candidatePath.length <= GENERATED_OUTPUT_MAX_PATH_LENGTH
    && candidateFilename.length <= GENERATED_OUTPUT_MAX_FILENAME_LENGTH
  ) {
    return candidatePath;
  }

  const digest = stableFilenameHash(candidateFilename).slice(0, 8);
  const marker = `-${digest}${suffix}${normalizedExtension}`;
  const filenameBudget = Math.min(
    GENERATED_OUTPUT_MAX_FILENAME_LENGTH,
    GENERATED_OUTPUT_MAX_PATH_LENGTH - directoryPrefix.length,
  );

  if (filenameBudget <= marker.length + 1) {
    return `${directoryPrefix}out-${digest}${suffix}${normalizedExtension}`;
  }

  const prefixBudget = filenameBudget - marker.length;
  const prefix = stemName.slice(0, prefixBudget).replace(/[ ._-]+$/u, "") || "output";
  return `${directoryPrefix}${prefix}${marker}`;
}
