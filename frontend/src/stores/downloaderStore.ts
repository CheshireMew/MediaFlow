import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface DownloadHistoryItem {
  id: string;
  url: string;
  title: string;
  timestamp: number;
  status: "pending" | "completed" | "failed";
  path?: string;
}

interface DownloaderState {
  // Persistent Settings
  url: string;
  resolution: string;
  codec: string; // "best" | "avc"
  downloadSubs: boolean;

  // History
  history: DownloadHistoryItem[];

  // Actions
  setUrl: (url: string) => void;
  setResolution: (res: string) => void;
  setCodec: (codec: string) => void;
  setDownloadSubs: (enabled: boolean) => void;
  addToHistory: (item: DownloadHistoryItem) => void;
  updateHistoryStatus: (
    id: string,
    status: "completed" | "failed",
    path?: string,
  ) => void;
  clearHistory: () => void;
}

export const useDownloaderStore = create<DownloaderState>()(
  persist(
    (set) => ({
      url: "",
      resolution: "best",
      codec: "avc", // Default to AVC for compatibility
      downloadSubs: false,
      history: [],

      setUrl: (url) => set({ url }),
      setResolution: (resolution) => set({ resolution }),
      setCodec: (codec) => set({ codec }),
      setDownloadSubs: (downloadSubs) => set({ downloadSubs }),

      addToHistory: (item) =>
        set((state) => ({
          history: [item, ...state.history].slice(0, 50), // Keep last 50
        })),

      updateHistoryStatus: (id, status, path) =>
        set((state) => ({
          history: state.history.map((item) =>
            item.id === id ? { ...item, status, path } : item,
          ),
        })),

      clearHistory: () => set({ history: [] }),
    }),
    {
      name: "downloader-storage", // unique name for localStorage key
      partialize: (state) => ({
        url: state.url,
        resolution: state.resolution,
        codec: state.codec,
        downloadSubs: state.downloadSubs,
        history: state.history,
      }),
    },
  ),
);
