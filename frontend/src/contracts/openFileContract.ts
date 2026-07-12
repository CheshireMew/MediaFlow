export type OpenFileDialogProfile =
  | "editor-media"
  | "transcriber-media"
  | "subtitle"
  | "executable";

export type OpenFileDialogRequest = {
  defaultPath?: string;
  profile: OpenFileDialogProfile;
};

export type OpenFileDialogResult = {
  path: string;
  name: string;
  size: number;
} | null;

export type MediaKind = "audio" | "video" | "image";

export const MEDIA_EXTENSIONS = {
  video: ["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "ts", "mts"],
  audio: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "opus"],
  image: ["jpg", "jpeg", "png", "webp", "bmp", "gif", "tiff", "tif"],
} as const satisfies Record<MediaKind, readonly string[]>;

export const SUBTITLE_EXTENSIONS = [
  "srt",
  "vtt",
  "ass",
  "ssa",
  "txt",
  "sub",
  "sbv",
  "lrc",
] as const;

type OpenFileProfileDefinition = {
  label: string;
  mediaKinds: readonly MediaKind[];
  extensions: readonly string[];
};

const OPEN_FILE_PROFILE_DEFINITIONS: Record<
  OpenFileDialogProfile,
  OpenFileProfileDefinition
> = {
  "editor-media": {
    label: "Editor Media Files",
    mediaKinds: ["audio", "video"],
    extensions: [],
  },
  "transcriber-media": {
    label: "Audio and Video Files",
    mediaKinds: ["audio", "video"],
    extensions: [],
  },
  subtitle: {
    label: "Subtitle Files",
    mediaKinds: [],
    extensions: SUBTITLE_EXTENSIONS,
  },
  executable: {
    label: "Executable Files",
    mediaKinds: [],
    extensions: ["exe"],
  },
};

function getProfileKinds(profile: OpenFileDialogProfile) {
  return OPEN_FILE_PROFILE_DEFINITIONS[profile].mediaKinds;
}

function getProfileExtensions(profile: OpenFileDialogProfile): string[] {
  const definition = OPEN_FILE_PROFILE_DEFINITIONS[profile];
  return [
    ...definition.mediaKinds.flatMap((kind) => getMediaExtensions(kind)),
    ...definition.extensions,
  ];
}

export function getMediaExtensions(kind: MediaKind): string[] {
  return [...MEDIA_EXTENSIONS[kind]];
}

export function getMediaExtensionsWithDot(kind: MediaKind): string[] {
  return getMediaExtensions(kind).map((extension) => `.${extension}`);
}

function getProfileLabel(profile: OpenFileDialogProfile) {
  return OPEN_FILE_PROFILE_DEFINITIONS[profile].label;
}

function getNormalizedExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension && fileName.includes(".") ? extension : "";
}

export function buildOpenFileDialogFilters(profile: OpenFileDialogProfile) {
  return [
    {
      name: getProfileLabel(profile),
      extensions: getProfileExtensions(profile),
    },
    {
      name: "All Files",
      extensions: ["*"],
    },
  ];
}

export function buildHtmlFileAccept(profile: OpenFileDialogProfile) {
  return getProfileExtensions(profile)
    .map((extension) => `.${extension}`)
    .join(",");
}

export function fileMatchesOpenDialogProfile(
  file: { name?: string; path?: string; type?: string | null },
  profile: OpenFileDialogProfile,
) {
  const allowedKinds = getProfileKinds(profile);
  const fileType = (file.type ?? "").toLowerCase();

  if (fileType.startsWith("audio/")) {
    return allowedKinds.includes("audio");
  }

  if (fileType.startsWith("video/")) {
    return allowedKinds.includes("video");
  }

  if (fileType.startsWith("image/")) {
    return allowedKinds.includes("image");
  }

  const fileName = file.name ?? file.path ?? "";
  const extension = getNormalizedExtension(fileName);
  if (!extension) {
    return false;
  }

  return getProfileExtensions(profile).includes(extension);
}
