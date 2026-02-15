import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import type { Task } from '../types/task';
import { getWsUrl } from '../api/client';

interface TaskContextType {
  tasks: Task[];
  connected: boolean;
  cancelTask: (taskId: string) => void;
  addTask: (task: Task) => void;
}

const TaskContext = createContext<TaskContextType | null>(null);

export const useTaskContext = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTaskContext must be used within a TaskProvider');
  }
  return context;
};

export const TaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Use centralized config for WebSocket URL
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
      wsRef.current = null;
      // Reconnect after 3s
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'snapshot') {
          // Sort tasks by created_at desc
          const sorted = (data.tasks as Task[]).sort((a, b) => b.created_at - a.created_at);
          setTasks(sorted);
        } else if (data.type === 'update') {
          const updatedTask = data.task as Task;
          setTasks(prev => {
            const index = prev.findIndex(t => t.id === updatedTask.id);
            if (index === -1) {
              return [updatedTask, ...prev];
            }
            const newTasks = [...prev];
            newTasks[index] = updatedTask;
            return newTasks;
          });
        } else if (data.type === 'delete') {
            const deletedId = data.task_id;
            setTasks(prev => prev.filter(t => t.id !== deletedId));
        }
      } catch (e) {
        console.error("Error parsing WS message:", e);
      }
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  const cancelTask = (taskId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'cancel',
        task_id: taskId
      }));
    }
  };

  const addTask = (task: Task) => {
      setTasks(prev => [task, ...prev]);
  };

  return (
    <TaskContext.Provider value={{ tasks, connected, cancelTask, addTask }}>
      {children}
    </TaskContext.Provider>
  );
};
