import { useState, useCallback } from "react";

const PRESET_KEY = "__GEMMA_PRESETS__";
const ACTIVE_KEY = "__GEMMA_ACTIVE_ID__";

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful multimodal AI assistant running entirely in the user's browser via WebGPU. " +
  "The user has a live camera or video feed. You can use the vision tool to capture and analyze " +
  "the current frame whenever the user asks about what they see, what is on screen, their surroundings, " +
  "or anything visual. You can also process audio input from the user.";

const DEFAULT_PRESETS = [
  { id: "default", name: "Default", text: DEFAULT_SYSTEM_PROMPT },
  {
    id: "japanese",
    name: "日本語で説明",
    text: DEFAULT_SYSTEM_PROMPT + "\n\nPlease always respond in Japanese.",
  },
];

function loadPresets() {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY)) || DEFAULT_PRESETS;
  } catch {
    return DEFAULT_PRESETS;
  }
}

function savePresets(presets) {
  localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
}

export function useSystemPrompt() {
  const [presets, setPresetsState] = useState(loadPresets);
  const [activeId, setActiveId] = useState(
    () => localStorage.getItem(ACTIVE_KEY) || "default"
  );
  const [isOpen, setIsOpen] = useState(false);

  const activePreset = presets.find((p) => p.id === activeId) || presets[0];
  const activeText = activePreset?.text || "";

  const setPresets = useCallback((next) => {
    setPresetsState(next);
    savePresets(next);
  }, []);

  const selectPreset = useCallback((id) => {
    setActiveId(id);
    localStorage.setItem(ACTIVE_KEY, id);
  }, []);

  const savePreset = useCallback(
    (id, text) => {
      setPresets(presets.map((p) => (p.id === id ? { ...p, text } : p)));
    },
    [presets, setPresets]
  );

  const addPreset = useCallback(
    (name, text) => {
      const id = Date.now().toString();
      const next = [...presets, { id, name, text }];
      setPresets(next);
      selectPreset(id);
      return id;
    },
    [presets, setPresets, selectPreset]
  );

  const deletePreset = useCallback(
    (id) => {
      const next = presets.filter((p) => p.id !== id);
      setPresets(next);
      if (activeId === id) selectPreset(next[0]?.id || "");
    },
    [presets, activeId, setPresets, selectPreset]
  );

  return {
    presets,
    activeId,
    activeText,
    isOpen,
    setIsOpen,
    selectPreset,
    savePreset,
    addPreset,
    deletePreset,
  };
}
