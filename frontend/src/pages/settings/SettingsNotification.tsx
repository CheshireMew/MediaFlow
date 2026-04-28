import { AlertCircle, CheckCircle } from "lucide-react";
import type { Notification } from "./useSettingsData";

type SettingsNotificationProps = {
  notification: Notification;
};

export function SettingsNotification({ notification }: SettingsNotificationProps) {
  return (
    <div
      className={`fixed bottom-6 right-6 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl z-50 animate-in slide-in-from-bottom-5 duration-300 ${
        notification.type === "error"
          ? "bg-red-500/10 text-red-400 border border-red-500/20"
          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
      }`}
    >
      {notification.type === "success" ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
      <span className="font-medium text-sm">{notification.message}</span>
    </div>
  );
}
