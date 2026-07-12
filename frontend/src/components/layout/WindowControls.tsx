import { Minus, Square, X } from "lucide-react";
import { windowService } from "../../services/desktop";
import { useTranslation } from "react-i18next";

export function WindowControls() {
  const { t } = useTranslation("common");
  const handleMinimize = () => {
    windowService.minimize();
  };

  const handleMaximize = () => {
    windowService.maximize();
  };

  const handleClose = () => {
    windowService.close();
  };

  return (
    <div className="flex items-center pointer-events-auto no-drag">
      <button
        type="button"
        aria-label={t("windowControls.minimize")}
        onClick={handleMinimize}
        className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        title={t("windowControls.minimize")}
      >
        <Minus size={16} />
      </button>
      <button
        type="button"
        aria-label={t("windowControls.maximize")}
        onClick={handleMaximize}
        className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        title={t("windowControls.maximize")}
      >
        <Square size={14} />
      </button>
      <button
        type="button"
        aria-label={t("windowControls.close")}
        onClick={handleClose}
        className="p-2 hover:bg-red-600 text-slate-400 hover:text-white transition-colors group"
        title={t("windowControls.close")}
      >
        <X size={16} className="group-hover:text-white" />
      </button>
    </div>
  );
}
