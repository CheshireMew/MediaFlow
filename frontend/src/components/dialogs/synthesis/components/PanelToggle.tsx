type PanelToggleProps = {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  enableTitle: string;
  disableTitle: string;
};

export function PanelToggle({
  enabled,
  onToggle,
  enableTitle,
  disableTitle,
}: PanelToggleProps) {
  return (
    <button
      onClick={() => onToggle(!enabled)}
      className={`relative w-9 h-5 rounded-full transition-colors ${
        enabled ? "bg-indigo-500" : "bg-white/10"
      }`}
      title={enabled ? disableTitle : enableTitle}
    >
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
        enabled ? "translate-x-4" : "translate-x-0.5"
      }`} />
    </button>
  );
}

