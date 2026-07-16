import React from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import * as Icons from "lucide-react";

export function PageHead({
  eyebrow,
  title,
  desc,
  children,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  desc?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      <div className="head-actions">{children}</div>
    </div>
  );
}
export function FilterBar({
  placeholder = "Search…",
  labelOptions = [],
}: {
  placeholder?: string;
  labelOptions?: string[];
}) {
  const [params, setParams] = useSearchParams();
  const availableLabels = normalizeLabels(labelOptions).sort((a, b) =>
    a.localeCompare(b),
  );
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next);
  };
  return (
    <div className="filterbar">
      <label>
        <Icons.Search />
        <input
          placeholder={placeholder}
          value={params.get("q") || ""}
          onChange={(event) => set("q", event.target.value)}
        />
      </label>
      {availableLabels.length > 0 && (
        <label className="filter-select">
          <Icons.Tag aria-hidden="true" />
          <span className="sr-only">Filter by label</span>
          <select
            value={params.get("label") || ""}
            onChange={(event) => set("label", event.target.value)}
            aria-label="Filter by label"
          >
            <option value="">All labels</option>
            {availableLabels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        className="btn"
        onClick={() =>
          set("filter", params.get("filter") === "open" ? "" : "open")
        }
        aria-pressed={params.get("filter") === "open"}
        title="Show open items only"
      >
        <Icons.SlidersHorizontal />
        Filter
      </button>
      <button
        className="btn"
        onClick={() =>
          set("sort", params.get("sort") === "desc" ? "asc" : "desc")
        }
      >
        <Icons.ArrowUpDown />
        Sort {params.get("sort") === "desc" ? "newest" : "oldest"}
      </button>
      <button
        className="icon-btn"
        onClick={() =>
          set("view", params.get("view") === "grid" ? "list" : "grid")
        }
        aria-label="Toggle layout"
        aria-pressed={params.get("view") === "grid"}
        title={params.get("view") === "grid" ? "Use list view" : "Use grid view"}
      >
        {params.get("view") === "grid" ? <Icons.List /> : <Icons.LayoutGrid />}
      </button>
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function normalizeLabels(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.reduce<string[]>((result, value) => {
    if (typeof value !== "string") return result;
    const label = value.trim();
    const key = label.toLocaleLowerCase();
    if (!label || seen.has(key)) return result;
    seen.add(key);
    result.push(label);
    return result;
  }, []);
}

export function LabelChips({
  labels = [],
  empty,
}: {
  labels?: string[];
  empty?: React.ReactNode;
}) {
  const normalized = normalizeLabels(labels);
  if (!normalized.length) return empty ? <span>{empty}</span> : null;
  return (
    <div className="labels" aria-label="Ticket labels">
      {normalized.map((label) => (
        <Badge key={label}>{label}</Badge>
      ))}
    </div>
  );
}

export function LabelPicker({
  labels,
  suggestions = [],
  onChange,
  disabled = false,
  label = "Labels",
}: {
  labels: string[];
  suggestions?: string[];
  onChange: (labels: string[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [draft, setDraft] = React.useState("");
  const listId = `label-suggestions-${React.useId().replace(/:/g, "")}`;
  const normalizedLabels = normalizeLabels(labels);
  const availableSuggestions = normalizeLabels(suggestions).filter(
    (suggestion) =>
      !normalizedLabels.some(
        (existing) => existing.toLocaleLowerCase() === suggestion.toLocaleLowerCase(),
      ),
  );

  const remove = (labelToRemove: string) => {
    const key = labelToRemove.toLocaleLowerCase();
    onChange(
      normalizedLabels.filter((item) => item.toLocaleLowerCase() !== key),
    );
  };

  const commit = (value: string) => {
    const nextLabel = value.replace(/,$/, "").trim();
    setDraft("");
    if (!nextLabel) return;
    onChange(normalizeLabels([...normalizedLabels, nextLabel]));
  };

  return (
    <div className="label-picker">
      <span className="label-picker-title">{label}</span>
      {normalizedLabels.length > 0 && (
        <div className="label-picker-chips">
          {normalizedLabels.map((item) => (
            <span className="label-chip" key={item}>
              {item}
              {!disabled && (
                <button
                  type="button"
                  className="label-chip-remove"
                  onClick={() => remove(item)}
                  aria-label={`Remove label ${item}`}
                >
                  <Icons.X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {disabled ? (
        normalizedLabels.length === 0 && (
          <span className="label-picker-empty">No labels</span>
        )
      ) : (
        <>
          <input
            className="label-picker-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                commit(draft);
              } else if (
                event.key === "Backspace" &&
                !draft &&
                normalizedLabels.length > 0
              ) {
                remove(normalizedLabels[normalizedLabels.length - 1]);
              }
            }}
            onBlur={() => {
              if (draft.trim()) commit(draft);
            }}
            placeholder="Type a label and press Enter"
            list={listId}
            aria-label={label}
          />
          <datalist id={listId}>
            {availableSuggestions.map((suggestion) => (
              <option value={suggestion} key={suggestion} />
            ))}
          </datalist>
        </>
      )}
    </div>
  );
}
export function Avatar({ name, color }: { name: string; color?: string }) {
  return (
    <span className="avatar" style={{ background: color }} aria-hidden="true">
      {name
        .split(" ")
        .map((s) => s[0])
        .join("")
        .slice(0, 2)}
    </span>
  );
}
export function Progress({
  value,
  tone = "purple",
}: {
  value: number;
  tone?: string;
}) {
  return (
    <div
      className={`progress ${tone}`}
      role="progressbar"
      aria-label="Progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.max(0, Math.min(100, value))}
    >
      <i style={{ width: `${value}%` }} />
    </div>
  );
}
export function Empty({
  icon: Icon = Icons.Inbox,
  title,
  body,
  action,
}: {
  icon?: any;
  title: string;
  body: string;
  action?: { label: string; to: string };
}) {
  return (
    <div className="empty">
      <span>
        <Icon />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action && (
        <NavLink className="btn primary" to={action.to}>
          <Icons.ArrowRight />
          {action.label}
        </NavLink>
      )}
    </div>
  );
}

export function CardTitle({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card-title">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

