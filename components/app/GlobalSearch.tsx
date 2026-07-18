"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { SearchIcon } from "@/components/app/icons";

type SearchItem = { icon: string; title: string; sub: string; category: string; href: string };
type SearchGroup = { category: string; items: SearchItem[] };

const RECENT_KEY = "bw_recent_searches";

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
}

function highlight(text: string, q: string) {
  if (!q.trim()) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export default function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [sel, setSel] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      queueMicrotask(() => setGroups([]));
      return;
    }
    const t = setTimeout(async () => {
      try {
        const data = await apiFetch<{ groups: SearchGroup[] }>(`/api/search?q=${encodeURIComponent(q.trim())}`);
        setGroups(data.groups);
        setSel(-1);
      } catch {
        setGroups([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const flat = groups.flatMap((g) => g.items);

  function go(item: SearchItem) {
    const query = q.trim();
    if (query) {
      const next = [query, ...recent.filter((r) => r !== query)];
      setRecent(next);
      saveRecent(next);
    }
    setOpen(false);
    setQ("");
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && sel >= 0 && flat[sel]) {
      go(flat[sel]);
    }
  }

  return (
    <div className="gs-wrap" ref={rootRef}>
      <div className="gs-box">
        <SearchIcon />
        <input
          ref={inputRef}
          placeholder="Search projects, workers, reports, requests, documents, users…"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-controls="gs-panel"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Global search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <span className="gs-kbd">Ctrl K</span>
        {q && (
          <button className="gs-x" aria-label="Clear search" onClick={() => setQ("")}>
            ✕
          </button>
        )}
      </div>
      {open && (
        <div className="gs-panel" id="gs-panel">
          {!q.trim() ? (
            recent.length ? (
              <>
                <div className="gs-cat">Recent searches</div>
                {recent.map((r, i) => (
                  <button key={i} className="gs-item" onClick={() => setQ(r)}>
                    <div className="g-ic">🕘</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="g-t">{r}</div>
                    </div>
                    <span className="g-c">Recent</span>
                  </button>
                ))}
                <div className="gs-foot">
                  <span>↑↓ to navigate · Enter to open · Esc to close</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setRecent([]);
                      saveRecent([]);
                    }}
                  >
                    Clear recent
                  </button>
                </div>
              </>
            ) : (
              <div className="gs-empty">
                <b>Search your workspace</b>Try &ldquo;cement&rdquo;, a worker&rsquo;s name, or a document name.
              </div>
            )
          ) : flat.length === 0 ? (
            <div className="gs-empty">
              <b>No results found</b>Nothing matches &ldquo;{q.trim().slice(0, 40)}&rdquo; in your workspace. Try a different keyword.
            </div>
          ) : (
            <>
              {(() => {
                let i = -1;
                return groups.map((g) => (
                  <div key={g.category}>
                    <div className="gs-cat">{g.category}</div>
                    {g.items.map((it) => {
                      i += 1;
                      const idx = i;
                      return (
                        <button
                          key={idx}
                          className={`gs-item${idx === sel ? " sel" : ""}`}
                          onClick={() => go(it)}
                          onMouseMove={() => setSel(idx)}
                        >
                          <div className="g-ic">{it.icon}</div>
                          <div style={{ minWidth: 0 }}>
                            <div className="g-t">{highlight(it.title, q.trim())}</div>
                            <div className="g-s">{highlight(it.sub, q.trim())}</div>
                          </div>
                          <span className="g-c">{it.category}</span>
                        </button>
                      );
                    })}
                  </div>
                ));
              })()}
              <div className="gs-foot">
                <span>
                  {flat.length} result{flat.length === 1 ? "" : "s"}
                </span>
                <span>↑↓ · Enter · Esc</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
