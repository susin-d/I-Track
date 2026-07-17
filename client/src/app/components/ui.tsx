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
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const normalizedLabels = normalizeLabels(labels);
  const normalizedSuggestions = normalizeLabels(suggestions);

  // Close dropdown on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setDraft("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (option: string) => {
    const key = option.toLocaleLowerCase();
    const already = normalizedLabels.some((l) => l.toLocaleLowerCase() === key);
    if (already) {
      onChange(normalizedLabels.filter((l) => l.toLocaleLowerCase() !== key));
    } else {
      onChange(normalizeLabels([...normalizedLabels, option]));
    }
  };

  const remove = (labelToRemove: string) => {
    const key = labelToRemove.toLocaleLowerCase();
    onChange(normalizedLabels.filter((item) => item.toLocaleLowerCase() !== key));
  };

  const commitDraft = (value: string) => {
    const nextLabel = value.replace(/,$/, "").trim();
    setDraft("");
    if (!nextLabel) return;
    onChange(normalizeLabels([...normalizedLabels, nextLabel]));
  };

  // Filtered suggestions for search
  const filtered = normalizedSuggestions.filter((s) =>
    s.toLocaleLowerCase().includes(draft.toLocaleLowerCase()),
  );

  return (
    <div className="label-picker" ref={wrapperRef}>
      <span className="label-picker-title">{label}</span>

      {/* Trigger button that looks like a dropdown */}
      {disabled ? (
        normalizedLabels.length === 0 ? (
          <span className="label-picker-empty">No labels</span>
        ) : (
          <div className="label-picker-chips">
            {normalizedLabels.map((item) => (
              <span className="label-chip" key={item}>{item}</span>
            ))}
          </div>
        )
      ) : (
        <div className="label-dropdown-trigger-wrap">
          <button
            type="button"
            className={`label-dropdown-trigger${open ? " open" : ""}`}
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <span className="label-dropdown-trigger-text">
              {normalizedLabels.length > 0 ? (
                <span className="label-picker-chips label-picker-chips--inline">
                  {normalizedLabels.map((item) => (
                    <span className="label-chip label-chip--sm" key={item}>
                      {item}
                      <span
                        role="button"
                        tabIndex={0}
                        className="label-chip-remove"
                        onClick={(e) => { e.stopPropagation(); remove(item); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); remove(item); } }}
                        aria-label={`Remove label ${item}`}
                      >
                        <Icons.X size={10} />
                      </span>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="label-dropdown-placeholder">Select labels…</span>
              )}
            </span>
            <Icons.ChevronDown size={14} className="label-dropdown-chevron" />
          </button>

          {open && (
            <div className="label-dropdown-panel" role="listbox" aria-multiselectable="true" aria-label={label}>
              {/* Search input inside panel */}
              <div className="label-dropdown-search">
                <Icons.Search size={13} />
                <input
                  autoFocus
                  className="label-dropdown-search-input"
                  placeholder="Search or create label…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (draft.trim()) {
                        commitDraft(draft);
                      }
                    } else if (e.key === "Escape") {
                      setOpen(false);
                      setDraft("");
                    }
                  }}
                />
              </div>

              <div className="label-dropdown-options">
                {filtered.length === 0 && draft.trim() ? (
                  <button
                    type="button"
                    className="label-dropdown-option label-dropdown-create"
                    onMouseDown={(e) => { e.preventDefault(); commitDraft(draft); }}
                  >
                    <Icons.Plus size={13} />
                    Create <strong>"{draft.trim()}"</strong>
                  </button>
                ) : filtered.length === 0 ? (
                  <span className="label-dropdown-empty">No labels available</span>
                ) : (
                  filtered.map((option) => {
                    const checked = normalizedLabels.some(
                      (l) => l.toLocaleLowerCase() === option.toLocaleLowerCase()
                    );
                    return (
                      <button
                        type="button"
                        key={option}
                        role="option"
                        aria-selected={checked}
                        className={`label-dropdown-option${checked ? " selected" : ""}`}
                        onMouseDown={(e) => { e.preventDefault(); toggle(option); }}
                      >
                        <span className="label-dropdown-check">
                          {checked && <Icons.Check size={11} />}
                        </span>
                        {option}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
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
  icon,
}: {
  title: string;
  body?: string;
  action?: { label: string; to: string };
  icon?: React.ComponentType<any>;
}) {
  let Icon = icon;
  if (!Icon) {
    const t = title.toLowerCase();
    if (t.includes("notification")) Icon = Icons.Bell;
    else if (t.includes("audit")) Icon = Icons.Activity;
    else if (t.includes("integration")) Icon = Icons.Webhook;
    else if (t.includes("group")) Icon = Icons.Users;
    else if (t.includes("work")) Icon = Icons.CheckSquare;
    else if (t.includes("sprint")) Icon = Icons.Timer;
    else if (t.includes("cycle")) Icon = Icons.Repeat2;
    else if (t.includes("session")) Icon = Icons.Monitor;
    else if (t.includes("ticket") || t.includes("issue")) Icon = Icons.Ticket;
    else if (t.includes("access") || t.includes("administrator")) Icon = Icons.ShieldAlert;
    else if (t.includes("release")) Icon = Icons.Rocket;
    else if (t.includes("epic")) Icon = Icons.Map;
    else if (t.includes("workflow")) Icon = Icons.GitBranch;
    else if (t.includes("rule") || t.includes("automation")) Icon = Icons.Zap;
    else Icon = Icons.FolderOpen;
  }

  return (
    <div className="empty-state-container">
      <div className="empty-state-icon-wrapper">
        <Icon size={28} className="empty-state-icon" />
      </div>
      <h3>{title}</h3>
      {body && <p className="empty-state-body">{body}</p>}
      <div className="empty-state-actions">
        {action ? (
          <NavLink className="btn primary" to={action.to}>
            <Icons.ArrowRight size={16} />
            {action.label}
          </NavLink>
        ) : (
          <div className="empty-state-suggestions">
            <NavLink to="/dashboard" className="suggestion-link">
              <Icons.LayoutDashboard size={14} /> Go to Dashboard
            </NavLink>
            <NavLink to="/tickets" className="suggestion-link">
              <Icons.Search size={14} /> Search Tickets
            </NavLink>
          </div>
        )}
      </div>
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

export function ModalOverlay({
  onClose,
  children,
  className = "modal-wrap",
  ariaLabel = "Dialog",
}: {
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className={className}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {children}
    </div>
  );
}

export function UnitInput({
  unit,
  className = "",
  children,
}: {
  unit: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`unit-input ${className}`.trim()}>
      {children}
      <span>{unit}</span>
    </div>
  );
}

