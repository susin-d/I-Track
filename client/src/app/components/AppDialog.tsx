import React, { useEffect, useRef, useState } from "react";

type DialogMode = "prompt" | "confirm";

type DialogOptions = {
  mode: DialogMode;
  message: string;
  defaultValue?: string;
  inputType?: "text" | "password" | "number";
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type DialogRequest = {
  options: DialogOptions;
  resolve: (value: string | boolean | null) => void;
};

type DialogListener = (request: DialogRequest) => void;

const listeners = new Set<DialogListener>();

function requestDialog(options: DialogOptions) {
  return new Promise<string | boolean | null>((resolve) => {
    if (!listeners.size) {
      resolve(options.mode === "confirm" ? false : null);
      return;
    }
    listeners.forEach((listener) => listener({ options, resolve }));
  });
}

export function appPrompt(
  message: string,
  defaultValue = "",
  options: Pick<DialogOptions, "inputType" | "title" | "confirmLabel" | "cancelLabel"> = {},
) {
  return requestDialog({ mode: "prompt", message, defaultValue, ...options }) as Promise<string | null>;
}

export function appConfirm(
  message: string,
  options: Pick<DialogOptions, "title" | "confirmLabel" | "cancelLabel"> = {},
) {
  return requestDialog({ mode: "confirm", message, ...options }) as Promise<boolean>;
}

export function AppDialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const active = queue[0];
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const listener: DialogListener = (request) => setQueue((current) => [...current, request]);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  useEffect(() => {
    if (!active) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [active]);

  if (!active) return null;

  const { options } = active;
  const close = (value: string | boolean | null) => {
    active.resolve(value);
    setQueue((current) => current.slice(1));
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    close(options.mode === "confirm" ? true : inputRef.current?.value || "");
  };

  return (
    <div
      className="modal-wrap app-dialog-wrap"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close(options.mode === "confirm" ? false : null)}
    >
      <form
        className={`card app-dialog ${options.mode === "confirm" ? "app-dialog-confirm" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        onSubmit={submit}
      >
        <div className="app-dialog-brand">I-TRACK <span>asks</span></div>
        <h2 id="app-dialog-title">{options.title || (options.mode === "confirm" ? "Confirm action" : "Input required")}</h2>
        <p className="app-dialog-message">{options.message}</p>
        {options.mode === "prompt" && (
          <input
            ref={inputRef}
            className="app-dialog-input"
            type={options.inputType || "text"}
            defaultValue={options.defaultValue || ""}
            aria-label={options.message}
          />
        )}
        <div className="app-dialog-actions">
          <button type="button" className="btn app-dialog-cancel" onClick={() => close(options.mode === "confirm" ? false : null)}>
            {options.cancelLabel || "Cancel"}
          </button>
          <button type="submit" className="btn primary app-dialog-confirm-button">
            {options.confirmLabel || "OK"}
          </button>
        </div>
      </form>
    </div>
  );
}
