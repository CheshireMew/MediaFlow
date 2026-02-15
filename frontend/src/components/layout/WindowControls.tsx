import { Minus, Square, X } from "lucide-react";

export function WindowControls() {
  const handleMinimize = () => {
    window.electronAPI?.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximize();
  };

  const handleClose = () => {
    window.electronAPI?.close();
  };

  return (
    <div className="flex items-center pointer-events-auto no-drag">
      <button
        onClick={handleMinimize}
        className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        title="Minimize"
      >
        <Minus size={16} />
      </button>
      <button
        onClick={handleMaximize}
        className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        title="Maximize/Restore"
      >
        <Square size={14} />
      </button>
      <button
        onClick={handleClose}
        className="p-2 hover:bg-red-600 text-slate-400 hover:text-white transition-colors group"
        title="Close"
      >
        <X size={16} className="group-hover:text-white" />
      </button>
    </div>
  );
}
