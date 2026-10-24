"use client";
import { createContext, useContext, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
const ModalContext = createContext<(() => void) | null>(null);
export function useCloseModal() {
  return useContext(ModalContext);
}
export function FormModal({
  title,
  triggerLabel,
  children,
  variant = "primary",
  className = "",
  triggerIcon,
}: {
  title: string;
  triggerLabel: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  triggerIcon?: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [open, setOpen] = useState(false);
  const close = () => dialog.current?.close();
  return (
    <>
      <button
        type="button"
        className={"btn btn-" + variant + " " + className}
        aria-label={triggerIcon ? triggerLabel : undefined}
        title={triggerIcon ? triggerLabel : undefined}
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        {triggerIcon ?? triggerLabel}
      </button>
      <dialog
        aria-label={title}
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-auto rounded-2xl border-0 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/40 backdrop:backdrop-blur-sm dark:bg-slate-900 dark:text-slate-100"
      >
        <ModalContext.Provider value={close}>
          <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold">{title}</h2>
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar formulario"
              className="btn btn-ghost min-h-9 px-3 text-lg"
            >
              ×
            </button>
          </div>
          <div className="modal-content">{open && children}</div>
        </ModalContext.Provider>
      </dialog>
    </>
  );
}
export function RouteModal({
  title,
  closeHref,
  children,
}: {
  title: string;
  closeHref: string;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    router = useRouter();
  const close = () => router.push(closeHref);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={title}
      onClose={close}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-auto rounded-2xl border-0 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/40 backdrop:backdrop-blur-sm dark:bg-slate-900 dark:text-slate-100"
    >
      <ModalContext.Provider value={close}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="font-semibold">{title}</h2>
          <button
            type="button"
            onClick={close}
            className="btn btn-ghost"
            aria-label="Cerrar formulario"
          >
            ×
          </button>
        </div>
        <div className="modal-content">{children}</div>
      </ModalContext.Provider>
    </dialog>
  );
}
