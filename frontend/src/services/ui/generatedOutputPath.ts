import outputPathContract from "../../../../contracts/generated-output-path-contract.json";

const GENERATED_OUTPUT_MAX_PATH_LENGTH = outputPathContract.max_path_length;
const GENERATED_OUTPUT_MAX_FILENAME_LENGTH = outputPathContract.max_filename_length;

function rotateLeft(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function sha1Hex(value: string): string {
  const source = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(source);
  padded[source.length] = 0x80;

  const view = new DataView(padded.buffer);
  const bitLength = source.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 80; index += 1) {
      words[index] = rotateLeft(
        words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16],
        1,
      );
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let index = 0; index < 80; index += 1) {
      let f: number;
      let k: number;
      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const next = (rotateLeft(a, 5) + f + e + k + words[index]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = next;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4]
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("");
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

  const digest = sha1Hex(candidateFilename).slice(0, outputPathContract.hash_hex_length);
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
