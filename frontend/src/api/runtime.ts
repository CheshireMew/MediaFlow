import { API_BASE_URL, WS_TASKS_URL } from "../config/api";

let apiBaseUrl = API_BASE_URL.replace(/\/$/, "");
let wsBaseUrl = WS_TASKS_URL.replace(/\/ws\/tasks$/, "").replace(/\/$/, "");

export function configureApiRuntime(args: {
  apiBaseUrl: string;
  wsBaseUrl: string;
}) {
  apiBaseUrl = args.apiBaseUrl.replace(/\/$/, "");
  wsBaseUrl = args.wsBaseUrl.replace(/\/$/, "");
}

export function getApiBase() {
  return apiBaseUrl;
}

export function getApiUrl(endpoint: string) {
  return endpoint.startsWith("http") ? endpoint : `${apiBaseUrl}${endpoint}`;
}

export function getWsUrl() {
  return `${wsBaseUrl}/ws/tasks`;
}
