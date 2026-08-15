import { useEffect, type ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* A sheet on phones, a centered dialog from `sm` up. The height cap uses
          dvh so iOS Safari's collapsing address bar can't push the submit
          button off-screen, and the body scrolls inside the sheet rather than
          the page scrolling behind it. */}
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:max-h-[85dvh] sm:rounded-2xl dark:bg-slate-800">
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}
