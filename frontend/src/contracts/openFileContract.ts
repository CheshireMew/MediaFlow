export type OpenFileDialogProfile =
  | "editor-media"
  | "transcriber-media"
  | "preprocessing-media"
  | "executable";

export type OpenFileDialogRequest = {
  defaultPath?: string;
  profile: OpenFileDialogProfile;
};

export type MediaKind = "audio" | "video" | "image";

export const MEDIA_EXTENSIONS = {
  video: ["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "ts", "mts"],
  audio: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "opus"],
  image: ["jpg", "jpeg", "png", "webp", "bmp", "gif", "tiff", "tif"],
} as const satisfies Record<MediaKind, readonly string[]>;

const OPEN_FILE_PROFILE_KINDS: Record<OpenFileDialogProfile, MediaKind[]> = {
  "editor-media": ["audio", "video"],
  "transcriber-media": ["audio", "video"],
  "preprocessing-media": ["video", "image"],
  executable: [],
};

function getProfileKinds(profile: OpenFileDialogProfile) {
  return OPEN_FILE_PROFILE_KINDS[profile];
}

function getProfileExtensions(profile: OpenFileDialogProfile): string[] {
  return getProfileKinds(profile).flatMap((kind) => getMediaExtensions(kind));
}

export function getMediaExtensions(kind: MediaKind): string[] {
  return [...MEDIA_EXTENSIONS[kind]];
}

export function getMediaExtensionsWithDot(kind: MediaKind): string[] {
  return getMediaExtensions(kind).map((extension) => `.${extension}`);
}

function getProfileLabel(profile: OpenFileDialogProfile) {
  switch (profile) {
    case "editor-media":
      return "Editor Media Files";
    case "transcriber-media":
      return "Audio and Video Files";
    case "preprocessing-media":
      return "Video and Image Files";
    case "executable":
      return "Executable Files";
  }
}

function getNormalizedExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension && fileName.includes(".") ? extension : "";
}

export function buildOpenFileDialogFilters(profile: OpenFileDialogProfile) {
  if (profile === "executable") {
    return [
      {
        name: "Executable Files",
        extensions: ["exe"],
      },
      {
        name: "All Files",
        extensions: ["*"],
      },
    ];
  }

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
