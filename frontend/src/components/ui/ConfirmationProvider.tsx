import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "./Dialog";
import {
  ConfirmationContext,
  type ConfirmationOptions,
} from "./confirmationContext";

type ConfirmationRequest = {
  id: number;
  options: ConfirmationOptions;
  resolve: (confirmed: boolean) => void;
};

let nextConfirmationId = 1;

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");
  const [requests, setRequests] = useState<ConfirmationRequest[]>([]);
  const requestsRef = useRef(requests);
  const titleId = useId();
  const messageId = useId();
  requestsRef.current = requests;

  useEffect(() => () => {
    requestsRef.current.forEach((request) => request.resolve(false));
  }, []);

  const confirm = useCallback((options: ConfirmationOptions) => (
    new Promise<boolean>((resolve) => {
      setRequests((current) => [
        ...current,
        { id: nextConfirmationId++, options, resolve },
      ]);
    })
  ), []);

  const current = requests[0] ?? null;
  const settleCurrent = (confirmed: boolean) => {
    if (!current) return;
    current.resolve(confirmed);
    setRequests((queued) => queued.filter((request) => request.id !== current.id));
  };

  return (
    <ConfirmationContext.Provider value={confirm}>
      {children}
      <Dialog
        open={Boolean(current)}
        onClose={() => settleCurrent(false)}
        ariaLabelledBy={titleId}
        ariaDescribedBy={messageId}
        overlayClassName="z-[10000] bg-black/70 p-4 backdrop-blur-sm"
        className="w-full max-w-md overflow-hidden rounded-lg border border-white/10 bg-[#1a1a1a] shadow-2xl ring-1 ring-white/5"
      >
        {current && (
          <>
            <div className="border-b border-white/5 px-6 py-4">
              <h2 id={titleId} className="text-lg font-semibold text-white">
                {current.options.title ?? t("confirm")}
              </h2>
            </div>
            <p id={messageId} className="px-6 py-5 text-sm leading-6 text-slate-300">
              {current.options.message}
            </p>
            <div className="flex justify-end gap-3 border-t border-white/5 bg-white/[0.02] px-6 py-4">
              <button
                type="button"
                data-dialog-initial-focus
                onClick={() => settleCurrent(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                {current.options.cancelLabel ?? t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => settleCurrent(true)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1a1a] ${
                  current.options.tone === "danger"
                    ? "bg-rose-600 hover:bg-rose-500 focus-visible:ring-rose-400"
                    : "bg-indigo-600 hover:bg-indigo-500 focus-visible:ring-indigo-400"
                }`}
              >
                {current.options.confirmLabel ?? t("confirm")}
              </button>
            </div>
          </>
        )}
      </Dialog>
    </ConfirmationContext.Provider>
  );
}
