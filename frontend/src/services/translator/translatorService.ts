import { API_BASE } from "../../api/client";
import type { SubtitleSegment } from "../../types/task";

export interface GlossaryTerm {
  id: string;
  source: string;
  target: string;
  note?: string;
  category?: string;
}

export interface TranslateRequest {
  segments: SubtitleSegment[];
  target_language: string;
  mode: "standard" | "intelligent";
  context_path?: string | null;
}

export interface TranslateResponse {
  task_id: string;
  status: string;
  segments?: SubtitleSegment[];
}

export const translatorService = {
  // --- Glossary ---
  listTerms: async (): Promise<GlossaryTerm[]> => {
    const res = await fetch(`${API_BASE}/glossary/`);
    if (!res.ok) throw new Error("Failed to list glossary terms");
    return await res.json();
  },

  addTerm: async (term: {
    source: string;
    target: string;
    note?: string;
    category?: string;
  }): Promise<GlossaryTerm> => {
    const res = await fetch(`${API_BASE}/glossary/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(term),
    });
    if (!res.ok) throw new Error("Failed to add glossary term");
    return await res.json();
  },

  deleteTerm: async (termId: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/glossary/${termId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete glossary term");
  },

  // --- Translation ---
  startTranslation: async (
    req: TranslateRequest,
  ): Promise<TranslateResponse> => {
    const res = await fetch(`${API_BASE}/translate/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error("Failed to start translation task");
    return await res.json();
  },

  // Polling helper
  getTaskStatus: async (taskId: string) => {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`);
    if (!res.ok) throw new Error("Failed to get task status");
    return await res.json();
  },
};
