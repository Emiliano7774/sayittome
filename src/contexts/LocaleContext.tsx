"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import LanguagePromptModal from "@/components/i18n/LanguagePromptModal";
import { getMessage, localeLabelKey, type MessageKey } from "@/lib/i18n/getMessage";
import {
  APP_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_PROMPT_KEY,
  LOCALE_STORAGE_KEY,
  type AppLocale,
} from "@/lib/i18n/types";

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: MessageKey, values?: Record<string, string>) => string;
  suggestedLocale: AppLocale | null;
  ready: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocale(): AppLocale | null {
  if (typeof window === "undefined") return null;

  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored && APP_LOCALES.includes(stored as AppLocale)) {
    return stored as AppLocale;
  }

  return null;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE);
  const [suggestedLocale, setSuggestedLocale] = useState<AppLocale | null>(null);
  const [ready, setReady] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const stored = readStoredLocale();
    if (stored) {
      setLocaleState(stored);
    }

    let cancelled = false;

    async function detect() {
      try {
        const response = await fetch("/api/locale/detect");
        if (!response.ok) return;

        const data = (await response.json()) as { suggestedLocale: AppLocale };
        if (cancelled) return;

        setSuggestedLocale(data.suggestedLocale);

        const promptDone = localStorage.getItem(LOCALE_PROMPT_KEY) === "1";
        if (!promptDone) {
          setShowPrompt(true);
          return;
        }

        if (!stored) {
          setLocaleState(data.suggestedLocale);
          localStorage.setItem(LOCALE_STORAGE_KEY, data.suggestedLocale);
        }
      } catch {
        // Ignore detection failures; Spanish remains the fallback.
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void detect();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    localStorage.setItem(LOCALE_STORAGE_KEY, next);
  }, []);

  const t = useCallback(
    (key: MessageKey, values?: Record<string, string>) => getMessage(locale, key, values),
    [locale],
  );

  const finishPrompt = useCallback(() => {
    localStorage.setItem(LOCALE_PROMPT_KEY, "1");
    setShowPrompt(false);
  }, []);

  const value = useMemo(
    () => ({ locale, setLocale, t, suggestedLocale, ready }),
    [locale, setLocale, t, suggestedLocale, ready],
  );

  return (
    <LocaleContext.Provider value={value}>
      {children}
      {showPrompt && suggestedLocale ? (
        <LanguagePromptModal
          currentLocale={locale}
          suggestedLocale={suggestedLocale}
          onKeepCurrent={() => {
            setLocale(locale);
            finishPrompt();
          }}
          onUseSuggested={() => {
            setLocale(suggestedLocale);
            finishPrompt();
          }}
          onChoose={(chosen) => {
            setLocale(chosen);
            finishPrompt();
          }}
        />
      ) : null}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
}

export function useT() {
  return useLocale().t;
}

export function useLocaleLabel(locale: AppLocale) {
  const { t } = useLocale();
  return t(localeLabelKey(locale));
}
