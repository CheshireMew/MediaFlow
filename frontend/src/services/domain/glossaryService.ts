import { isDesktopRuntime, requireDesktopApiMethod } from "../desktop/bridge";
import type { GlossaryTerm } from "../../types/api";

export const glossaryService = {
  async listTerms(): Promise<GlossaryTerm[]> {
    if (isDesktopRuntime()) {
      return await requireDesktopApiMethod(
        "listDesktopGlossary",
        "Desktop glossary worker is unavailable.",
      )();
    }
    return await import("../../api/client").then(({ apiClient }) => apiClient.listGlossaryTerms());
  },

  async addTerm(term: {
    source: string;
    target: string;
    note?: string;
    category?: string;
  }): Promise<GlossaryTerm> {
    if (isDesktopRuntime()) {
      return await requireDesktopApiMethod(
        "addDesktopGlossaryTerm",
        "Desktop glossary worker is unavailable.",
      )(term);
    }
    return await import("../../api/client").then(({ apiClient }) => apiClient.addGlossaryTerm(term));
  },

  async deleteTerm(termId: string): Promise<void> {
    if (isDesktopRuntime()) {
      await requireDesktopApiMethod(
        "deleteDesktopGlossaryTerm",
        "Desktop glossary worker is unavailable.",
      )(termId);
      return;
    }
    await import("../../api/client").then(({ apiClient }) => apiClient.deleteGlossaryTerm(termId));
  },
};
