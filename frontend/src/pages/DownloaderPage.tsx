import { Download } from "lucide-react";
import { TaskMonitor } from "../components/TaskMonitor";
import { useDownloaderController } from "../hooks/useDownloaderController";
import { DownloaderInput } from "../components/downloader/DownloaderInput";
import { VideoDownloadOptions } from "../components/downloader/VideoDownloadOptions";
import { PlaylistDialog } from "../components/downloader/PlaylistDialog";

export function DownloaderPage() {
  const {
    // State
    url, loading, analyzing, error, playlistInfo, showPlaylistDialog, selectedItems, downloadSubs, resolution, codec,
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
    <div className="w-full h-full px-6 pb-6 pt-5 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-none mb-6 flex items-center gap-4">
        <div className="p-2 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-2xl border border-white/5 shadow-lg shadow-indigo-500/10">
          <Download className="w-6 h-6 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Video Downloader</h1>
          <p className="text-slate-400 text-sm mt-0.5">Download high-quality video & audio from supported platforms</p>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6 overflow-hidden">
        {/* Left Column: Input & Controls */}
        <div className="w-full lg:w-[480px] flex-none flex flex-col h-full bg-[#1a1a1a] border border-white/5 rounded-2xl shadow-2xl overflow-hidden">
           <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                 <div className="flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500/20">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                 </div>
                 New Task
              </h3>
           </div>
           
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
                  <p className="leading-relaxed">{error}</p>
                </div>
              )}

              <div className="mt-auto pt-6 border-t border-white/5">
                 <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Supported Platforms</h3>
                 <div className="flex flex-wrap gap-2">
                    {['YouTube', 'Bilibili', 'Douyin', 'TikTok', 'Twitter', 'Instagram'].map(p => (
                      <span key={p} className="px-2.5 py-1 rounded-md bg-white/5 text-slate-400 text-xs border border-white/5">
                        {p}
                      </span>
                    ))}
                 </div>
              </div>
           </div>
        </div>

        {/* Right Column: Task Monitor */}
        <div className="flex-1 min-w-0 h-full flex flex-col">
            <TaskMonitor filterTypes={['download']} />
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
           onDownloadCurrent={() => downloadPlaylist("current")}
           onDownloadSelected={() => downloadPlaylist("selected")}
           onToggleItem={toggleItemSelection}
        />
      )}
    </div>
  );
}
