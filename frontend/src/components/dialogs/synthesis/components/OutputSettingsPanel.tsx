// ── Output Settings Panel (Left sidebar section) ──
import React from 'react';
import { MonitorPlay, Zap, Cpu } from 'lucide-react';
import type { OutputSettingsState } from '../hooks/useOutputSettings';

interface Props {
    output: OutputSettingsState;
}

export const OutputSettingsPanel: React.FC<Props> = ({ output }) => {
    const {
        outputFilename, setOutputFilename,
        outputDir,
        handleSelectOutputFolder,
        useGpu, setUseGpu,
    } = output;

    console.log("OutputSettingsPanel rendered, useGpu:", useGpu);

    return (
        <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <MonitorPlay size={12}/> Output
            </h3>
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-4 hover:border-white/10 transition-colors">

                {/* GPU / CPU Toggle */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                        <Zap size={12} className="text-indigo-400"/> Encoder Selection
                    </label>
                    <div className="flex gap-1.5">
                        <button
                            onClick={() => setUseGpu(true)}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                                useGpu
                                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                                    : 'bg-black/20 border-white/5 text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            <Zap size={12}/> GPU (Fast)
                        </button>
                        <button
                            onClick={() => setUseGpu(false)}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                                !useGpu
                                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                                    : 'bg-black/20 border-white/5 text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            <Cpu size={12}/> CPU (Quality)
                        </button>
                    </div>
                </div>

                {/* Filename Input */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Filename</label>
                    <input 
                        type="text"
                        value={outputFilename}
                        onChange={e => setOutputFilename(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all"
                        placeholder="video_synthesized.mp4"
                    />
                </div>

                {/* Folder Selection */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Save to Folder</label>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            readOnly
                            value={outputDir || ""}
                            className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-400 cursor-not-allowed truncate"
                        />
                        <button 
                            onClick={handleSelectOutputFolder}
                            className="bg-white/5 hover:bg-white/10 hover:text-white text-slate-400 px-3 py-2 rounded-lg text-xs font-medium border border-white/5 transition-all"
                        >
                            Change
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
