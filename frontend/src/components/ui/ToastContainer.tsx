import { useState, useEffect } from 'react';
import { toast } from '../../utils/toast';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const cleanup = toast.subscribe(({ message, type, duration = 3000 }) => {
      const id = Date.now();
      setToasts(prev => [...prev, { id, message, type }]);

      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    });

    return cleanup;
  }, []);

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const getIcon = (type: string) => {
    switch (type) {
        case 'success': return <CheckCircle size={18} />;
        case 'error': return <AlertCircle size={18} />;
        case 'warning': return <AlertTriangle size={18} />;
        default: return <Info size={18} />;
    }
  };

  const getColorClass = (type: string) => {
    switch (type) {
        case 'success': return 'bg-emerald-600 text-white';
        case 'error': return 'bg-rose-600 text-white';
        case 'warning': return 'bg-amber-500 text-white';
        default: return 'bg-slate-700 text-white';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div 
          key={t.id}
          className={`
            pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg 
            min-w-[300px] max-w-[400px] animate-in slide-in-from-right-full fade-in duration-300
            ${getColorClass(t.type)}
          `}
        >
          <div className="shrink-0">{getIcon(t.type)}</div>
          <p className="flex-1 text-sm font-medium">{t.message}</p>
          <button 
            onClick={() => removeToast(t.id)}
            className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
