import { Upload, FileVideo } from 'lucide-react';
import { useRef } from 'react';

interface FileUploaderProps {
    onFileSelect: (path: string) => void;
    currentFile: string | null;
}

export const FileUploader = ({ onFileSelect, currentFile }: FileUploaderProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && window.electronAPI) {
            // Electron exposes path property on File object in main process usually, 
            // but in renderer 'path' property is standard for Electron apps if webSecurity is false or specific setup.
            // Assuming window.electronAPI handles the path or the File object has 'path' (standard in Electron renderer).
            const filePath = (file as any).path; 
            if (filePath) onFileSelect(filePath);
        }
    };

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
             const filePath = (file as any).path;
             if (filePath) onFileSelect(filePath);
        }
    };

    return (
        <div 
            className="border-2 border-dashed border-zinc-700 rounded-lg p-8 text-center hover:border-zinc-500 transition-colors cursor-pointer bg-zinc-900/50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={handleClick}
        >
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".srt,.vtt,.mp4,.mp3,.wav,.mkv" 
                onChange={handleInput}
            />
            
            {currentFile ? (
                <div className="flex flex-col items-center gap-2 text-zinc-300">
                     <FileVideo className="w-8 h-8 text-blue-400" />
                     <p className="font-medium truncate max-w-md">{currentFile}</p>
                     <p className="text-xs text-zinc-500">Click or Drag to replace</p>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-2 text-zinc-400">
                    <Upload className="w-8 h-8" />
                    <p className="font-medium">Drag & Drop Video/SRT here</p>
                    <p className="text-xs text-zinc-500">Support .srt, .mp4, .mp3, .wav</p>
                </div>
            )}
        </div>
    );
};
