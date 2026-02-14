import React from "react";
import { Download, ChevronDown, Check } from "lucide-react";

interface VideoDownloadOptionsProps {
  resolution: string;
  setResolution: (res: string) => void;
  codec: string;
  setCodec: (codec: string) => void;
  downloadSubs: boolean;
  setDownloadSubs: (subs: boolean) => void;
  loading: boolean;
  analyzing: boolean;
  url: string;
  onAction: () => void;
}

export function VideoDownloadOptions({
  resolution,
  setResolution,
  codec,
  setCodec,
  downloadSubs,
  setDownloadSubs,
  loading,
  analyzing,
  url,
  onAction,
}: VideoDownloadOptionsProps) {
  return (
    <div className="flex flex-col gap-4">
      
      {/* Settings Grid */}
      <div className="grid grid-cols-2 gap-4">
          {/* Quality Card */}
          <div className="bg-black/20 backdrop-blur-md rounded-xl p-4 border border-white/5 flex flex-col gap-3 group hover:border-white/10 transition-colors">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              Quality
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-indigo-300 border border-indigo-500/20">MP4</span>
            </label>
            <div className="relative">
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="w-full h-10 bg-black/40 border border-white/10 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 appearance-none cursor-pointer hover:bg-black/60 transition-all font-medium"
              >
                <option value="best" className="bg-[#1a1a1a] text-white">Best Quality (Default)</option>
                <option value="4k" className="bg-[#1a1a1a] text-white">4K Ultra HD</option>
                <option value="2k" className="bg-[#1a1a1a] text-white">2K QHD</option>
                <option value="1080p" className="bg-[#1a1a1a] text-white">1080p Full HD</option>
                <option value="720p" className="bg-[#1a1a1a] text-white">720p HD</option>
                <option value="480p" className="bg-[#1a1a1a] text-white">480p SD</option>
                <option value="audio" className="bg-[#1a1a1a] text-white">Audio Only (m4a/mp3)</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                <ChevronDown size={14} />
              </div>
            </div>
          </div>

          {/* Subtitles Card */}
           <label 
              className={`rounded-xl p-4 border transition-all cursor-pointer select-none group relative overflow-hidden flex flex-col justify-between
                ${downloadSubs 
                  ? "bg-indigo-500/10 border-indigo-500/30 shadow-[0_0_15px_-3px_rgba(99,102,241,0.15)]" 
                  : "bg-black/20 border-white/5 hover:bg-black/30 hover:border-white/10 backdrop-blur-md"
                }
              `}
            >
              <div className="flex justify-between items-start">
                   <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Subtitles</span>
                   <div className={`w-5 h-5 rounded flex items-center justify-center transition-all duration-300 border
                      ${downloadSubs
                          ? "bg-indigo-500 border-indigo-500 rotate-0 scale-100 shadow-sm" 
                          : "border-slate-600 rotate-90 scale-90 bg-transparent"
                      }
                    `}>
                      {downloadSubs && <Check size={14} className="text-white" strokeWidth={3} />}
                   </div>
              </div>
              
              <div className={`text-sm font-medium mt-2 transition-colors ${downloadSubs ? "text-indigo-200" : "text-slate-400 group-hover:text-slate-300"}`}>
                  Include Captions
              </div>
              
              <input 
                type="checkbox" 
                checked={downloadSubs} 
                onChange={e => setDownloadSubs(e.target.checked)}
                className="hidden"
              />
          </label>
      </div>

      {/* Codec Strategy */}
      <div className="bg-black/20 backdrop-blur-md rounded-xl p-1 border border-white/5 flex relative">
        <div 
          className="absolute inset-y-1 rounded-lg bg-indigo-500/20 border border-indigo-500/30 transition-all duration-300"
          style={{ 
            left: codec === 'avc' ? '4px' : '50%',
            width: 'calc(50% - 4px)',
          }} 
        />
        
        <button
          onClick={() => setCodec('avc')}
          className={`flex-1 relative z-10 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors rounded-lg ${
            codec === 'avc' ? 'text-indigo-300' : 'text-slate-500 hover:text-slate-400'
          }`}
        >
          Compatible (H.264)
        </button>
        <button
          onClick={() => setCodec('best')}
          className={`flex-1 relative z-10 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors rounded-lg ${
            codec === 'best' ? 'text-indigo-300' : 'text-slate-500 hover:text-slate-400'
          }`}
        >
          Efficient (Best/AV1)
        </button>
      </div>

      {/* Download Button */}
      <button
        onClick={onAction}
        disabled={loading || analyzing || !url}
        className={`h-14 rounded-xl font-bold text-base flex items-center justify-center gap-3 transition-all shadow-lg relative overflow-hidden group/btn
          ${loading || analyzing || !url
            ? "bg-slate-800/50 border border-white/5 text-slate-500 cursor-not-allowed shadow-none"
            : "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 border border-white/10"
          }
        `}
      >
        {/* Hover Effect (Only when active) */}
        {!loading && !analyzing && url && (
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300 pointer-events-none" />
        )}
        
        {/* Content */}
        {loading || analyzing ? (
             <>
                <div className="w-5 h-5 border-2 border-slate-500 border-t-white rounded-full animate-spin" />
                <span>
                   {analyzing ? "Analyzing Stream..." : "Downloading Media..."}
                </span>
             </>
        ) : (
             <>
                <span>Download Media</span>
                <Download size={20} className="stroke-[2.5]" />
             </>
        )}
      </button>

    </div>
  );
}
