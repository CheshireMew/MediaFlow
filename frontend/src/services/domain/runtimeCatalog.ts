export type RuntimeStrategy = "desktop-primary" | "backend-fallback" | "web-only";

type OperationCatalog = Record<string, RuntimeStrategy>;

export const domainRuntimeCatalog = {
  executionService: {
    transcribe: "desktop-primary",
    translate: "desktop-primary",
    synthesize: "desktop-primary",
    download: "desktop-primary",
  },
  preprocessingService: {
    extractText: "desktop-primary",
    getOcrResults: "desktop-primary",
    enhanceVideo: "desktop-primary",
    cleanVideo: "desktop-primary",
  },
  downloaderService: {
    analyzeUrl: "desktop-primary",
    saveCookies: "desktop-primary",
  },
  editorService: {
    detectSilence: "desktop-primary",
    getPeaks: "desktop-primary",
    transcribeSegment: "desktop-primary",
    translateSegments: "desktop-primary",
    uploadWatermark: "desktop-primary",
    getLatestWatermark: "desktop-primary",
  },
  settingsService: {
    getSettings: "desktop-primary",
    updateSettings: "desktop-primary",
    setActiveProvider: "desktop-primary",
    testProviderConnection: "desktop-primary",
    updateYtDlp: "desktop-primary",
  },
  glossaryService: {
    listTerms: "desktop-primary",
    addTerm: "desktop-primary",
    deleteTerm: "desktop-primary",
  },
  translationService: {
    startTranslation: "backend-fallback",
    getTaskStatus: "backend-fallback",
  },
} satisfies Record<string, OperationCatalog>;

export const backendHttpRuntimeCatalog = {
  startupApi: {
    checkHealth: "web-only",
  },
  taskApi: {
    listTasks: "backend-fallback",
    pauseAllTasks: "backend-fallback",
    cancelAllTasks: "backend-fallback",
    pauseTask: "backend-fallback",
    cancelTask: "backend-fallback",
    resumeTask: "backend-fallback",
    deleteTask: "backend-fallback",
    deleteAllTasks: "backend-fallback",
  },
  translationApi: {
    startTranslation: "backend-fallback",
    getTaskStatus: "backend-fallback",
  },
} satisfies Record<string, OperationCatalog>;

export function getRuntimeStrategy<
  TCatalog extends Record<string, OperationCatalog>,
  TService extends keyof TCatalog,
  TOperation extends keyof TCatalog[TService],
>(catalog: TCatalog, service: TService, operation: TOperation): TCatalog[TService][TOperation] {
  return catalog[service][operation];
}

