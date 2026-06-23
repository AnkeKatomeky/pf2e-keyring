import { SOCKET_CHANNEL } from "./const.js";
import { handleCheckKey, handleTakeKey } from "./actions.js";
import { createKeyringChatMessage } from "./chat.js";

async function processMessage(message) {
    switch (message.action) {
        case "take":
            await handleTakeKey(message.keyId, {
                userId: message.userId,
                forceTransfer: message.forceTransfer ?? false,
            });
            break;
        case "check":
            await handleCheckKey(message.keyId, { userId: message.userId });
            break;
        case "transferResponse":
            if (message.approved) {
                await handleTakeKey(message.keyId, {
                    userId: message.requesterUserId,
                    forceTransfer: true,
                });
            } else {
                const requester = game.users.get(message.requesterUserId);
                if (requester) {
                    await createKeyringChatMessage({
                        content: `<div class="pf2e-keyring-chat"><p>${game.i18n.localize("PF2E_KEYRING.Chat.TransferDenied")}</p></div>`,
                        whisper: [requester.id],
                        speaker: ChatMessage.getSpeaker(),
                    });
                }
            }
            break;
    }
}

function isActiveGmUser() {
    return game.user.isActiveGM ?? game.user.isGM;
}

export function registerSocket() {
    game.socket.on(SOCKET_CHANNEL, async (message) => {
        if (message.action === "stateSync") {
            const { applyClientKeyStateSync } = await import("./state.js");
            applyClientKeyStateSync(message.keyState);
            return;
        }

        if (!isActiveGmUser()) return;
        await processMessage(message);
    });
}

export async function emitKeyringAction(action, data = {}) {
    const payload = {
        action,
        userId: game.user.id,
        ...data,
    };

    if (isActiveGmUser()) {
        await processMessage(payload);
        return;
    }

    if (!game.users.some((user) => user.isGM && user.active)) {
        ui.notifications.warn(game.i18n.localize("PF2E_KEYRING.Notification.NoGM"));
        return;
    }

    game.socket.emit(SOCKET_CHANNEL, payload);
}