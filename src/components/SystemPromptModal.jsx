import { useState } from "react";

export default function SystemPromptModal({ presets, activeId, onSelect, onSave, onAdd, onDelete, onClose }) {
  const [editText, setEditText] = useState(
    () => presets.find((p) => p.id === activeId)?.text || ""
  );
  const [selectedId, setSelectedId] = useState(activeId);

  function handleSelect(id) {
    setSelectedId(id);
    setEditText(presets.find((p) => p.id === id)?.text || "");
    onSelect(id);
  }

  function handleSave() {
    if (selectedId) {
      onSave(selectedId, editText);
    } else {
      const name = window.prompt("Preset name:");
      if (!name?.trim()) return;
      onAdd(name.trim(), editText);
    }
  }

  function handleAdd() {
    const name = window.prompt("New preset name:");
    if (!name?.trim()) return;
    onAdd(name.trim(), editText);
  }

  function handleDelete() {
    if (!selectedId) return;
    if (!window.confirm("Delete this preset?")) return;
    onDelete(selectedId);
    const remaining = presets.filter((p) => p.id !== selectedId);
    if (remaining.length > 0) {
      setSelectedId(remaining[0].id);
      setEditText(remaining[0].text);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-[#1a1a24] border border-white/10 rounded-2xl p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">System Prompt</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {/* Preset list */}
        <div className="flex gap-2 flex-wrap">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelect(p.id)}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                selectedId === p.id
                  ? "bg-blue-500/20 border-blue-400/50 text-blue-300"
                  : "bg-white/5 border-white/10 text-white/60 hover:text-white"
              }`}
            >
              {p.name}
            </button>
          ))}
          <button
            onClick={handleAdd}
            className="px-3 py-1 rounded-full text-sm border border-white/10 bg-white/5 text-white/40 hover:text-white transition-colors"
          >
            + New
          </button>
        </div>

        {/* Text editor */}
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          rows={8}
          className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white/80 placeholder-white/20 resize-y outline-none focus:border-blue-400/50 font-mono"
          placeholder="Enter system prompt…"
        />

        <div className="flex justify-between gap-2">
          <button
            onClick={handleDelete}
            disabled={!selectedId || presets.length <= 1}
            className="px-4 py-2 rounded-xl text-sm bg-red-500/10 border border-red-400/20 text-red-400 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-default transition-colors"
          >
            Delete
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-xl text-sm bg-blue-500/20 border border-blue-400/30 text-blue-300 hover:bg-blue-500/30 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
