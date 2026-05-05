import { create } from "zustand";
import {
  readUiStateValue,
  subscribeUiStateSettingsInitialized,
  writeUiStateValue,
} from "../services/persistence/uiStateSettings";

export interface DownloadHistoryItem {
  id: string;
  url: string;
  title: string;
  timestamp: number;
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
  clearHistory: () => void;
}

const DOWNLOADER_STORE_KEY = "downloader-storage";

type DownloaderSnapshot = Pick<
  DownloaderState,
  "url" | "resolution" | "codec" | "downloadSubs" | "history"
>;

function normalizeDownloaderSnapshot(
  payload: Partial<DownloaderSnapshot> | null | undefined,
): DownloaderSnapshot {
  return {
    url: typeof payload?.url === "string" ? payload.url : "",
    resolution: typeof payload?.resolution === "string" ? payload.resolution : "best",
    codec: typeof payload?.codec === "string" ? payload.codec : "avc",
    downloadSubs:
      typeof payload?.downloadSubs === "boolean" ? payload.downloadSubs : false,
    history: Array.isArray(payload?.history) ? payload.history.slice(0, 50) : [],
  };
}

function readDownloaderSnapshot() {
  return normalizeDownloaderSnapshot(
    readUiStateValue<Partial<DownloaderSnapshot>>(DOWNLOADER_STORE_KEY),
  );
}

let isHydratingDownloaderSnapshot = false;

function persistDownloaderSnapshot(state: DownloaderState) {
  if (isHydratingDownloaderSnapshot) {
    return;
  }

  writeUiStateValue(DOWNLOADER_STORE_KEY, {
    url: state.url,
    resolution: state.resolution,
    codec: state.codec,
    downloadSubs: state.downloadSubs,
    history: state.history,
  } satisfies DownloaderSnapshot);
}

const initialDownloaderSnapshot = readDownloaderSnapshot();

export const useDownloaderStore = create<DownloaderState>()((set) => ({
  ...initialDownloaderSnapshot,

  setUrl: (url) => set({ url }),
  setResolution: (resolution) => set({ resolution }),
  setCodec: (codec) => set({ codec }),
  setDownloadSubs: (downloadSubs) => set({ downloadSubs }),

  addToHistory: (item) =>
    set((state) => ({
      history: [item, ...state.history].slice(0, 50), // Keep last 50
    })),

  clearHistory: () => set({ history: [] }),
}));

useDownloaderStore.subscribe(persistDownloaderSnapshot);

subscribeUiStateSettingsInitialized(() => {
  isHydratingDownloaderSnapshot = true;
  useDownloaderStore.setState(readDownloaderSnapshot());
  isHydratingDownloaderSnapshot = false;
});
