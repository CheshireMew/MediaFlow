import path from "path";

function requireLocalPath(filePath: string, operation: string) {
  if (!filePath || typeof filePath !== "string") {
    throw new Error(`${operation} requires a file path`);
  }
  return path.resolve(filePath);
}

class DesktopFileAccessRegistry {
  rememberRendererSelectedFile(filePath: string) {
    requireLocalPath(filePath, "Selected file registration");
  }

  grantRendererReadFile(filePath: string) {
    requireLocalPath(filePath, "Renderer read grant");
  }

  grantRendererWriteFile(filePath: string) {
    requireLocalPath(filePath, "Renderer write grant");
  }

  grantRendererReadDirectory(directoryPath: string) {
    requireLocalPath(directoryPath, "Renderer read directory grant");
  }

  grantRendererWriteDirectory(directoryPath: string) {
    requireLocalPath(directoryPath, "Renderer write directory grant");
  }

  assertRendererReadAccess(filePath: string, operation: string) {
    requireLocalPath(filePath, operation);
  }

  assertRendererWriteAccess(filePath: string, operation: string) {
    requireLocalPath(filePath, operation);
  }

}

export const desktopFileAccess = new DesktopFileAccessRegistry();
