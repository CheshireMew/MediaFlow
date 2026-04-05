import i18n from "i18next";
import type { BackendModule } from "i18next";
import { initReactI18next } from "react-i18next";

export const SUPPORTED_LANGUAGES = [
  { code: "zh", label: "简体中文" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
] as const;

const KNOWN_NAMESPACES = [
  "common",
  "sidebar",
  "settings",
  "dashboard",
  "editor",
  "downloader",
  "transcriber",
  "translator",
  "preprocessing",
  "taskmonitor",
  "synthesis",
] as const;

const DEFAULT_BOOTSTRAP_NAMESPACES = ["common", "sidebar"] as const;
const localeModules = import.meta.glob<{ default: Record<string, unknown> }>("./locales/*/*.json");
const resourceCache = new Map<string, Record<string, unknown>>();

type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];
type I18nNamespace = (typeof KNOWN_NAMESPACES)[number];

function normalizeLanguage(language: string): SupportedLanguageCode {
  return SUPPORTED_LANGUAGES.some(({ code }) => code === language)
    ? (language as SupportedLanguageCode)
    : "zh";
}

function createCacheKey(language: string, namespace: string) {
  return `${language}:${namespace}`;
}

function resolveLocaleLoader(language: string, namespace: string) {
  return localeModules[`./locales/${language}/${namespace}.json`];
}

async function ensureResourceBundle(language: string, namespace: string) {
  const cacheKey = createCacheKey(language, namespace);
  const cached = resourceCache.get(cacheKey);
  if (cached) {
    if (i18n.isInitialized && !i18n.hasResourceBundle(language, namespace)) {
      i18n.addResourceBundle(language, namespace, cached, true, true);
    }
    return cached;
  }

  const loader = resolveLocaleLoader(language, namespace);
  if (!loader) {
    throw new Error(`Missing i18n resource for ${language}/${namespace}`);
  }

  const resource = (await loader()).default;
  resourceCache.set(cacheKey, resource);
  if (i18n.isInitialized && !i18n.hasResourceBundle(language, namespace)) {
    i18n.addResourceBundle(language, namespace, resource, true, true);
  }
  return resource;
}

async function preloadNamespaces(language: string, namespaces: readonly string[]) {
  const normalizedLanguage = normalizeLanguage(language);
  await Promise.all(
    Array.from(new Set(namespaces)).map((namespace) =>
      ensureResourceBundle(normalizedLanguage, namespace),
    ),
  );
}

function collectCachedResources(languages: readonly string[], namespaces: readonly string[]) {
  const resources: Record<string, Record<string, Record<string, unknown>>> = {};

  for (const language of languages) {
    const bundles = namespaces.reduce<Record<string, Record<string, unknown>>>((acc, namespace) => {
      const resource = resourceCache.get(createCacheKey(language, namespace));
      if (resource) {
        acc[namespace] = resource;
      }
      return acc;
    }, {});

    if (Object.keys(bundles).length > 0) {
      resources[language] = bundles;
    }
  }

  return resources;
}

const lazyLocaleBackend: BackendModule = {
  type: "backend",
  init: () => undefined,
  read: (language, namespace, callback) => {
    void ensureResourceBundle(language, namespace)
      .then((resource) => callback(null, resource))
      .catch((error) =>
        callback(
          error instanceof Error ? error : new Error(`Failed to load ${language}/${namespace}`),
          false,
        ),
      );
  },
};

export async function ensureI18nNamespaces(
  namespaces: readonly I18nNamespace[] | readonly string[],
  language: string = i18n.resolvedLanguage || i18n.language || "zh",
) {
  await preloadNamespaces(language, namespaces);
}

export function initI18n(language: string = "zh") {
  const resolvedLanguage = normalizeLanguage(language);
  const bootstrapNamespaces = DEFAULT_BOOTSTRAP_NAMESPACES;

  return initI18nWithNamespaces(resolvedLanguage, bootstrapNamespaces);
}

export function initI18nWithNamespaces(
  language: string = "zh",
  namespaces: readonly I18nNamespace[] | readonly string[] = DEFAULT_BOOTSTRAP_NAMESPACES,
) {
  const resolvedLanguage = normalizeLanguage(language);
  const bootstrapNamespaces = Array.from(new Set(namespaces));

  return Promise.all([
    preloadNamespaces(resolvedLanguage, bootstrapNamespaces),
    resolvedLanguage === "en"
      ? Promise.resolve()
      : preloadNamespaces("en", bootstrapNamespaces),
  ]).then(async () => {
    if (!i18n.isInitialized) {
      return await i18n
        .use(lazyLocaleBackend)
        .use(initReactI18next)
        .init({
          resources: collectCachedResources(
            resolvedLanguage === "en" ? ["en"] : [resolvedLanguage, "en"],
            bootstrapNamespaces,
          ),
          lng: resolvedLanguage,
          fallbackLng: "en",
          defaultNS: "common",
          ns: bootstrapNamespaces,
          partialBundledLanguages: true,
          interpolation: { escapeValue: false },
          react: { useSuspense: false },
        });
    }

    await i18n.changeLanguage(resolvedLanguage);
    return i18n;
  });
}

export default i18n;
