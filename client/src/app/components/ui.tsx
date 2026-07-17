import React from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
  const filterKeys = ["q", "label", "filter", "sort"];
  const hasFilters = filterKeys.some((key) => Boolean(params.get(key)) && !(key === "sort" && params.get(key) === "asc"));
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next);
  };
  const clearFilters = () => {
    const next = new URLSearchParams(params);
    filterKeys.forEach((key) => next.delete(key));
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
      <label className="filter-dropdown">
        <Icons.SlidersHorizontal aria-hidden="true" />
        <span className="sr-only">Filter</span>
        <select
          value={params.get("filter") || ""}
          onChange={(event) => set("filter", event.target.value)}
          aria-label="Filter"
        >
          <option value="">Filter: All</option>
          <option value="open">Filter: Open</option>
        </select>
      </label>
      <label className="filter-dropdown">
        <Icons.ArrowUpDown aria-hidden="true" />
        <span className="sr-only">Sort</span>
        <select
          value={params.get("sort") || "asc"}
          onChange={(event) => set("sort", event.target.value)}
          aria-label="Sort"
        >
          <option value="asc">Sort: Oldest</option>
          <option value="desc">Sort: Newest</option>
        </select>
      </label>
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
      {hasFilters && (
        <button className="text-btn filter-clear" onClick={clearFilters}>
          <Icons.RotateCcw />
          Clear filters
        </button>
      )}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "purple",
  to,
}: {
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  icon?: LucideIcon;
  tone?: string;
  to?: string;
}) {
  const content = (
    <>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{sub}</small>
      </div>
      {Icon && (
        <b className={tone}>
          <Icon />
        </b>
      )}
      {to && <Icons.ArrowUpRight className="metric-link-arrow" aria-hidden="true" />}
    </>
  );

  return to ? (
    <NavLink className="metric metric-link" to={to}>
      {content}
    </NavLink>
  ) : (
    <article className="metric">{content}</article>
  );
}

export function ViewToggle({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; icon?: LucideIcon }>;
}) {
  return (
    <div className="segmented" role="group" aria-label="View options">
      {options.map(({ value: optionValue, label, icon: Icon }) => (
        <button
          key={optionValue}
          className={value === optionValue ? "active" : ""}
          onClick={() => onChange(optionValue)}
          aria-pressed={value === optionValue}
        >
          {Icon && <Icon />}
          {label}
        </button>
      ))}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state-panel loading-state" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <b>{label}</b>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  body,
  action,
}: {
  title?: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="state-panel error-state" role="alert">
      <Icons.AlertCircle aria-hidden="true" />
      <b>{title}</b>
      {body && <p>{body}</p>}
      {action}
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
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: { label: string; to: string };
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {body && <p>{body}</p>}
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

