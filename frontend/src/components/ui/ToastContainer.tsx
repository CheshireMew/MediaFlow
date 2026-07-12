import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../../utils/toast';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import {
  subscribePersistenceHealth,
  type PersistenceFailureScope,
} from '../../services/persistence/persistenceHealth';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

let nextToastId = 1;

export function ToastContainer() {
  const { t } = useTranslation('common');
  const translateRef = useRef(t);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef(new Map<number, number>());

  useEffect(() => {
    translateRef.current = t;
  }, [t]);

  useEffect(() => {
    const timers = timersRef.current;
    const cleanup = toast.subscribe(({ message, type, duration = 3000 }) => {
      const id = nextToastId++;
      setToasts(prev => [...prev, { id, message, type }]);

      const timer = window.setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
        timers.delete(id);
      }, duration);
      timers.set(id, timer);
    });

    return () => {
      cleanup();
      timers.forEach(timer => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    const failureKeys: Record<PersistenceFailureScope, string> = {
      'workspace-read': 'persistence.workspaceReadFailed',
      'workspace-write': 'persistence.workspaceWriteFailed',
      'preferences-write': 'persistence.preferencesWriteFailed',
    };

    return subscribePersistenceHealth((event) => {
      if (event.status === 'failed') {
        toast.error(translateRef.current(failureKeys[event.scope]), 10_000);
        return;
      }
      toast.success(translateRef.current('persistence.recovered'), 5_000);
    });
  }, []);

  const removeToast = (id: number) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timersRef.current.delete(id);
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
      {toasts.map(toastItem => (
        <div 
          key={toastItem.id}
          role={toastItem.type === 'error' ? 'alert' : 'status'}
          className={`
            pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg 
            min-w-[300px] max-w-[400px] animate-in slide-in-from-right-full fade-in duration-300
            ${getColorClass(toastItem.type)}
          `}
        >
          <div className="shrink-0" aria-hidden="true">{getIcon(toastItem.type)}</div>
          <p className="flex-1 text-sm font-medium">{toastItem.message}</p>
          <button 
            type="button"
            aria-label={t('close')}
            onClick={() => removeToast(toastItem.id)}
            className="shrink-0 opacity-70 hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
