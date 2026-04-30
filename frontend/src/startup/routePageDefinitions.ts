import type { PagePresentationRoute } from "../services/ui/pagePresentation";

type RoutePageModuleDefinition<TModule> = {
  namespaces: readonly string[];
  load: () => Promise<TModule>;
};

function defineRoutePageModule<TModule>(
  definition: RoutePageModuleDefinition<TModule>,
): RoutePageModuleDefinition<TModule> {
  return definition;
}

export const ROUTE_PAGE_MODULES = {
  editor: defineRoutePageModule({
    namespaces: ["editor"],
    load: () => import("../pages/EditorPage"),
  }),
  dashboard: defineRoutePageModule({
    namespaces: ["dashboard", "taskmonitor"],
    load: () => import("../pages/DashboardPage"),
  }),
  downloader: defineRoutePageModule({
    namespaces: ["downloader", "taskmonitor"],
    load: () => import("../pages/DownloaderPage"),
  }),
  transcriber: defineRoutePageModule({
    namespaces: ["transcriber"],
    load: () => import("../pages/TranscriberPage"),
  }),
  translator: defineRoutePageModule({
    namespaces: ["translator"],
    load: () => import("../pages/TranslatorPage"),
  }),
  preprocessing: defineRoutePageModule({
    namespaces: ["preprocessing"],
    load: () => import("../pages/PreprocessingPage"),
  }),
  settings: defineRoutePageModule({
    namespaces: ["settings", "common"],
    load: () => import("../pages/SettingsPage"),
  }),
} satisfies Record<
  PagePresentationRoute,
  RoutePageModuleDefinition<unknown>
>;
