import { FileText, Clapperboard, ArrowRight, FolderOpen } from "lucide-react";
import type { TranscribeResult } from "../../types/transcriber";

interface TranscriptionResultsProps {
  result: TranscribeResult | null;
  onSendToEditor: () => void;
  onSendToTranslator: (payload: { video_path: string; subtitle_path: string }) => void;
}

export function TranscriptionResults({ result, onSendToEditor, onSendToTranslator }: TranscriptionResultsProps) {
  return (
    <div className="col-span-8 flex flex-col bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
        <h2 className="font-semibold text-slate-200 flex items-center gap-2">
          <FileText className="w-4 h-4 text-purple-400" />
          Result Preview
        </h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-sm">
        {result ? (
          result.segments.map((seg) => (
            <div key={seg.id} className="flex gap-4 p-2 hover:bg-slate-700/50 rounded group">
              <div className="text-slate-500 w-24 shrink-0 select-none text-xs pt-1">
                {new Date(seg.start * 1000).toISOString().substr(11, 8)}
              </div>
              <div className="text-slate-300 group-hover:text-white transition-colors">
                {seg.text}
              </div>
            </div>
          ))
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
            <FileText className="w-12 h-12 opacity-20" />
            <p>No transcription results yet</p>
          </div>
        )}
      </div>

      {result && (
        <div className="p-4 border-t border-slate-700 bg-slate-900/50 flex justify-end gap-3 sticky bottom-0">
            <button
            onClick={() => {
                // Ensure we pass the correct structure
                const payload = {
                    video_path: result.video_path || result.audio_path,
                    subtitle_path: result.srt_path || result.subtitle_path
                };
                if (payload.subtitle_path) {
                     onSendToTranslator(payload as any); 
                } else {
                    alert("No SRT file path found in result. Cannot translate.");
                }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-900/20"
            >
            <ArrowRight size={16} />
            Translate
            </button>
            <button
            onClick={onSendToEditor}
            className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-500 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-pink-900/20"
            >
            <Clapperboard size={16} />
            Open Editor
            </button>
        </div>
      )}

      {result && result.srt_path && (
         <div className="p-2 px-4 bg-slate-900 border-t border-slate-700 text-xs text-slate-500 truncate flex justify-between">
            <span>SRT saved to: {result.srt_path}</span>
            <button 
              onClick={() => window.electronAPI && window.electronAPI.showInExplorer(result.srt_path!)}
              className="flex items-center gap-1 text-purple-400 hover:text-purple-300 ml-2 transition-colors"
            >
              <FolderOpen className="w-3 h-3" />
              Open Folder
            </button>
         </div>
      )}
    </div>
  );
}
