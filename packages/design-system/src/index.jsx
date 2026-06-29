/* AthLink design system — shared React primitives.
   Every sport imports from here. Do NOT hardcode colors/fonts in a sport;
   use these components and the CSS variables in tokens.css. */
import React from "react";
import "./tokens.css";

/* Token values exposed for the rare case you need them in JS (charts, canvas). */
export const tokens = {
  navy: "#13314e", navy2: "#1f4e80", accent: "#0a84ff", accent2: "#409cff",
  sky: "#e8f1fc", paper: "#eef3fb", ink: "#1d1d1f", gold: "#c8920b", link: "#0a4fb0",
  radius: "16px",
};

/* Wrap a sport portal in this so all .al-ds styles + background apply. */
export function ThemeRoot({ children, className = "", ...rest }) {
  return <div className={`al-ds ${className}`} {...rest}>{children}</div>;
}

export function Button({ variant = "ghost", className = "", ...rest }) {
  return <button className={`btn ${variant} ${className}`} {...rest} />;
}

export function Card({ hoverable = false, className = "", ...rest }) {
  return <div className={`card ${hoverable ? "hoverable" : ""} ${className}`} {...rest} />;
}

export function Panel({ className = "", ...rest }) {
  return <div className={`panel ${className}`} {...rest} />;
}

/* options: [{value,label}]  */
export function Seg({ options = [], value, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? "on" : ""} onClick={() => onChange?.(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ className = "", ...rest }) {
  return <span className={`chip ${className}`} {...rest} />;
}

export function ClassBadge({ className = "", ...rest }) {
  return <span className={`cls ${className}`} {...rest} />;
}

export function PageHeader({ title, sub }) {
  return (
    <div className="page-head">
      <h1 className="page-title">{title}</h1>
      {sub ? <p className="page-sub">{sub}</p> : null}
    </div>
  );
}

/* Standard results table.
   columns: [{key,label,align?,render?}]   rows: array of objects with an `id`. */
export function ResultsTable({ columns = [], rows = [] }) {
  return (
    <Panel>
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={c.align === "left" ? "l" : ""}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="row-hover">
              {columns.map((c) => (
                <td key={c.key} className={c.align === "left" ? "l" : ""}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
