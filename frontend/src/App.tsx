import { useRef, useEffect } from "react";
import { HashRouter, Routes, Route, useNavigate } from "react-router-dom";
import "./App.css";
import { Layout } from "./components/layout/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastContainer } from "./components/ui/ToastContainer";
import { EditorPage } from "./pages/EditorPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DownloaderPage } from "./pages/DownloaderPage";
import { TranscriberPage } from "./pages/TranscriberPage";
import { TranslatorPage } from "./pages/TranslatorPage";
import { PreprocessingPage } from "./pages/PreprocessingPage";
import SettingsPage from "./pages/SettingsPage";

import { TaskProvider } from "./context/TaskContext";

function ExternalNavListener() {
  const navigate = useNavigate();
  // Event-based navigation (e.g. from Electron menu or other non-react sources)
  useEffect(() => {
    const handleNav = (e: any) => {
        if (e.detail) navigate(`/${e.detail}`);
    };
    window.addEventListener('mediaflow:navigate', handleNav);
    return () => window.removeEventListener('mediaflow:navigate', handleNav);
  }, [navigate]);
  return null;
}

function App() {
  return (
    <TaskProvider>
      <HashRouter>
        <ExternalNavListener />
        <ToastContainer />
        <Layout>
           <ErrorBoundary>
             <Routes>
                <Route path="/" element={<EditorPage />} />
                <Route path="/editor" element={<EditorPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/downloader" element={<DownloaderPage />} />
                <Route path="/transcriber" element={<TranscriberPage />} />
                <Route path="/translator" element={<TranslatorPage />} />
                <Route path="/preprocessing" element={<PreprocessingPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<EditorPage />} />
             </Routes>
           </ErrorBoundary>
        </Layout>
      </HashRouter>
    </TaskProvider>
  );
}

export default App;
