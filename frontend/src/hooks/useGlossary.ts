import { useTranslatorStore } from "../stores/translatorStore";
import { translatorService } from "../services/translator/translatorService";

export const useGlossary = () => {
  const { glossary, setGlossary } = useTranslatorStore();

  const refreshGlossary = async () => {
    try {
      const terms = await translatorService.listTerms();
      setGlossary(terms);
    } catch (e) {
      console.error("Failed to load glossary");
    }
  };

  const addTerm = async (source: string, target: string) => {
    await translatorService.addTerm({ source, target });
    await refreshGlossary();
  };

  const deleteTerm = async (id: string) => {
    await translatorService.deleteTerm(id);
    await refreshGlossary();
  };

  return {
    glossary,
    refreshGlossary,
    addTerm,
    deleteTerm,
  };
};
