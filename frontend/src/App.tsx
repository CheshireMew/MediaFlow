import { useEffect } from "react";
import type { ReactElement } from "react";
import { HashRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import { Layout } from "./components/layout/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastContainer } from "./components/ui/ToastContainer";
import { StartupPlaceholderPage } from "./components/startup/StartupPlaceholderPage";
import { EditorPage } from "./pages/EditorPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DownloaderPage } from "./pages/DownloaderPage";
import { TranscriberPage } from "./pages/TranscriberPage";
import { TranslatorPage } from "./pages/TranslatorPage";
import { PreprocessingPage } from "./pages/PreprocessingPage";
import SettingsPage from "./pages/SettingsPage";
import { ENABLE_EXPERIMENTAL_PREPROCESSING } from "./config/features";
import { isDesktopRuntime } from "./services/domain";
import {
  persistNavigationDestination,
  resolveLaunchDestination,
} from "./services/ui/navigationPersistence";
import { resolveNavigationPath } from "./services/ui/navigation";

import { TaskProvider } from "./context/taskContext";

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
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === "/") {
      navigate(`/${resolveLaunchDestination()}`, { replace: true });
      return;
    }

    persistNavigationDestination(location.pathname);
  }, [location.pathname, navigate]);

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
    return page;
  }

  return <StartupPlaceholderPage variant={variant} message={startupMessage} />;
}

function App({
  appReady = true,
  remoteBackendReady = true,
  startupMessage = "",
}: AppProps) {
  return (
    <TaskProvider enabled={remoteBackendReady}>
      <HashRouter>
        <ExternalNavListener />
        <ToastContainer />
        <Layout>
          <ErrorBoundary>
            <Routes>
              <Route
                path="/"
                element={null}
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
    </TaskProvider>
  );
}

export default App;
