import { useCallback, useEffect, useRef, useState } from "react";

import { getWsUrl } from "../../api/runtime";
import { isTaskSocketMessage, type TaskSocketMessage } from "./useTaskStore";

type UseTaskSocketArgs = {
  onMessage: (message: TaskSocketMessage) => void;
  onDisconnected?: () => void;
  enabled?: boolean;
};

export function useTaskSocket({
  onMessage,
  onDisconnected,
  enabled = true,
}: UseTaskSocketArgs) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = new WebSocket(getWsUrl());

    ws.onopen = () => {
      setConnected(true);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    ws.onclose = () => {
      setConnected(false);
      onDisconnected?.();
      wsRef.current = null;
      reconnectTimeoutRef.current = setTimeout(() => connectRef.current(), 3000);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const message: unknown = JSON.parse(event.data);
        if (!isTaskSocketMessage(message)) {
          throw new Error("Invalid task socket message envelope");
        }
        onMessage(message);
      } catch (error) {
        console.error("Error parsing WS message:", error);
      }
    };

    wsRef.current = ws;
  }, [onDisconnected, onMessage]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (!enabled) {
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      return;
    }

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect, enabled]);

  return {
    connected: enabled && connected,
  };
}
