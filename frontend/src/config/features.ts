const configuredExperimentalPreprocessing =
  import.meta.env.VITE_ENABLE_EXPERIMENTAL_PREPROCESSING;

export const ENABLE_EXPERIMENTAL_PREPROCESSING =
  configuredExperimentalPreprocessing != null
    ? configuredExperimentalPreprocessing !== "false"
    : import.meta.env.DEV;
