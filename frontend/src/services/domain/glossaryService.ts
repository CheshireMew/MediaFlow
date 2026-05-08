import type { GlossaryTerm } from "../../types/api";

export const glossaryService = {
  async listTerms(): Promise<GlossaryTerm[]> {
    return await import("../../api/client").then(({ apiClient }) => apiClient.listGlossaryTerms());
  },

  async addTerm(term: {
    source: string;
    target: string;
    note?: string;
    category?: string;
  }): Promise<GlossaryTerm> {
    return await import("../../api/client").then(({ apiClient }) => apiClient.addGlossaryTerm(term));
  },

  async deleteTerm(termId: string): Promise<void> {
    await import("../../api/client").then(({ apiClient }) => apiClient.deleteGlossaryTerm(termId));
  },
};
