import { API_BASE_URL, WS_TASKS_URL } from "../config/api";

export function getApiBase() {
  return API_BASE_URL;
}

export function getApiUrl(endpoint: string) {
  return endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`;
}

export function getWsUrl() {
  return WS_TASKS_URL;
}
