import { ScanText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePreprocessingStore } from '../../../stores/preprocessingStore';
import { Select } from '../../ui/Select';
import type { SubtitleSegment } from '../../../types/task';

interface OCRTabProps {
    ocrResults: SubtitleSegment[];
    isProcessing: boolean;
    roi: { x: number; y: number; w: number; h: number } | null;
}

export const OCRTab = ({ ocrResults, isProcessing, roi }: OCRTabProps) => {
    const { t } = useTranslation('preprocessing');
    const { ocrEngine, setOcrEngine } = usePreprocessingStore();

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col h-full">
            <div>
                <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <ScanText size={16} className="text-emerald-500" /> {t('tools.ocr.title')}
                </h4>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    {t('tools.ocr.description')}
                </p>
            </div>
            <div className="space-y-4">
                <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">{t('tools.ocr.roiCoordinates')}</div>
                    <div className="font-mono text-xs text-emerald-400">
                        {roi
                            ? `x:${Math.round(roi.x)} y:${Math.round(roi.y)} w:${Math.round(roi.w)} h:${Math.round(roi.h)}`
                            : t('tools.ocr.noSelection')}
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400">{t('tools.ocr.engine')}</label>
                    <Select
                        value={ocrEngine}
                        onChange={(val) => setOcrEngine(val as string)}
                        options={[
                            { value: 'rapid', label: 'RapidOCR (Default)' },
                            { value: 'paddle', label: 'PaddleOCR' },
                        ]}
                    />
                </div>
            </div>

            {/* Results List */}
            <div className="flex-1 min-h-0 flex flex-col mt-4 border-t border-white/5 pt-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>{t('tools.ocr.results', { count: ocrResults.length })}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {ocrResults.map((event, idx) => (
                        <div key={idx} className="bg-white/5 p-2 rounded-lg border border-white/5 flex gap-2">
                            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                                {event.start.toFixed(1)}s
                            </div>
                            <div className="text-xs text-slate-200">{event.text}</div>
                        </div>
                    ))}
                    {ocrResults.length === 0 && !isProcessing && (
                        <div className="flex flex-col items-center justify-center py-8 text-slate-600 gap-2">
                            <ScanText size={24} className="opacity-20" />
                            <span className="text-xs italic">{t('tools.ocr.empty')}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
