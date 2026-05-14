import { Download } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { TaskMonitor } from "../components/TaskMonitor";
import { useDownloaderController } from "../hooks/useDownloaderController";
import { DownloaderInput } from "../components/downloader/DownloaderInput";
import { VideoDownloadOptions } from "../components/downloader/VideoDownloadOptions";
import { PlaylistDialog } from "../components/downloader/PlaylistDialog";
import { PageContent, PageHeader, PageShell, PanelHeader, WorkPanel } from "../components/ui/PageChrome";

export function DownloaderPage() {
  const { t } = useTranslation('downloader');
  const {
    // State
    url, loading, analyzing, error, playlistInfo, showPlaylistDialog, selectedItems, canDownloadCurrent, downloadSubs, resolution, codec,
    // Actions
    setUrl, setResolution, setCodec, setDownloadSubs, setShowPlaylistDialog, setSelectedItems,
    analyzeAndDownload, downloadPlaylist, toggleItemSelection
  } = useDownloaderController();

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
      }
    } catch (err) {
      console.error("Failed to read clipboard:", err);
      // Fallback or notify user? Chrome needs permission.
    }
  };

  return (
    <PageShell padded={false} className="flex flex-col">
      <PageHeader icon={Download} title={t('title')} subtitle={t('subtitle')} />

      <PageContent className="flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6 overflow-hidden">
        {/* Left Column: Input & Controls */}
        <WorkPanel className="w-full lg:w-[480px] flex-none flex flex-col h-full">
           <PanelHeader title={t('taskPanel.title')} />
           
           <div className="p-6 flex-1 flex flex-col min-h-0">
              <DownloaderInput 
                url={url} 
                onChange={setUrl} 
                onPaste={handlePaste} 
              />
              
              <div className="mt-8">
                <VideoDownloadOptions 
                  resolution={resolution}
                  setResolution={setResolution}
                  codec={codec}
                  setCodec={setCodec}
                  downloadSubs={downloadSubs}
                  setDownloadSubs={setDownloadSubs}
                  loading={loading}
                  analyzing={analyzing}
                  url={url}
                  onAction={analyzeAndDownload}
                />
              </div>

              {error && (
                <div className="mt-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-start gap-3">
                  <span className="text-lg">⚠️</span>
                  <p className="leading-relaxed whitespace-pre-line">{error}</p>
                </div>
              )}
              <div className="mt-auto pt-6 border-t border-white/5">
                 <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">{t('supportedPlatforms')}</h3>
                 <div className="flex flex-wrap gap-2">
                    {['YouTube', 'Bilibili', 'Douyin', 'TikTok', 'Twitter', 'Instagram'].map(p => (
                      <span key={p} className="px-2.5 py-1 rounded-md bg-white/5 text-slate-400 text-xs border border-white/5">
                        {p}
                      </span>
                    ))}
                 </div>
              </div>
           </div>
        </WorkPanel>

        {/* Right Column: Task Monitor */}
        <div className="flex-1 min-w-0 h-full flex flex-col">
            <TaskMonitor filterTypes={['download']} showHeaderOverview={false} />
        </div>
      </div>

      {/* Playlist Selection Dialog */}
      {showPlaylistDialog && playlistInfo && (
        <PlaylistDialog
           playlistInfo={playlistInfo}
           selectedItems={selectedItems}
           onClose={() => setShowPlaylistDialog(false)}
           onSelectAll={() => setSelectedItems(playlistInfo?.items?.map((_, i) => i) || [])}
           onClearSelection={() => setSelectedItems([])}
           canDownloadCurrent={canDownloadCurrent}
           onDownloadCurrent={() => downloadPlaylist("current")}
           onDownloadSelected={() => downloadPlaylist("selected")}
           onToggleItem={toggleItemSelection}
        />
      )}
      </PageContent>
    </PageShell>
  );
}
