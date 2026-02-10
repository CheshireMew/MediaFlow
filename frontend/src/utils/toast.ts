type ToastType = "success" | "error" | "info" | "warning";

interface ToastEvent {
  message: string;
  type: ToastType;
  duration?: number;
}

type ToastListener = (event: ToastEvent) => void;

const listeners: ToastListener[] = [];

export const toast = {
  subscribe(listener: ToastListener) {
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index > -1) listeners.splice(index, 1);
    };
  },

  emit(message: string, type: ToastType = "info", duration = 3000) {
    listeners.forEach((listener) => listener({ message, type, duration }));
  },

  success(message: string, duration?: number) {
    this.emit(message, "success", duration);
  },

  error(message: string, duration?: number) {
    this.emit(message, "error", duration);
  },

  info(message: string, duration?: number) {
    this.emit(message, "info", duration);
  },

  warning(message: string, duration?: number) {
    this.emit(message, "warning", duration);
  },
};
