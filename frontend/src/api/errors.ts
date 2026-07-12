export type ApiErrorKind = "http" | "timeout" | "aborted" | "network";

type ApiErrorOptions = {
  endpoint: string;
  kind: ApiErrorKind;
  status?: number;
  cause?: unknown;
};

export class ApiError extends Error {
  readonly endpoint: string;
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(message: string, options: ApiErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.endpoint = options.endpoint;
    this.kind = options.kind;
    this.status = options.status;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
