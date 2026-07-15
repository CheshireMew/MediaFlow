import React from 'react';
import { Clock, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TaskTraceItem } from '../types/task';

interface TaskTraceViewProps {
  trace: TaskTraceItem[];
}

export const TaskTraceView: React.FC<TaskTraceViewProps> = ({ trace }) => {
  const { t } = useTranslation("taskmonitor");
  if (!trace || trace.length === 0) return null;

  return (
    <div style={{ marginTop: 10, background: '#111', borderRadius: 8, padding: 10, fontSize: '0.85em' }}>
      <div style={{ marginBottom: 5, color: '#888', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Clock size={12} />
        <span>{t("trace.title")}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px', gap: 8, color: '#ccc' }}>
        {trace.map((item, idx) => (
          <React.Fragment key={idx}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {item.status === 'success' ? <CheckCircle size={12} color="#10b981" /> : 
               item.status === 'failed' ? <AlertCircle size={12} color="#ef4444" /> :
               <XCircle size={12} color="#f59e0b" />}
              <span>{item.step}</span>
            </div>
            <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>
              {item.duration.toFixed(2)}s
            </div>
            <div style={{ 
               color: item.status === 'success' ? '#10b981' : item.status === 'failed' ? '#ef4444' : '#888',
               textTransform: 'capitalize' 
            }}>
              {t(`trace.status.${item.status}`, { defaultValue: item.status })}
            </div>
            {item.error && (
               <div style={{ gridColumn: '1 / -1', color: '#ef4444', paddingLeft: 20, fontSize: '0.9em' }}>
                  {t("trace.error", { error: item.error })}
               </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
