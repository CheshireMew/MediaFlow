/**
 * Centralized configuration for API endpoints.
 * Uses environment variables with fallbacks for development.
 */

// Backend API base URL (HTTP)
export const API_BASE_URL =
  import.meta.env["VITE_API_URL"] || "http://127.0.0.1:8800/api/v1";

// Backend WebSocket URL
export const WS_BASE_URL =
  import.meta.env["VITE_WS_URL"] || "ws://127.0.0.1:8800/api/v1";

// Specific endpoints
export const WS_TASKS_URL = `${WS_BASE_URL}/ws/tasks`;
