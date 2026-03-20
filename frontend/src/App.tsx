import { useEffect } from "react";
import { HashRouter, Routes, Route, useNavigate } from "react-router-dom";
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

import { TaskProvider } from "./context/taskContext";

interface AppProps {
  backendReady?: boolean;
  startupMessage?: string;
}

function ExternalNavListener() {
  const navigate = useNavigate();

  // Event-based navigation (e.g. from Electron menu or other non-react sources)
  useEffect(() => {
    const handleNav = (e: Event) => {
        const detail = (e as CustomEvent<{ destination?: string }>).detail;
        if (detail?.destination) navigate(`/${detail.destination}`);
    };
    window.addEventListener('mediaflow:navigate', handleNav);
    return () => window.removeEventListener('mediaflow:navigate', handleNav);
  }, [navigate]);
  return null;
}

function routeElement(
  backendReady: boolean,
  startupMessage: string,
  page: JSX.Element,
  variant:
    | "dashboard"
    | "editor"
    | "downloader"
    | "transcriber"
    | "translator"
    | "preprocessing"
    | "settings",
) {
  if (backendReady) {
    return page;
  }

  return <StartupPlaceholderPage variant={variant} message={startupMessage} />;
}

function App({
  backendReady = true,
  startupMessage = "",
}: AppProps) {
  return (
    <TaskProvider enabled={backendReady}>
      <HashRouter>
        <ExternalNavListener />
        <ToastContainer />
        <Layout>
          <ErrorBoundary>
            <Routes>
              <Route
                path="/"
                element={routeElement(backendReady, startupMessage, <EditorPage />, "editor")}
              />
              <Route
                path="/editor"
                element={routeElement(backendReady, startupMessage, <EditorPage />, "editor")}
              />
              <Route
                path="/dashboard"
                element={routeElement(backendReady, startupMessage, <DashboardPage />, "dashboard")}
              />
              <Route
                path="/downloader"
                element={routeElement(backendReady, startupMessage, <DownloaderPage />, "downloader")}
              />
              <Route
                path="/transcriber"
                element={routeElement(backendReady, startupMessage, <TranscriberPage />, "transcriber")}
              />
              <Route
                path="/translator"
                element={routeElement(backendReady, startupMessage, <TranslatorPage />, "translator")}
              />
              <Route
                path="/preprocessing"
                element={routeElement(backendReady, startupMessage, <PreprocessingPage />, "preprocessing")}
              />
              <Route
                path="/settings"
                element={routeElement(backendReady, startupMessage, <SettingsPage />, "settings")}
              />
              <Route
                path="*"
                element={routeElement(backendReady, startupMessage, <EditorPage />, "editor")}
              />
            </Routes>
          </ErrorBoundary>
        </Layout>
      </HashRouter>
    </TaskProvider>
  );
}

export default App;
