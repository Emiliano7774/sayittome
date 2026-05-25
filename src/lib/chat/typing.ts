import {
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export async function setTyping(
  chatId: string,
  uid: string,
  value: boolean,
) {
  await setDoc(
    doc(
      db,
      "chat_typing",
      chatId,
    ),
    {
      typingBy: {
        [uid]: {
          value,
          updatedAt:
            Date.now(),
        },
      },
    },
    {
      merge: true,
    },
  );
}

export function listenTyping(
  chatId: string,
  targetUid: string,
  callback: (
    typing: boolean,
  ) => void,
) {
  return onSnapshot(
    doc(
      db,
      "chat_typing",
      chatId,
    ),

    (snap) => {
      const data =
        snap.data();

      const typing =
        data?.typingBy?.[
          targetUid
        ];

      if (!typing) {
        callback(false);
        return;
      }

      const fresh =
        Date.now() -
          Number(
            typing.updatedAt ||
              0,
          ) <
        2400;

      callback(
        Boolean(
          typing.value &&
            fresh,
        ),
      );
    },
  );
}
