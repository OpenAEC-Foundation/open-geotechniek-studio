import { useState, useRef, useEffect } from "react";
import { OaIcon } from "./icons/oaIcon";

interface Option {
  value: string;
  label: string;
}

interface ThemedSelectProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  style?: React.CSSProperties;
}

export default function ThemedSelect({ value, options, onChange, style }: ThemedSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="themed-select" ref={ref} style={style}>
      <button className="themed-select-trigger" onClick={() => setOpen(!open)}>
        <span className="themed-select-label">{selected?.label ?? value}</span>
        <OaIcon id="ui.dropdown" className="themed-select-chevron" />
      </button>
      {open && (
        <div className="themed-select-menu">
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`themed-select-item${value === opt.value ? " active" : ""}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
