import type { NavigationDestination } from "./navigation";
import { resolveCurrentNavigationDestination } from "./navigationPersistence";

export type PagePresentationRoute = Exclude<NavigationDestination, "home">;

type PagePresentation = {
  namespace: string;
  titleKey: string;
  subtitleKey: string;
};

const DEFAULT_ROUTE: PagePresentationRoute = "downloader";

const PAGE_PRESENTATIONS: Record<PagePresentationRoute, PagePresentation> = {
  dashboard: {
    namespace: "dashboard",
    titleKey: "title",
    subtitleKey: "subtitle",
  },
  downloader: {
    namespace: "downloader",
    titleKey: "title",
    subtitleKey: "subtitle",
  },
  transcriber: {
    namespace: "transcriber",
    titleKey: "title",
    subtitleKey: "subtitle",
  },
  translator: {
    namespace: "translator",
    titleKey: "title",
    subtitleKey: "subtitle",
  },
  editor: {
    namespace: "editor",
    titleKey: "header.title",
    subtitleKey: "header.subtitle",
  },
  preprocessing: {
    namespace: "preprocessing",
    titleKey: "title",
    subtitleKey: "subtitle",
  },
  settings: {
    namespace: "settings",
    titleKey: "title",
    subtitleKey: "description",
  },
};

export function normalizePresentationRoute(
  route: string | null | undefined,
): PagePresentationRoute {
  if (route && route in PAGE_PRESENTATIONS) {
    return route as PagePresentationRoute;
  }

  return DEFAULT_ROUTE;
}

export function resolveCurrentPresentationRoute(
  hash: string = window.location.hash,
): PagePresentationRoute {
  return normalizePresentationRoute(resolveCurrentNavigationDestination(hash));
}

export function resolvePagePresentation(route: PagePresentationRoute) {
  return PAGE_PRESENTATIONS[route];
}

export function resolveStartupBootstrapNamespaces(
  route: PagePresentationRoute,
) {
  return ["common", "sidebar", resolvePagePresentation(route).namespace] as const;
}
