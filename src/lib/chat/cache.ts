import { openDB } from "idb";

const DB_NAME =
  "sayittome-cache";

const STORE =
  "chat-cache";

export async function saveChatCache(
  key: string,
  data: unknown,
) {
  const db = await openDB(
    DB_NAME,
    1,
    {
      upgrade(db) {
        if (
          !db.objectStoreNames.contains(
            STORE,
          )
        ) {
          db.createObjectStore(
            STORE,
          );
        }
      },
    },
  );

  await db.put(
    STORE,
    data,
    key,
  );
}

export async function loadChatCache(
  key: string,
) {
  const db = await openDB(
    DB_NAME,
    1,
    {
      upgrade(db) {
        if (
          !db.objectStoreNames.contains(
            STORE,
          )
        ) {
          db.createObjectStore(
            STORE,
          );
        }
      },
    },
  );

  return db.get(
    STORE,
    key,
  );
}
