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
import { resolveNavigationPath } from "./services/ui/navigation";
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
        const detail = (e as CustomEvent<{
          destination?: string;
          payload?: { settings_tab?: "llm" | "general" };
        }>).detail;
        if (detail?.destination) {
          navigate(resolveNavigationPath(detail));
        }
    };
    window.addEventListener('mediaflow:navigate', handleNav);
    return () => window.removeEventListener('mediaflow:navigate', handleNav);
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
  useTaskProvider: boolean = false,
) {
  const requiresBackend = variant === "editor" && !isDesktopRuntime();

  if (appReady && (!requiresBackend || remoteBackendReady)) {
    const pageContent = useTaskProvider
      ? <TaskProvider enabled={remoteBackendReady}>{page}</TaskProvider>
      : page;
    return (
      <Suspense fallback={<StartupPlaceholderPage variant={variant} message={startupMessage} />}>
        {pageContent}
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
  return (
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
                element={routeElement(appReady, remoteBackendReady, startupMessage, <EditorPage />, "editor", true)}
              />
              <Route
                path="/dashboard"
                element={routeElement(appReady, remoteBackendReady, startupMessage, <DashboardPage />, "dashboard", true)}
              />
              <Route
                path="/downloader"
                element={routeElement(appReady, remoteBackendReady, startupMessage, <DownloaderPage />, "downloader", true)}
              />
              <Route
                path="/transcriber"
                element={routeElement(appReady, remoteBackendReady, startupMessage, <TranscriberPage />, "transcriber", true)}
              />
              <Route
                path="/translator"
                element={routeElement(appReady, remoteBackendReady, startupMessage, <TranslatorPage />, "translator", true)}
              />
              {ENABLE_EXPERIMENTAL_PREPROCESSING && (
                <Route
                  path="/preprocessing"
                  element={routeElement(appReady, remoteBackendReady, startupMessage, <PreprocessingPage />, "preprocessing", true)}
                />
              )}
              <Route
                path="/settings"
                element={routeElement(appReady, remoteBackendReady, startupMessage, <SettingsPage />, "settings")}
              />
              <Route
                path="*"
                element={routeElement(appReady, remoteBackendReady, startupMessage, <DownloaderPage />, "downloader", true)}
              />
            </Routes>
          </ErrorBoundary>
        </Layout>
        <NavigationStateSync />
      </HashRouter>
    </TaskSummaryProvider>
  );
}

export default App;
