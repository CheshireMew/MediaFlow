import { lazy, Suspense, useEffect } from "react";
import type { ReactElement } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import { Layout } from "./components/layout/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastContainer } from "./components/ui/ToastContainer";
import { StartupPlaceholderPage } from "./components/startup/StartupPlaceholderPage";
import { ENABLE_EXPERIMENTAL_PREPROCESSING } from "./config/features";
import { isDesktopRuntime } from "./services/domain";
import {
  persistNavigationDestination,
  resolveCurrentNavigationPath,
} from "./services/ui/navigationPersistence";
import {
  NavigationService,
  parseNavigationEventDetail,
  resolveNavigationPath,
} from "./services/ui/navigation";
import { ensureI18nNamespaces } from "./i18n";

import { TaskProvider } from "./context/taskContext";
import { TaskSummaryProvider } from "./context/taskSummaryContext";

function createLazyPage<TModule>(
  namespaces: readonly string[],
  loader: () => Promise<TModule>,
  resolveDefault: (module: TModule) => React.ComponentType,
) {
  return lazy(async () => {
    const [module] = await Promise.all([
      loader(),
      ensureI18nNamespaces(namespaces),
    ]);
    return { default: resolveDefault(module) };
  });
}

const EditorPage = createLazyPage(
  ["editor"],
  () => import("./pages/EditorPage"),
  (module) => module.EditorPage,
);

const DashboardPage = createLazyPage(
  ["dashboard", "taskmonitor"],
  () => import("./pages/DashboardPage"),
  (module) => module.DashboardPage,
);

const DownloaderPage = createLazyPage(
  ["downloader", "taskmonitor"],
  () => import("./pages/DownloaderPage"),
  (module) => module.DownloaderPage,
);

const TranscriberPage = createLazyPage(
  ["transcriber"],
  () => import("./pages/TranscriberPage"),
  (module) => module.TranscriberPage,
);

const TranslatorPage = createLazyPage(
  ["translator"],
  () => import("./pages/TranslatorPage"),
  (module) => module.TranslatorPage,
);

const PreprocessingPage = createLazyPage(
  ["preprocessing"],
  () => import("./pages/PreprocessingPage"),
  (module) => module.PreprocessingPage,
);

const SettingsPage = createLazyPage(
  ["settings", "common"],
  () => import("./pages/SettingsPage"),
  (module) => module.default,
);

interface AppProps {
  appReady?: boolean;
  remoteBackendReady?: boolean;
  startupMessage?: string;
}

function ExternalNavListener() {
  const navigate = useNavigate();

  // Event-based navigation (e.g. from Electron menu or other non-react sources)
  useEffect(() => {
    const handleNav = (e: Event) => {
      const detail = parseNavigationEventDetail(
        (e as CustomEvent<unknown>).detail,
      );
      if (!detail) {
        return;
      }
      navigate(resolveNavigationPath(detail));
    };
    window.addEventListener(NavigationService.eventName, handleNav);
    return () => window.removeEventListener(NavigationService.eventName, handleNav);
  }, [navigate]);
  return null;
}

function NavigationStateSync() {
  const location = useLocation();

  useEffect(() => {
    persistNavigationDestination(location.pathname);
  }, [location.pathname]);

  return null;
}

function routeElement(
  appReady: boolean,
  remoteBackendReady: boolean,
  startupMessage: string,
  page: ReactElement,
  variant:
    | "dashboard"
    | "editor"
    | "downloader"
    | "transcriber"
    | "translator"
    | "preprocessing"
    | "settings",
) {
  const requiresBackend = variant === "editor" && !isDesktopRuntime();

  if (appReady && (!requiresBackend || remoteBackendReady)) {
    return (
      <Suspense fallback={<StartupPlaceholderPage variant={variant} message={startupMessage} />}>
        {page}
      </Suspense>
    );
  }

  return <StartupPlaceholderPage variant={variant} message={startupMessage} />;
}

function App({
  appReady = true,
  remoteBackendReady = true,
  startupMessage = "",
}: AppProps) {
  const desktopRuntime = isDesktopRuntime();
  const taskProviderEnabled = appReady && (desktopRuntime || remoteBackendReady);

  return (
    <TaskProvider enabled={taskProviderEnabled}>
      <TaskSummaryProvider enabled={appReady}>
        <HashRouter>
          <ExternalNavListener />
          <ToastContainer />
          <Layout>
            <ErrorBoundary>
              <Routes>
                <Route
                  path="/"
                  element={<Navigate to={resolveCurrentNavigationPath()} replace />}
                />
                <Route
                  path="/editor"
                  element={routeElement(appReady, remoteBackendReady, startupMessage, <EditorPage />, "editor")}
                />
                <Route
                  path="/dashboard"
                  element={routeElement(appReady, remoteBackendReady, startupMessage, <DashboardPage />, "dashboard")}
                />
                <Route
                  path="/downloader"
                  element={routeElement(appReady, remoteBackendReady, startupMessage, <DownloaderPage />, "downloader")}
                />
                <Route
                  path="/transcriber"
                  element={routeElement(appReady, remoteBackendReady, startupMessage, <TranscriberPage />, "transcriber")}
                />
                <Route
                  path="/translator"
                  element={routeElement(appReady, remoteBackendReady, startupMessage, <TranslatorPage />, "translator")}
                />
                {ENABLE_EXPERIMENTAL_PREPROCESSING && (
                  <Route
                    path="/preprocessing"
                    element={routeElement(appReady, remoteBackendReady, startupMessage, <PreprocessingPage />, "preprocessing")}
                  />
                )}
                <Route
                  path="/settings"
                  element={routeElement(appReady, remoteBackendReady, startupMessage, <SettingsPage />, "settings")}
                />
                <Route
                  path="*"
                  element={routeElement(appReady, remoteBackendReady, startupMessage, <DownloaderPage />, "downloader")}
                />
              </Routes>
            </ErrorBoundary>
          </Layout>
          <NavigationStateSync />
        </HashRouter>
      </TaskSummaryProvider>
    </TaskProvider>
  );
}

export default App;
