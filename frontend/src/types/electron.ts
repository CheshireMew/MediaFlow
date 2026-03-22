/**
 * Electron's File object includes a `path` property that standard Web File does not.
 * Use this type to avoid `(file as any).path` casts throughout the codebase.
 */
export interface ElectronFile extends File {
  path?: string;
}

/**
 * Type guard: check if a File is an ElectronFile (has a path property).
 */
export function isElectronFile(file: File): file is ElectronFile {
  return "path" in file && typeof (file as ElectronFile).path === "string";
}
