import React, { useEffect, useRef, useState } from "react";
import { MiniDatePicker } from "./MiniDatePicker";

type DialogMode = "form" | "confirm";

export type AppDialogField = {
  name: string;
  label: string;
  type?: "text" | "password" | "number" | "date" | "textarea" | "select";
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
};

type DialogOptions = {
  mode: DialogMode;
  message?: string;
  fields?: AppDialogField[];
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type DialogRequest = {
  options: DialogOptions;
  resolve: (value: Record<string, string> | boolean | null) => void;
};

type DialogListener = (request: DialogRequest) => void;

const listeners = new Set<DialogListener>();

function requestDialog(options: DialogOptions) {
  return new Promise<Record<string, string> | boolean | null>((resolve) => {
    if (!listeners.size) {
      resolve(options.mode === "confirm" ? false : null);
      return;
    }
    listeners.forEach((listener) => listener({ options, resolve }));
  });
}

export function appForm(options: Omit<DialogOptions, "mode"> & { fields: AppDialogField[] }) {
  return requestDialog({ mode: "form", ...options }) as Promise<Record<string, string> | null>;
}

export function appPrompt(
  message: string,
  defaultValue = "",
  options: Pick<DialogOptions, "title" | "confirmLabel" | "cancelLabel"> & { inputType?: AppDialogField["type"] } = {},
) {
  return appForm({
    ...options,
    message,
    fields: [{ name: "value", label: message, defaultValue, type: options.inputType, required: true }],
  }).then((values) => values?.value ?? null);
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
  const dialogRef = useRef<HTMLFormElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [dateValues, setDateValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const listener: DialogListener = (request) => setQueue((current) => [...current, request]);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    // Set initial date values
    const initialDates: Record<string, string> = {};
    (active.options.fields || []).forEach((field) => {
      if (field.type === "date") {
        initialDates[field.name] = field.defaultValue || "";
      }
    });
    setDateValues(initialDates);

    const firstField = dialogRef.current?.querySelector<HTMLElement>("[data-dialog-autofocus]");
    (firstField || confirmRef.current)?.focus();
    if (firstField instanceof HTMLInputElement) firstField.select();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        active.resolve(active.options.mode === "confirm" ? false : null);
        setQueue((current) => current.slice(1));
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button, input, select, textarea");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active]);

  if (!active) return null;

  const { options } = active;
  const close = (value: Record<string, string> | boolean | null) => {
    active.resolve(value);
    setQueue((current) => current.slice(1));
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (options.mode === "confirm") {
      close(true);
      return;
    }
    const formData = new FormData(dialogRef.current || undefined);
    const values = Object.fromEntries(
      (options.fields || []).map((field) => {
        if (field.type === "date") {
          return [field.name, dateValues[field.name] || ""];
        }
        return [field.name, formData.get(field.name)?.toString() || ""];
      }),
    );
    close(values);
  };

  return (
    <div
      className="modal-wrap app-dialog-wrap"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close(options.mode === "confirm" ? false : null)}
    >
      <form
        ref={dialogRef}
        className={`card app-dialog ${options.mode === "confirm" ? "app-dialog-confirm" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        onSubmit={submit}
      >
        <div className="app-dialog-brand">I-TRACK <span>asks</span></div>
        <h2 id="app-dialog-title">{options.title || (options.mode === "confirm" ? "Confirm action" : "Input required")}</h2>
        {options.message && <p className="app-dialog-message">{options.message}</p>}
        {options.mode === "form" && (
          <div className="app-dialog-fields">
            {(options.fields || []).map((field, index) => {
              if (field.type === "textarea") {
                return (
                  <label className="app-dialog-field" key={field.name}>
                    <span>{field.label}{field.required ? <b aria-hidden="true"> *</b> : null}</span>
                    <textarea
                      className="app-dialog-input app-dialog-textarea"
                      name={field.name}
                      defaultValue={field.defaultValue || ""}
                      placeholder={field.placeholder}
                      required={field.required}
                      data-dialog-autofocus={index === 0 ? "true" : undefined}
                    />
                  </label>
                );
              }
              if (field.type === "select") {
                return (
                  <label className="app-dialog-field" key={field.name}>
                    <span>{field.label}{field.required ? <b aria-hidden="true"> *</b> : null}</span>
                    <select
                      className="app-dialog-input"
                      name={field.name}
                      defaultValue={field.defaultValue || ""}
                      required={field.required}
                      data-dialog-autofocus={index === 0 ? "true" : undefined}
                    >
                      {(field.options || []).map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                );
              }
              if (field.type === "date") {
                return (
                  <div className="app-dialog-field" key={field.name}>
                    <MiniDatePicker
                      name={field.name}
                      label={field.label + (field.required ? " *" : "")}
                      value={dateValues[field.name] || ""}
                      onChange={(val) => setDateValues((prev) => ({ ...prev, [field.name]: val }))}
                      required={field.required}
                    />
                  </div>
                );
              }
              return (
                <label className="app-dialog-field" key={field.name}>
                  <span>{field.label}{field.required ? <b aria-hidden="true"> *</b> : null}</span>
                  <input
                    className="app-dialog-input"
                    name={field.name}
                    type={field.type || "text"}
                    defaultValue={field.defaultValue || ""}
                    placeholder={field.placeholder}
                    required={field.required}
                    data-dialog-autofocus={index === 0 ? "true" : undefined}
                  />
                </label>
              );
            })}
          </div>
        )}
        <div className="app-dialog-actions">
          <button type="button" className="btn app-dialog-cancel" onClick={() => close(options.mode === "confirm" ? false : null)}>
            {options.cancelLabel || "Cancel"}
          </button>
          <button ref={confirmRef} type="submit" className="btn primary app-dialog-confirm-button">
            {options.confirmLabel || "OK"}
          </button>
        </div>
      </form>
    </div>
  );
}

