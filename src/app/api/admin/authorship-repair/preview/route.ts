import { NextResponse } from "next/server";

import { verifyAdminIdToken } from "@/lib/admin/verifyAdminRequest";
import { fetchAllModerationChatsForUser } from "@/lib/moderation/fetchUserChats";
import {
  buildRepairPlan,
  exportRepairPlanWithoutPii,
  markFromPerspective,
  type OperatorMark,
  type RepairPerspective,
} from "@/lib/chat/historicalAuthorshipRepair";
import { loadRepairThread } from "@/lib/chat/historicalAuthorshipRepairIo";

export const dynamic = "force-dynamic";

function jsonError(error: unknown) {
  const status = Number((error as { status?: number })?.status || 500);
  return NextResponse.json(
    { ok: false, error: String((error as Error)?.message || "error") },
    { status: status === 401 || status === 403 ? status : 500 },
  );
}

export async function GET(req: Request) {
  try {
    await verifyAdminIdToken(req);
    const url = new URL(req.url);
    const username = String(url.searchParams.get("username") || "").trim();
    if (!username) {
      return NextResponse.json({ ok: false, error: "username required" }, { status: 400 });
    }
    const result = await fetchAllModerationChatsForUser(username);
    return NextResponse.json({
      ok: true,
      username,
      uidPresent: Boolean(result.uid),
      chats: result.chats.map((chat) => ({
        id: chat.id,
        updatedAt: chat.updatedAt,
        lastMessage: String(chat.lastMessage || "").slice(0, 80),
        lastMessageSenderShape: String(chat.lastMessageSender || "").slice(0, 24),
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    await verifyAdminIdToken(req);
    const body = (await req.json()) as {
      chatId?: string;
      perspective?: RepairPerspective;
      marks?: Array<{ messageId?: string; mine?: boolean; authorRole?: string }>;
      redactPii?: boolean;
    };
    const chatId = String(body.chatId || "").trim();
    if (!chatId) {
      return NextResponse.json({ ok: false, error: "chatId required" }, { status: 400 });
    }

    const loaded = await loadRepairThread(chatId);
    const perspective: RepairPerspective =
      body.perspective === "visitor" ? "visitor" : "owner";
    const marks: OperatorMark[] = (body.marks || [])
      .map((mark) => {
        if (mark.authorRole === "profile" || mark.authorRole === "anon") {
          return {
            messageId: String(mark.messageId || ""),
            authorRole: mark.authorRole,
            source: "operator" as const,
          };
        }
        if (typeof mark.mine === "boolean" && mark.messageId) {
          return markFromPerspective(perspective, mark.messageId, mark.mine);
        }
        return null;
      })
      .filter((mark): mark is OperatorMark => Boolean(mark?.messageId));

    const plan = buildRepairPlan({
      identities: loaded.identities,
      messages: loaded.messages,
      marks,
      includeText: body.redactPii !== true,
    });

    return NextResponse.json({
      ok: true,
      applyAllowed: false,
      freezeReason: plan.freezeReason,
      perspective,
      plan: body.redactPii ? exportRepairPlanWithoutPii(plan) : plan,
    });
  } catch (error) {
    return jsonError(error);
  }
}
