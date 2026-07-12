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
    namespaces: ["editor", "taskmonitor"],
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
    namespaces: ["transcriber", "taskmonitor"],
    load: () => import("../pages/TranscriberPage"),
  }),
  translator: defineRoutePageModule({
    namespaces: ["translator"],
    load: () => import("../pages/TranslatorPage"),
  }),
  settings: defineRoutePageModule({
    namespaces: ["settings", "common"],
    load: () => import("../pages/SettingsPage"),
  }),
} satisfies Record<
  PagePresentationRoute,
  RoutePageModuleDefinition<unknown>
>;
