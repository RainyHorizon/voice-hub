import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle } from "lucide-react";
import { useDialogAccessibility } from "../../hooks/useDialogAccessibility";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmRequest = ConfirmOptions & {
  resolve: (accepted: boolean) => void;
};

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const requestRef = useRef<ConfirmRequest | null>(null);

  const finish = useCallback((accepted: boolean) => {
    const current = requestRef.current;
    if (!current) return;
    requestRef.current = null;
    setRequest(null);
    current.resolve(accepted);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    if (requestRef.current) requestRef.current.resolve(false);
    return new Promise<boolean>((resolve) => {
      const next = { ...options, resolve };
      requestRef.current = next;
      setRequest(next);
    });
  }, []);

  useEffect(
    () => () => {
      requestRef.current?.resolve(false);
      requestRef.current = null;
    },
    [],
  );

  const dialogRef = useDialogAccessibility<HTMLDivElement>(Boolean(request), () => finish(false));

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <div
          className="confirm-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) finish(false);
          }}
        >
          <div
            ref={dialogRef}
            className={request.destructive ? "confirm-dialog destructive" : "confirm-dialog"}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="global-confirm-title"
            aria-describedby={request.description ? "global-confirm-description" : undefined}
            tabIndex={-1}
          >
            <div className="confirm-icon" aria-hidden="true">
              <AlertTriangle size={21} />
            </div>
            <div className="confirm-copy">
              <h3 id="global-confirm-title">{request.title}</h3>
              {request.description && <p id="global-confirm-description">{request.description}</p>}
            </div>
            <div className="confirm-actions">
              <button className="secondary-button" type="button" onClick={() => finish(false)} autoFocus>
                {request.cancelLabel || "取消"}
              </button>
              <button
                className={request.destructive ? "confirm-button destructive" : "confirm-button"}
                type="button"
                onClick={() => finish(true)}
              >
                {request.confirmLabel || "确认"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

// 与 Provider 同文件导出，便于业务组件只依赖一个入口。
// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm 必须在 <ConfirmProvider> 内使用");
  return confirm;
}
