import { FileUploader } from './FileUploader';
import type { SubtitleSegment } from '../../types/task';
import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type MouseEvent,
    type ReactElement,
} from 'react';
import { List, useDynamicRowHeight, type RowComponentProps } from 'react-window';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';
import { createOpenSubtitleFolderMenuItem } from '../ui/subtitleFileContextMenuItems';
import { isDesktopRuntime } from '../../services/desktop';
import type { MediaReference } from '../../services/ui/mediaReference';

type ContentSizingStyle = CSSProperties & {
    fieldSizing: 'content';
};

const contentSizingStyle: ContentSizingStyle = { fieldSizing: 'content' };

interface SegmentsTableProps {
    sourceSegments: SubtitleSegment[];
    targetSegments: SubtitleSegment[];
    onUpdateTarget: (index: number, text: string) => void;
    onFileSelect: (reference: MediaReference) => void;
    sourceSubtitlePath?: string | null;
    targetSubtitlePath?: string | null;
}

const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

type SubtitleColumnMenuState = {
    position: { x: number; y: number };
    label: string;
    subtitlePath: string;
};

type SegmentRowLabels = {
    generatedSegment: string;
    noSourceSegment: string;
    openSourceFolder: string;
    openTargetFolder: string;
    targetLabel: string;
};

type SegmentRowData = {
    labels: SegmentRowLabels;
    onColumnContextMenu: (
        event: MouseEvent<HTMLDivElement>,
        label: string,
        subtitlePath?: string | null,
    ) => void;
    onUpdateTarget: (index: number, text: string) => void;
    sourceSegments: SubtitleSegment[];
    sourceSubtitlePath?: string | null;
    targetSegments: SubtitleSegment[];
    targetSubtitlePath?: string | null;
};

function EditableTargetText({
    index,
    segment,
    label,
    onCommit,
}: {
    index: number;
    segment: SubtitleSegment;
    label: string;
    onCommit: (index: number, text: string) => void;
}) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [draft, setDraft] = useState(segment.text);
    const latestDraftRef = useRef(segment.text);
    const committedTextRef = useRef(segment.text);
    const commitHandlerRef = useRef(onCommit);
    const indexRef = useRef(index);

    useEffect(() => {
        commitHandlerRef.current = onCommit;
        indexRef.current = index;
    }, [index, onCommit]);

    useEffect(() => {
        if (segment.text === committedTextRef.current) return;
        committedTextRef.current = segment.text;
        if (document.activeElement === textareaRef.current) return;
        let cancelled = false;
        queueMicrotask(() => {
            if (cancelled) return;
            latestDraftRef.current = segment.text;
            setDraft(segment.text);
        });
        return () => {
            cancelled = true;
        };
    }, [segment.text]);

    const commitDraft = useCallback(() => {
        const text = latestDraftRef.current;
        if (text === committedTextRef.current) return;
        committedTextRef.current = text;
        commitHandlerRef.current(indexRef.current, text);
    }, []);

    useEffect(() => {
        if (draft === committedTextRef.current) return;
        const timer = window.setTimeout(commitDraft, 350);
        return () => window.clearTimeout(timer);
    }, [commitDraft, draft]);

    useEffect(() => () => commitDraft(), [commitDraft]);

    useLayoutEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    }, [draft]);

    return (
        <textarea
            ref={textareaRef}
            aria-label={label}
            className="w-full h-full bg-transparent text-sm text-indigo-100 placeholder-slate-400 focus:outline-none resize-none leading-relaxed whitespace-pre-wrap break-words overflow-hidden min-h-[min-content]"
            value={draft}
            onBlur={commitDraft}
            onChange={(event) => {
                const text = event.target.value;
                latestDraftRef.current = text;
                setDraft(text);
                event.target.style.height = 'auto';
                event.target.style.height = `${event.target.scrollHeight}px`;
            }}
            placeholder=""
            spellCheck={false}
            style={contentSizingStyle}
        />
    );
}

