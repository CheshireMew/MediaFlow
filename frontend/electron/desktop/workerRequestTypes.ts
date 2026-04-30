export type DesktopWorkerRequest = {
  command: string;
  payload: Record<string, unknown>;
};

export type DesktopWorkerRuntimeRequest = DesktopWorkerRequest & {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};
