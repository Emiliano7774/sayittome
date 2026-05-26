import type { AppLocale } from "@/lib/i18n/types";
import { MESSAGES } from "@/lib/i18n/messages";

export type MessageKey = keyof typeof MESSAGES.es;

export function getMessage(
  locale: AppLocale,
  key: MessageKey,
  values?: Record<string, string>,
): string {
  let message = MESSAGES[locale][key] ?? MESSAGES.es[key] ?? key;

  if (values) {
    for (const [placeholder, value] of Object.entries(values)) {
      message = message.replace(new RegExp(`\\{${placeholder}\\}`, "g"), value);
    }
  }

  return message;
}

export function localeLabelKey(locale: AppLocale): MessageKey {
  return `lang_${locale}` as MessageKey;
}
