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
  "taskmonitor",
  "synthesis",
] as const;

const DEFAULT_BOOTSTRAP_NAMESPACES = ["common", "sidebar"] as const;
const localeModules = import.meta.glob<{ default: Record<string, unknown> }>([
  "./locales/en/*.json",
  "./locales/ja/*.json",
  "./locales/zh/*.json",
  "!./locales/zh/common.json",
]);
const eagerZhCommonResource = import.meta.glob<Record<string, unknown>>(
  "./locales/zh/common.json",
  { eager: true, import: "default" },
);
const resourceCache = new Map<string, Record<string, unknown>>();

type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];
type I18nNamespace = (typeof KNOWN_NAMESPACES)[number];
export type StartupStatusKey =
  | "waitingConfig"
  | "checkingHealth"
  | "retryingHealth"
  | "retryingGeneric"
  | "fatalContract"
  | "ready"
  | "webMode";

function isKnownNamespace(namespace: string): namespace is I18nNamespace {
  return KNOWN_NAMESPACES.includes(namespace as I18nNamespace);
}

function resolveNamespaces(
  namespaces: readonly I18nNamespace[] | readonly string[],
): I18nNamespace[] {
  return Array.from(new Set(namespaces)).map((namespace) => {
    if (!isKnownNamespace(namespace)) {
      throw new Error(`Unknown i18n namespace: ${namespace}`);
    }
    return namespace;
  });
}

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

function resolveEagerLocaleResource(language: string, namespace: string) {
  return eagerZhCommonResource[`./locales/${language}/${namespace}.json`];
}

export function getStartupStatusFallback(key: StartupStatusKey) {
  const commonResource = resolveEagerLocaleResource("zh", "common") as
    | {
        startup?: {
          status?: Partial<Record<StartupStatusKey, unknown>>;
        };
      }
    | undefined;
  const fallback = commonResource?.startup?.status?.[key];
  if (typeof fallback !== "string" || fallback.length === 0) {
    throw new Error(`Missing zh/common startup fallback: ${key}`);
  }
  return fallback;
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
  const eagerResource = resolveEagerLocaleResource(language, namespace);
  if (!loader && !eagerResource) {
    throw new Error(`Missing i18n resource for ${language}/${namespace}`);
  }

  const resource = eagerResource ?? (await loader()).default;
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

function scheduleFallbackLanguagePreload(
  language: SupportedLanguageCode,
  namespaces: readonly I18nNamespace[],
) {
  if (language === "en") {
    return;
  }

  const loadFallback = () => {
    void preloadNamespaces("en", namespaces).then(() => {
      i18n.options.fallbackLng = "en";
    });
  };

  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(loadFallback, { timeout: 5000 });
    return;
  }

  setTimeout(loadFallback, 2000);
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
  await preloadNamespaces(language, resolveNamespaces(namespaces));
}

export function initI18nWithNamespaces(
  language: string = "zh",
  namespaces: readonly I18nNamespace[] | readonly string[] = DEFAULT_BOOTSTRAP_NAMESPACES,
) {
  const resolvedLanguage = normalizeLanguage(language);
  const bootstrapNamespaces = resolveNamespaces(namespaces);

  return preloadNamespaces(resolvedLanguage, bootstrapNamespaces).then(async () => {
    if (!i18n.isInitialized) {
      return await i18n
        .use(lazyLocaleBackend)
        .use(initReactI18next)
        .init({
          resources: collectCachedResources(
            [resolvedLanguage],
            bootstrapNamespaces,
          ),
          lng: resolvedLanguage,
          fallbackLng: false,
          showSupportNotice: false,
          defaultNS: "common",
          ns: bootstrapNamespaces,
          partialBundledLanguages: true,
          interpolation: { escapeValue: false },
          react: { useSuspense: false },
        })
        .then((instance) => {
          scheduleFallbackLanguagePreload(resolvedLanguage, bootstrapNamespaces);
          return instance;
        });
    }

    await i18n.changeLanguage(resolvedLanguage);
    scheduleFallbackLanguagePreload(resolvedLanguage, bootstrapNamespaces);
    return i18n;
  });
}

export default i18n;