function SegmentRowComponent({
    index,
    style,
    ariaAttributes,
    labels,
    onColumnContextMenu,
    onUpdateTarget,
    sourceSegments,
    sourceSubtitlePath,
    targetSegments,
    targetSubtitlePath,
}: RowComponentProps<SegmentRowData>): ReactElement {
    const srcSeg = sourceSegments[index];
    const tgtSeg = targetSegments[index];

    return (
        <div style={style} {...ariaAttributes}>
            <div className="grid min-h-full grid-cols-2 group border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <div
                    className="p-4 border-r border-white/5 min-w-0 flex flex-col gap-2"
                    onContextMenu={(event) =>
                        onColumnContextMenu(event, labels.openSourceFolder, sourceSubtitlePath)
                    }
                >
                    {srcSeg ? (
                        <>
                            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono select-none">
                                <span className="opacity-50">#{srcSeg.id}</span>
                                <div className="flex items-center gap-1 bg-white/5 px-1.5 py-0.5 rounded text-slate-400">
                                    <Clock size={10} />
                                    {formatTime(srcSeg.start)} - {formatTime(srcSeg.end)}
                                </div>
                            </div>
                            <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                                {srcSeg.text}
                            </div>
                        </>
                    ) : (
                        <div className="h-full min-h-20 flex items-center justify-center text-xs text-slate-400 italic">
                            {labels.noSourceSegment}
                        </div>
                    )}
                </div>

                <div
                    className="p-4 min-w-0 bg-indigo-500/[0.01] relative group/edit"
                    onContextMenu={(event) =>
                        onColumnContextMenu(event, labels.openTargetFolder, targetSubtitlePath)
                    }
                >
                    {tgtSeg ? (
                        <>
                            <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-2 opacity-0 group-hover/edit:opacity-100 group-focus-within/edit:opacity-100 transition-opacity select-none absolute top-4 right-4 gap-2">
                                <span className="bg-indigo-500/10 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/20">{labels.targetLabel}</span>
                                {!srcSeg && (
                                    <span className="bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/20">
                                        {labels.generatedSegment}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono select-none mb-2">
                                <span className="opacity-50">#{tgtSeg.id}</span>
                                <div className="flex items-center gap-1 bg-indigo-500/10 px-1.5 py-0.5 rounded text-indigo-300">
                                    <Clock size={10} />
                                    {formatTime(tgtSeg.start)} - {formatTime(tgtSeg.end)}
                                </div>
                            </div>
                            <EditableTargetText
                                index={index}
                                segment={tgtSeg}
                                label={labels.targetLabel}
                                onCommit={onUpdateTarget}
                            />
                        </>
                    ) : (
                        <div className="h-full flex items-center justify-center opacity-10">
                            <span className="text-xs text-slate-400">...</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

const SegmentRow = memo(SegmentRowComponent) as typeof SegmentRowComponent;

export const SegmentsTable = ({
    sourceSegments,
    targetSegments,
    onUpdateTarget,
    onFileSelect,
    sourceSubtitlePath,
    targetSubtitlePath,
}: SegmentsTableProps) => {
    const { t } = useTranslation('translator');
    const rowCount = Math.max(sourceSegments.length, targetSegments.length);
    const dynamicRowHeight = useDynamicRowHeight({
        defaultRowHeight: 118,
        key: rowCount,
    });
    const [subtitleColumnMenu, setSubtitleColumnMenu] = useState<SubtitleColumnMenuState | null>(null);
    const menuItems = useMemo<ContextMenuItem[]>(
        () =>
            subtitleColumnMenu
                ? [
                    createOpenSubtitleFolderMenuItem({
                        label: subtitleColumnMenu.label,
                        subtitlePath: subtitleColumnMenu.subtitlePath,
                    }),
                ]
                : [],
        [subtitleColumnMenu],
    );
    const handleSubtitleColumnContextMenu = useCallback(
        (
            event: MouseEvent<HTMLDivElement>,
            params: {
                label: string;
                subtitlePath?: string | null;
            },
        ) => {
            if (!params.subtitlePath || !isDesktopRuntime()) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            setSubtitleColumnMenu({
                position: { x: event.clientX, y: event.clientY },
                label: params.label,
                subtitlePath: params.subtitlePath,
            });
        },
        [],
    );
    const labels = useMemo<SegmentRowLabels>(() => ({
        generatedSegment: t('table.generatedSegment'),
        noSourceSegment: t('table.noSourceSegment'),
        openSourceFolder: t('contextMenu.openSourceSubtitleFolder'),
        openTargetFolder: t('contextMenu.openTargetSubtitleFolder'),
        targetLabel: t('table.targetLabel'),
    }), [t]);
    const rowProps = useMemo<SegmentRowData>(() => ({
        labels,
        onColumnContextMenu: (event, label, subtitlePath) => {
            handleSubtitleColumnContextMenu(event, { label, subtitlePath });
        },
        onUpdateTarget,
        sourceSegments,
        sourceSubtitlePath,
        targetSegments,
        targetSubtitlePath,
    }), [
        handleSubtitleColumnContextMenu,
        labels,
        onUpdateTarget,
        sourceSegments,
        sourceSubtitlePath,
        targetSegments,
        targetSubtitlePath,
    ]);

    return (
        <div className="flex-1 overflow-hidden min-h-0 relative bg-black/20">
            {sourceSegments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-10">
                    <div className="max-w-md w-full">
                        <FileUploader onFileSelect={onFileSelect} currentFile={null} />
                    </div>
                </div>
            ) : (
                <List
                    className="custom-scrollbar"
                    defaultHeight={600}
                    overscanCount={6}
                    rowComponent={SegmentRow}
                    rowCount={rowCount}
                    rowHeight={dynamicRowHeight}
                    rowProps={rowProps}
                    style={{ height: '100%', width: '100%' }}
                />
            )}
            <ContextMenu
                items={menuItems}
                position={subtitleColumnMenu?.position ?? null}
                onClose={() => setSubtitleColumnMenu(null)}
            />
        </div>
    );
};
