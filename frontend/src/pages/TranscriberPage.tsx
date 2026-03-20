import { FileAudio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTranscriber } from '../hooks/useTranscriber';
import { AudioFileUploader } from '../components/transcriber/AudioFileUploader';
import { TranscriptionConfig } from '../components/transcriber/TranscriptionConfig';
import { TranscriptionResults } from '../components/transcriber/TranscriptionResults';

export const TranscriberPage = () => {
  const { t } = useTranslation('transcriber');
  const { state, actions } = useTranscriber();

  return (
    <div className="w-full h-full px-6 pb-6 pt-5 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-none mb-6 flex items-center gap-4">
        <div className="p-2 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl border border-white/5 shadow-lg shadow-purple-500/10">
          <FileAudio className="w-6 h-6 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{t('title')}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{t('subtitle')}</p>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6 overflow-hidden">
        {/* Left Column: Controls */}
        <div className="w-full lg:w-[420px] flex-none flex flex-col h-full bg-[#1a1a1a] border border-white/5 rounded-2xl shadow-2xl overflow-hidden">
           <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                 <div className="flex items-center justify-center w-4 h-4 rounded-full bg-purple-500/20">
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                 </div>
                 {t('taskPanel.title')}
              </h3>
           </div>

            <div className="p-5 flex-1 flex flex-col gap-5 min-h-0 overflow-y-auto custom-scrollbar">
               <AudioFileUploader 
                 file={state.file} 
                 onFileSelect={actions.onFileSelect} 
                 onFileDrop={actions.onFileDrop}
                 className="w-full min-h-[120px]"
               />

              <div className="flex flex-col gap-6 shrink-0">
                <TranscriptionConfig 
                  model={state.model}
                  setModel={actions.setModel}
                  device={state.device}
                  setDevice={actions.setDevice}
                  onTranscribe={actions.startTranscription}
                  isFileSelected={!!state.file}
                  activeTaskId={state.activeTaskId}
                  isSubmitting={state.isUploading}
                />

                {/* Progress Card (Persistent) */}
                <div className={`border rounded-xl p-4 transition-all duration-500 ${
                  state.activeTask 
                    ? "bg-purple-500/10 border-purple-500/20 shadow-[0_0_20px_-5px_rgba(168,85,247,0.15)]" 
                    : "bg-white/[0.02] border-white/5"
                }`}>
                   <div className="flex justify-between items-center mb-3">
                     <span className={`text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${state.activeTask ? "text-purple-400" : "text-slate-500"}`}>
                       {state.activeTask ? state.activeTask.status : t('progressCard.systemReady')}
                     </span>
                     <span className={`text-xs font-mono transition-colors duration-300 ${state.activeTask ? "text-purple-300" : "text-slate-600"}`}>
                        {state.activeTask ? state.activeTask.progress.toFixed(0) : 0}%
                     </span>
                   </div>
                   <div className={`h-1.5 rounded-full overflow-hidden mb-3 transition-colors duration-300 ${state.activeTask ? "bg-purple-900/40" : "bg-white/5"}`}>
                     <div 
                       className={`h-full transition-all duration-300 ease-out ${
                           state.activeTask ? "bg-gradient-to-r from-purple-500 to-pink-500" : "bg-slate-700 w-0"
                       }`}
                       style={{ width: `${state.activeTask ? state.activeTask.progress : 0}%` }}
                     />
                   </div>
                   <div className={`text-xs truncate flex items-center gap-2 transition-colors duration-300 ${state.activeTask ? "text-purple-300/80" : "text-slate-500"}`}>
                     <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${state.activeTask ? "bg-purple-500 animate-pulse shadow-[0_0_8px_rgba(168,85,247,0.6)]" : "bg-slate-700"}`} />
                     {state.activeTask ? (state.activeTask.message || t('progressCard.processingMessage')) : t('progressCard.waitingMessage')}
                   </div>
                </div>
              </div>
           </div>
        </div>

        {/* Right Panel: Results */}
        <div className="flex-1 min-w-0 h-full flex flex-col">
            <TranscriptionResults 
                result={state.result}
                onSendToEditor={actions.sendToEditor}
                onSendToTranslator={actions.sendToTranslator}
            />
        </div>
      </div>
    </div>
  );
};
