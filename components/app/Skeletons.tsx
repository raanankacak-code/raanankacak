/**
 * Loading placeholders, shaped like the screens they stand in for.
 *
 * Server components — there is nothing interactive about a placeholder, and
 * keeping them off the client bundle matters most on exactly the slow
 * connection that makes them visible in the first place.
 *
 * They are deliberately approximate. A skeleton that tries to predict the
 * exact row count guesses wrong and makes the swap jarring; one that matches
 * the page's overall shape reads as "this is loading" and gets out of the way.
 */

export function SkeletonTopbar({ withSub = true }: { withSub?: boolean }) {
  return (
    <div className="topbar" aria-hidden="true">
      <div className="sk sk-title" />
      {withSub && (
        <div className="sub">
          <div className="sk sk-sub" />
        </div>
      )}
    </div>
  );
}

export function SkeletonKpis({ count = 4 }: { count?: number }) {
  return (
    <div className="kpis" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="kpi" key={i}>
          <div className="sk" style={{ height: 11, width: "58%" }} />
          <div className="sk" style={{ height: 24, width: "42%", marginTop: 8 }} />
          <div className="sk" style={{ height: 11, width: "76%", marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

/** A card of table-ish rows. `cols` sets how many cells each row shows. */
export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  // Uneven widths, because a grid of identical bars looks like a broken
  // layout rather than content on its way.
  const widths = ["34%", "18%", "22%", "14%", "20%", "16%"];
  return (
    <div className="card sk-pad" aria-hidden="true">
      {Array.from({ length: rows }, (_, r) => (
        <div className="sk-row" key={r}>
          {Array.from({ length: cols }, (_, c) => (
            <div className="sk" key={c} style={{ width: widths[(r + c) % widths.length], flex: c === 0 ? 1 : "none" }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The whole screen, for pages that are a heading plus a list.
 *
 * `aria-busy` on the wrapper is the part that matters for anyone not looking
 * at it: the individual bars are aria-hidden decoration, so without this a
 * screen reader would find an empty page and say nothing at all.
 */
export function SkeletonPage({
  kpis = 0,
  rows = 6,
  cols = 4,
}: {
  kpis?: number;
  rows?: number;
  cols?: number;
}) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <SkeletonTopbar />
      {kpis > 0 && <SkeletonKpis count={kpis} />}
      <SkeletonTable rows={rows} cols={cols} />
    </div>
  );
}
