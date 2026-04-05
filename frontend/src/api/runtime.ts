import { API_BASE_URL, WS_TASKS_URL } from "../config/api";

let apiBase = API_BASE_URL;
let wsTasksUrl = WS_TASKS_URL;

function deriveWsTasksUrl(baseUrl: string) {
  return `${baseUrl.replace(/^http/, "ws")}/ws/tasks`;
}

function normalizeWsTasksUrl(url: string) {
  return url.endsWith("/ws/tasks") ? url : `${url.replace(/\/$/, "")}/ws/tasks`;
}

export function initializeApi(config: {
  base_url: string;
  ws_url?: string;
}) {
  if (config?.base_url) {
    apiBase = config.base_url;
  }
  if (config?.ws_url) {
    wsTasksUrl = normalizeWsTasksUrl(config.ws_url);
  } else if (config?.base_url) {
    wsTasksUrl = deriveWsTasksUrl(config.base_url);
  }
  console.log(`[API] Initialized with Base URL: ${apiBase}`);
}

export function getApiBase() {
  return apiBase;
}

export function getApiUrl(endpoint: string) {
  return endpoint.startsWith("http") ? endpoint : `${apiBase}${endpoint}`;
}

export function getWsUrl() {
  return wsTasksUrl;
}
