import { ReactNode } from "react";

type AppModalProps = {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidthClassName?: string;
  bodyClassName?: string;
  panelClassName?: string;
  closeAriaLabel?: string;
};

export function AppModal({
  title,
  onClose,
  children,
  footer,
  maxWidthClassName = "max-w-2xl",
  bodyClassName = "",
  panelClassName = "",
  closeAriaLabel = "Close modal"
}: AppModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-0 sm:p-4">
      <div
        className={`mobile-popup-panel flex h-full w-full max-w-none flex-col overflow-hidden rounded-none bg-white shadow-xl ring-0 sm:h-auto sm:max-h-[86vh] sm:rounded-2xl sm:ring-1 sm:ring-slate-200 ${maxWidthClassName} ${panelClassName}`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-6">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={closeAriaLabel}
          >
            ✕
          </button>
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 ${bodyClassName}`}>{children}</div>

        {footer ? <div className="shrink-0 border-t border-slate-100 px-4 py-4 sm:px-6">{footer}</div> : null}
      </div>
    </div>
  );
}
