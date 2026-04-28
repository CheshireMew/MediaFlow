const DESKTOP_WORKER_PREFIX = "__MEDIAFLOW_WORKER__";

export type DesktopWorkerProtocolResponse = {
  id: string;
  ok?: boolean;
  result?: unknown;
  error?: string;
};

type DesktopWorkerProtocolMessage = {
  type: string;
  id?: string;
  ok?: boolean;
  result?: unknown;
  error?: string;
  event?: string;
  payload?: unknown;
};

type DesktopWorkerProtocolHandlers = {
  onLog: (line: string) => void;
  onReady: () => void;
  onEvent: (event: string, payload: unknown) => void;
  onTaskEvent: (taskId: string, payload: unknown) => void;
  onResponse: (response: DesktopWorkerProtocolResponse) => void;
  onParseError: (line: string, error: unknown) => void;
};

export function handleDesktopWorkerProtocolLine(
  line: string,
  handlers: DesktopWorkerProtocolHandlers,
) {
  if (!line.startsWith(DESKTOP_WORKER_PREFIX)) {
    handlers.onLog(line);
    return;
  }

  try {
    const message = JSON.parse(line.slice(DESKTOP_WORKER_PREFIX.length)) as DesktopWorkerProtocolMessage;

    if (message.type === "ready") {
      handlers.onReady();
      return;
    }

    if (message.type === "event") {
      if (message.event) {
        handlers.onEvent(message.event, message.payload);
      }
      if (message.id) {
        handlers.onTaskEvent(message.id, message.payload);
      }
      return;
    }

    if (message.type === "response" && message.id) {
      handlers.onResponse({
        id: message.id,
        ok: message.ok,
        result: message.result,
        error: message.error,
      });
    }
  } catch (error) {
    handlers.onParseError(line, error);
  }
}
