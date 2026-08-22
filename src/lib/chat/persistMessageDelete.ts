import { httpsCallable } from "firebase/functions";

import { ensureStorageAuth } from "@/lib/auth/ensureStorageAuth";
import { FUNCTIONS_REGION, functions } from "@/lib/firebase";

export const DELETE_CHAT_MESSAGE_CALLABLE = "deleteChatMessage";
export const DELETE_CHAT_MESSAGE_REGION = FUNCTIONS_REGION;

export type PersistMessageDeleteInput = {
  chatId: string;
  messageId: string;
  mode: "me" | "everyone";
};

export type PersistMessageDeleteResult = {
  ok: boolean;
  mode?: "me" | "everyone";
  alreadyApplied?: boolean;
  cleanupPending?: boolean;
};

export async function persistMessageDelete(
  input: PersistMessageDeleteInput,
  deps?: {
    ensureAuth?: typeof ensureStorageAuth;
    callDelete?: (payload: PersistMessageDeleteInput) => Promise<PersistMessageDeleteResult>;
  },
) {
  const chatId = String(input.chatId || "").trim();
  const messageId = String(input.messageId || "").trim();
  if (!chatId || !messageId || (input.mode !== "me" && input.mode !== "everyone")) {
    throw new Error("invalid-argument");
  }

  await (deps?.ensureAuth || ensureStorageAuth)({ allowAnonymous: true });

  if (deps?.callDelete) {
    return deps.callDelete({ chatId, messageId, mode: input.mode });
  }

  const callable = httpsCallable<PersistMessageDeleteInput, PersistMessageDeleteResult>(
    functions,
    DELETE_CHAT_MESSAGE_CALLABLE,
  );
  const result = await callable({ chatId, messageId, mode: input.mode });
  return result.data;
}
