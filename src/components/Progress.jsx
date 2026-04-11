function fmtBytes(n) {
  if (!n) return "";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + " GB";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + " MB";
  return (n / 1e3).toFixed(0) + " KB";
}

export default function Progress({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="w-full max-w-md space-y-2">
      {items.map(({ file, progress, status, loaded, total }) => {
        const isDone = status === "done";
        const hasTotal = total > 0;
        const pct = isDone ? 100 : (hasTotal ? Math.round(progress ?? 0) : 0);
        const label = isDone
          ? "✓"
          : hasTotal
          ? `${pct}%`
          : loaded > 0
          ? fmtBytes(loaded) + "…"
          : "0%";
        return (
          <div key={file}>
            <div className="flex justify-between text-xs text-white/60 mb-1">
              <span className="truncate max-w-[75%]">{file}</span>
              <span>{label}</span>
            </div>
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isDone ? "bg-green-400" : loaded > 0 ? "bg-blue-400 animate-pulse" : "bg-white/20"
                }`}
                style={{ width: `${isDone ? 100 : hasTotal ? pct : loaded > 0 ? 5 : 0}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
