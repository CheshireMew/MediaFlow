import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from "react";
import type { ReactElement } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import { Layout } from "./components/layout/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastContainer } from "./components/ui/ToastContainer";
import { ConfirmationProvider } from "./components/ui/ConfirmationProvider";
import { StartupPlaceholderPage } from "./components/startup/StartupPlaceholderPage";
import type { StartupPresentationStatus } from "./components/startup/StartupPlaceholderPage";
import {
  consumeDeferredLaunchDestination,
  persistNavigationDestination,
  resolveCurrentNavigationPath,
} from "./services/ui/navigationPersistence";
import {
  NavigationService,
  parseNavigationEventDetail,
  resolveNavigationPath,
} from "./services/ui/navigation";
import { ensureI18nNamespaces } from "./i18n";
import { ROUTE_PAGE_MODULES } from "./startup/routePageDefinitions";
import { prewarmFasterWhisperCliFromStoredPreferences } from "./services/asrCliPrewarm";

import { TaskProvider } from "./context/TaskProvider";
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
  ROUTE_PAGE_MODULES.editor.namespaces,
  ROUTE_PAGE_MODULES.editor.load,
  (module) => module.EditorPage,
);

const DashboardPage = createLazyPage(
  ROUTE_PAGE_MODULES.dashboard.namespaces,
  ROUTE_PAGE_MODULES.dashboard.load,
  (module) => module.DashboardPage,
);

const DownloaderPage = createLazyPage(
  ROUTE_PAGE_MODULES.downloader.namespaces,
  ROUTE_PAGE_MODULES.downloader.load,
  (module) => module.DownloaderPage,
);

const TranscriberPage = createLazyPage(
  ROUTE_PAGE_MODULES.transcriber.namespaces,
  ROUTE_PAGE_MODULES.transcriber.load,
  (module) => module.TranscriberPage,
);

const TranslatorPage = createLazyPage(
  ROUTE_PAGE_MODULES.translator.namespaces,
  ROUTE_PAGE_MODULES.translator.load,
  (module) => module.TranslatorPage,
);

const SettingsPage = createLazyPage(
  ROUTE_PAGE_MODULES.settings.namespaces,
  ROUTE_PAGE_MODULES.settings.load,
  (module) => module.default,
);

interface AppProps {
  appReady?: boolean;
  remoteBackendReady?: boolean;
  startupMessage?: string;
  startupStatus?: StartupPresentationStatus;
  onRetryStartup?: () => void;
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

function RouteContentReady({ children }: { children: ReactElement }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }

    started.current = true;
    const frameId = window.requestAnimationFrame(() => {
      const idleCallback =
        window.requestIdleCallback ??
        ((callback: IdleRequestCallback) =>
          window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 0 }), 250));
      idleCallback(() => {
        prewarmFasterWhisperCliFromStoredPreferences();
      });
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return children;
}

function DeferredLaunchNavigation({ enabled }: { enabled: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const consumed = useRef(false);

  useLayoutEffect(() => {
    if (!enabled || consumed.current || location.pathname === "/") {
      return;
    }

    consumed.current = true;
    const destination = consumeDeferredLaunchDestination();
    if (!destination) {
      return;
    }

    const targetPath = `/${destination}`;
    if (location.pathname !== targetPath) {
      navigate(targetPath, { replace: true });
    }
  }, [enabled, location.pathname, navigate]);

  return null;
}

function routeElement(
  appReady: boolean,
  remoteBackendReady: boolean,
  startupMessage: string,
  startupStatus: StartupPresentationStatus,
  onRetryStartup: (() => void) | undefined,
  page: ReactElement,
  variant:
    | "dashboard"
    | "editor"
    | "downloader"
    | "transcriber"
    | "translator"
    | "settings",
) {
  const requiresBackend = true;

  if (appReady && (!requiresBackend || remoteBackendReady)) {
    return (
      <Suspense fallback={<StartupPlaceholderPage variant={variant} message={startupMessage} />}>
        <RouteContentReady>{page}</RouteContentReady>
      </Suspense>
    );
  }

  return (
    <StartupPlaceholderPage
      variant={variant}
      message={startupMessage}
      status={startupStatus}
      onRetry={onRetryStartup}
    />
  );
}

function App({
  appReady = true,
  remoteBackendReady = true,
  startupMessage = "",
  startupStatus = "loading",
  onRetryStartup,
}: AppProps) {
  const taskProviderEnabled = appReady && remoteBackendReady;

  return (
    <ConfirmationProvider>
      <TaskProvider enabled={taskProviderEnabled}>
        <TaskSummaryProvider enabled={appReady}>
        <HashRouter>
          <ExternalNavListener />
          <ToastContainer />
          <DeferredLaunchNavigation enabled={appReady && remoteBackendReady} />
          <Layout>
            <ErrorBoundary>
              <Routes>
                <Route
                  path="/"
                  element={<Navigate to={resolveCurrentNavigationPath()} replace />}
                />
                <Route
                  path="/editor"
                  element={routeElement(appReady, remoteBackendReady, startupMessage, startupStatus, onRetryStartup, <EditorPage />, "editor")}
                />
                <Route
                  path="/dashboard"
                  element={routeElement(appReady, remoteBackendReady, startupMessage, startupStatus, onRetryStartup, <DashboardPage />, "dashboard")}
                />
                <Route
                  path="/downloader"
                  element={routeElement(appReady, remoteBackendReady, startupMessage, startupStatus, onRetryStartup, <DownloaderPage />, "downloader")}
                />
                <Route
                  path="/transcriber"
                  element={routeElement(appReady, remoteBackendReady, startupMessage, startupStatus, onRetryStartup, <TranscriberPage />, "transcriber")}
                />
                <Route
                  path="/translator"
                  element={routeElement(appReady, remoteBackendReady, startupMessage, startupStatus, onRetryStartup, <TranslatorPage />, "translator")}
                />
                <Route
                  path="/settings"
                  element={routeElement(appReady, remoteBackendReady, startupMessage, startupStatus, onRetryStartup, <SettingsPage />, "settings")}
                />
                <Route
                  path="*"
                  element={routeElement(appReady, remoteBackendReady, startupMessage, startupStatus, onRetryStartup, <DownloaderPage />, "downloader")}
                />
              </Routes>
            </ErrorBoundary>
          </Layout>
          <NavigationStateSync />
        </HashRouter>
        </TaskSummaryProvider>
      </TaskProvider>
    </ConfirmationProvider>
  );
}

export default App;
