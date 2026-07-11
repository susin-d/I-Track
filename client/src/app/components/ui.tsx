import type React from "react";
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
export function FilterBar({ placeholder = "Search…" }: { placeholder?: string }) {
  const [params, setParams] = useSearchParams();
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
      <button
        className="btn"
        onClick={() =>
          set("filter", params.get("filter") === "open" ? "" : "open")
        }
        aria-pressed={params.get("filter") === "open"}
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
        Sort
      </button>
      <button
        className="icon-btn"
        onClick={() =>
          set("view", params.get("view") === "grid" ? "list" : "grid")
        }
        aria-label="Toggle layout"
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
export function Avatar({ name, color }: { name: string; color?: string }) {
  return (
    <span className="avatar" style={{ background: color }}>
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
    <div className={`progress ${tone}`}>
      <i style={{ width: `${value}%` }} />
    </div>
  );
}
export function Empty({
  icon: Icon = Icons.Inbox,
  title,
  body,
}: {
  icon?: any;
  title: string;
  body: string;
}) {
  return (
    <div className="empty">
      <span>
        <Icon />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
      <NavLink className="btn primary" to="/tickets/new">
        <Icons.Plus />
        Create new
      </NavLink>
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

