import type { GlossaryTerm } from "../../types/api";
import { apiClient } from "../../api/client";

export const glossaryService = {
  async listTerms(): Promise<GlossaryTerm[]> {
    return await apiClient.listGlossaryTerms();
  },

  async addTerm(term: {
    source: string;
    target: string;
    note?: string;
    category?: string;
  }): Promise<GlossaryTerm> {
    return await apiClient.addGlossaryTerm(term);
  },

  async deleteTerm(termId: string): Promise<void> {
    await apiClient.deleteGlossaryTerm(termId);
  },
};
