import { useTranslatorStore } from "../stores/translatorStore";
import { glossaryService } from "../services/domain";

export const useGlossary = () => {
  const { glossary, setGlossary } = useTranslatorStore();

  const refreshGlossary = async () => {
    try {
      const terms = await glossaryService.listTerms();
      setGlossary(terms);
    } catch {
      console.error("Failed to load glossary");
    }
  };

  const addTerm = async (source: string, target: string) => {
    await glossaryService.addTerm({ source, target });
    await refreshGlossary();
  };

  const deleteTerm = async (id: string) => {
    await glossaryService.deleteTerm(id);
    await refreshGlossary();
  };

  return {
    glossary,
    refreshGlossary,
    addTerm,
    deleteTerm,
  };
};
