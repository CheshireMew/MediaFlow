import { FileAudio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTranscriber } from '../hooks/useTranscriber';
import { AudioFileUploader } from '../components/transcriber/AudioFileUploader';
import { TranscriptionConfig } from '../components/transcriber/TranscriptionConfig';
import { TranscriptionResults } from '../components/transcriber/TranscriptionResults';
import { getExecutionModeDisplay } from '../services/ui/executionModeDisplay';
import { clampProgress } from '../utils/number';
import { PageContent, PageHeader, PageShell, PanelHeader, WorkPanel } from '../components/ui/PageChrome';
import type { TaskMessageCode } from '../contracts/runtimeContracts';
import { translateTaskMessage } from '../services/ui/taskMessage';

type ProgressCardState = {
  status: string;
  progress: number;
  message: string;
  active: boolean;
};

function resolveModelDownloadProgress(
  progress: number,
  messageCode: TaskMessageCode,
  messageParams: Record<string, string | number | boolean | null>,
) {
  if (messageCode !== 'asr_model_downloading') {
    return null;
  }

  const downloadedBytes = messageParams.downloaded_bytes;
  const totalBytes = messageParams.total_bytes;
  if (
    typeof downloadedBytes === 'number' &&
    typeof totalBytes === 'number' &&
    totalBytes > 0
  ) {
    return clampProgress((downloadedBytes / totalBytes) * 100);
  }

  return clampProgress(progress * 12.5);
}

export const TranscriberPage = () => {
  const { t } = useTranslation('transcriber');
  const { state, actions } = useTranscriber();
  const executionModeDisplay = state.executionMode
    ? getExecutionModeDisplay(state.executionMode)
    : null;
  const activeTask = state.currentTranscriptionTask;
  const modelDownloadProgress = activeTask
    ? resolveModelDownloadProgress(
        activeTask.progress,
        activeTask.message_code,
        activeTask.message_params,
      )
    : null;
  const progressState: ProgressCardState = activeTask
    ? {
        status: modelDownloadProgress === null
          ? activeTask.status
          : t('progressCard.modelDownload'),
        progress: modelDownloadProgress ?? clampProgress(activeTask.progress),
        message: translateTaskMessage(t, activeTask),
        active: true,
      }
    : {
        status: t('progressCard.systemReady'),
        progress: 0,
        message: t('progressCard.waitingMessage'),
        active: false,
      };
  const progressPercent = Math.round(progressState.progress);

  return (
    <PageShell padded={false} className="flex flex-col">
      <PageHeader icon={FileAudio} title={t('title')} subtitle={t('subtitle')} accent="purple" />

      <PageContent className="flex flex-col overflow-y-auto lg:overflow-hidden">
      <div className="flex-none min-h-0 flex flex-col gap-6 overflow-visible lg:flex-1 lg:flex-row lg:overflow-hidden">
        {/* Left Column: Controls */}
        <WorkPanel className="flex min-h-[480px] w-full flex-none flex-col lg:h-full lg:min-h-0 lg:w-[420px]">
           <PanelHeader title={t('taskPanel.title')} accent="purple" />

            <div className="p-5 flex-1 flex flex-col gap-5 min-h-0 overflow-y-auto custom-scrollbar">
               <AudioFileUploader 
                 file={state.file} 
                 onFileSelect={actions.onFileSelect} 
                 onFileDrop={actions.onFileDrop}
                 className="w-full min-h-[120px]"
               />

              <div className="flex flex-col gap-6 shrink-0">
                <TranscriptionConfig 
                  engine={state.engine}
                  setEngine={actions.setEngine}
                  model={state.model}
                  setModel={actions.setModel}
                  device={state.device}
                  setDevice={actions.setDevice}
                  onTranscribe={actions.startTranscription}
                  isFileSelected={!!state.file}
                  currentTranscriptionTaskId={state.currentTranscriptionTaskId}
                  isSubmitting={state.isUploading}
                />

                {/* Progress Card (Persistent) */}
                <div className={`border rounded-xl p-4 transition-all duration-500 ${
                  progressState.active 
                    ? "bg-purple-500/10 border-purple-500/20 shadow-[0_0_20px_-5px_rgba(168,85,247,0.15)]" 
                    : "bg-white/[0.02] border-white/5"
                }`}>
                   <div className="flex justify-between items-center mb-3">
                     <div className="flex items-center gap-2">
                       <span className={`text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${progressState.active ? "text-purple-400" : "text-slate-400"}`}>
                         {progressState.status}
                       </span>
                       {executionModeDisplay && (
                         <span className={`px-1.5 py-0.5 rounded border text-xs font-mono ${executionModeDisplay.className}`}>
                           {t(`common:${executionModeDisplay.labelKey}`)}
                         </span>
                       )}
                     </div>
                     <span className={`text-xs font-mono transition-colors duration-300 ${progressState.active ? "text-purple-300" : "text-slate-400"}`}>
                        {progressPercent}%
                     </span>
                   </div>
                   <div className={`h-1.5 rounded-full overflow-hidden mb-3 transition-colors duration-300 ${progressState.active ? "bg-purple-900/40" : "bg-white/5"}`}>
                     <div 
                       className={`h-full transition-all duration-300 ease-out ${
                           progressState.active ? "bg-gradient-to-r from-purple-500 to-pink-500" : "bg-slate-700 w-0"
                       }`}
                       style={{ width: `${progressState.progress}%` }}
                     />
                   </div>
                   <div className={`text-xs truncate flex items-center gap-2 transition-colors duration-300 ${progressState.active ? "text-purple-300/80" : "text-slate-400"}`}>
                     <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${progressState.active ? "bg-purple-500 animate-pulse shadow-[0_0_8px_rgba(168,85,247,0.6)]" : "bg-slate-700"}`} />
                     {progressState.message}
                   </div>
                </div>
              </div>
           </div>
        </WorkPanel>

        {/* Right Panel: Results */}
        <div className="flex h-[360px] min-w-0 flex-none flex-col lg:h-full lg:flex-1">
            <TranscriptionResults 
                result={state.result}
                isSmartSplitting={state.isSmartSplitting}
                onSmartSplit={actions.smartSplitSegments}
                onSendToEditor={actions.sendToEditor}
                onSendToTranslator={actions.sendToTranslator}
            />
        </div>
      </div>
      </PageContent>
    </PageShell>
  );
};
