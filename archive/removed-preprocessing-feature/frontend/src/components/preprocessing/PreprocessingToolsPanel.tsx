import { MonitorPlay, Eraser, ScanText, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePreprocessingStore } from '../../stores/preprocessingStore';
import { EnhanceTab } from './tools/EnhanceTab';
import { CleanTab } from './tools/CleanTab';
import { OCRTab } from './tools/OCRTab';
import type { SubtitleSegment } from '../../types/task';
import type { PreprocessingTool } from '../../stores/preprocessingStore';
import type { ROIRect } from '../../hooks/preprocessing/roiMapping';

const PREPROCESSING_TABS: Array<{
    id: PreprocessingTool;
    icon: typeof MonitorPlay;
    labelKey: 'tabs.enhance' | 'tabs.clean' | 'tabs.extract';
}> = [
    { id: 'enhance', icon: MonitorPlay, labelKey: 'tabs.enhance' },
    { id: 'clean', icon: Eraser, labelKey: 'tabs.clean' },
    { id: 'extract', icon: ScanText, labelKey: 'tabs.extract' },
];

interface PreprocessingToolsPanelProps {
    isProcessing: boolean;
    roi: ROIRect | null;
    hasVideo: boolean;
    ocrResults: SubtitleSegment[];
    onStartProcessing: () => void;
    onClearRoi: () => void;
}

export const PreprocessingToolsPanel = ({
    isProcessing,
    roi,
    hasVideo,
    ocrResults,
    onStartProcessing,
    onClearRoi,
}: PreprocessingToolsPanelProps) => {
    const { t } = useTranslation('preprocessing');
    const { preprocessingActiveTool, setPreprocessingActiveTool } = usePreprocessingStore();
    const activeTool = preprocessingActiveTool;
    const setActiveTool = setPreprocessingActiveTool;

    return (
        <div className="flex w-80 flex-col border-l border-white/5 bg-[#141414] max-lg:min-h-[420px] max-lg:w-full max-lg:shrink-0 max-lg:border-l-0 max-lg:border-t">
            {/* Tool Tabs */}
            <div className="flex p-1 gap-1 border-b border-white/5">
                {PREPROCESSING_TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTool(tab.id)}
                        className={`flex-1 py-3 flex flex-col items-center gap-1.5 rounded-lg text-xs font-medium transition-all
                            ${activeTool === tab.id
                                ? 'bg-white/5 text-indigo-400 shadow-sm'
                                : 'text-slate-400 hover:text-slate-300 hover:bg-white/[0.02]'
                            }`}
                    >
                        <tab.icon size={18} />
                        {t(tab.labelKey)}
                    </button>
                ))}
            </div>

            {/* Tool Settings */}
            <div className="flex-1 p-6 overflow-y-auto">
                {activeTool === 'enhance' && <EnhanceTab />}
                {activeTool === 'clean' && <CleanTab roi={roi} onClearRoi={onClearRoi} />}
                {activeTool === 'extract' && <OCRTab ocrResults={ocrResults} isProcessing={isProcessing} roi={roi} />}
            </div>

            {/* Action Button */}
            <div className="p-6 border-t border-white/5 bg-[#141414]">
                <button
                    onClick={onStartProcessing}
                    disabled={!hasVideo || isProcessing || (activeTool === 'clean' && !roi)}
                    className={`w-full h-12 rounded-xl font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2
                        ${(!hasVideo || isProcessing || (activeTool === 'clean' && !roi))
                            ? 'bg-slate-800 text-slate-400 cursor-not-allowed shadow-none'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'
                        }`}
                >
                    {isProcessing ? <Loader2 className="animate-spin" size={16} /> : (
                        <>
                            {activeTool === 'enhance' && <MonitorPlay size={16} />}
                            {activeTool === 'clean' && <Eraser size={16} />}
                            {activeTool === 'extract' && <ScanText size={16} />}
                        </>
                    )}
                    <span>
                        {isProcessing ? t('button.processingLabel') : (() => {
                            if (!hasVideo) return t('button.noMediaText');
                            if (activeTool === 'clean' && !roi) return t('button.noROIText');
                            if (activeTool === 'enhance') return t('button.enhanceText');
                            if (activeTool === 'clean') return t('button.cleanText');
                            if (activeTool === 'extract') return roi ? t('button.ocrROIText') : t('button.ocrFullText');
                            return t('button.defaultText');
                        })()}
                    </span>
                </button>
            </div>
        </div>
    );
};
