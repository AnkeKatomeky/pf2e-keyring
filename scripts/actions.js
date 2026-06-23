import { getKeyDefinition, resolveKeyId } from "./definitions.js";
import {
    assignKeyHolder,
    getKeyState,
    releaseKey,
} from "./state.js";
import {
    actorHasLinkedItem,
    getClickerActor,
    getEffectiveTransferMode,
    LF,
    resolveLinkedItemLabel,
} from "./helpers.js";
import { createKeyringChatMessage } from "./chat.js";

function evaluateKeyPossession(definition, state, actor) {
    const hasAbstract = state.status === "held" && state.holderActorId === actor?.id;
    const hasItem = actorHasLinkedItem(actor, definition.linkedItemUuid);
    const linkMode = definition.linkMode ?? "none";

    switch (linkMode) {
        case "sync":
            if (!hasAbstract) return { success: false, hasAbstract, hasItem };
            if (definition.linkedItemUuid && !hasItem) {
                return { success: false, hasAbstract, hasItem };
            }
            return { success: true, hasAbstract, hasItem };
        case "either":
            if (hasAbstract) return { success: true, hasAbstract, hasItem };
            if (definition.linkedItemUuid && hasItem) {
                return { success: true, hasAbstract, hasItem };
            }
            return { success: false, hasAbstract, hasItem };
        case "reference":
        case "none":
        default:
            return { success: hasAbstract, hasAbstract, hasItem };
    }
}

async function postChatMessage(content, { whisper, speakerActor } = {}) {
    const speaker = speakerActor
        ? ChatMessage.getSpeaker({ actor: speakerActor })
        : ChatMessage.getSpeaker();

    const messageData = { content, speaker };

    if (whisper?.length) {
        messageData.whisper = whisper;
    }

    await createKeyringChatMessage(messageData);
}

async function notifyTransferRequest({
    keyId,
    definition,
    fromActor,
    toActor,
    requesterUserId,
}) {
    const gmUsers = game.users.filter((user) => user.isGM && user.active);
    const content = `<div class="pf2e-keyring-chat pf2e-keyring-chat--request">
        <p>${LF("Chat.TransferRequest", {
            key: definition.name,
            from: fromActor.name,
            to: toActor.name,
        })}</p>
        <div class="keyring-request-buttons">
            <button type="button" data-keyring-action="request-approve" data-keyring-id="${keyId}" data-requester-user-id="${requesterUserId}">
                ${game.i18n.localize("PF2E_KEYRING.Chat.Approve")}
            </button>
            <button type="button" data-keyring-action="request-deny" data-keyring-id="${keyId}" data-requester-user-id="${requesterUserId}">
                ${game.i18n.localize("PF2E_KEYRING.Chat.Deny")}
            </button>
        </div>
    </div>`;

    await createKeyringChatMessage({
        content,
        whisper: gmUsers.map((user) => user.id),
        speaker: ChatMessage.getSpeaker(),
        flags: {
            pf2eKeyring: {
                transferRequest: {
                    keyId,
                    toActorId: toActor.id,
                    requesterUserId,
                },
            },
        },
    });
}

export async function handleTakeKey(keyId, { userId = game.user.id, forceTransfer = false } = {}) {
    const resolvedId = resolveKeyId(keyId);
    const definition = resolvedId ? getKeyDefinition(resolvedId) : null;
    if (!definition || !resolvedId) {
        ui.notifications.warn(LF("Notification.UnknownKey", { key: keyId }));
        return;
    }

    const actor = getClickerActor(userId);
    if (!actor) {
        ui.notifications.warn(game.i18n.localize("PF2E_KEYRING.Notification.NoActor"));
        return;
    }

    const state = getKeyState(resolvedId);
    const transferMode = getEffectiveTransferMode(definition);

    if (state.status === "held" && state.holderActorId === actor.id) {
        ui.notifications.info(LF("Notification.AlreadyHeld", { key: definition.name, actor: actor.name }));
        return;
    }

    if (state.status === "held" && state.holderActorId && state.holderActorId !== actor.id) {
        const currentHolder = game.actors.get(state.holderActorId);
        const holderName = currentHolder?.name ?? state.holderName ?? "?";

        if (!forceTransfer) {
            if (transferMode === "gm-only") {
                ui.notifications.warn(LF("Notification.HeldByOther", {
                    key: definition.name,
                    actor: holderName,
                }));
                return;
            }

            if (transferMode === "request") {
                await notifyTransferRequest({
                    keyId: resolvedId,
                    definition,
                    fromActor: currentHolder ?? { name: holderName },
                    toActor: actor,
                    requesterUserId: userId,
                });
                ui.notifications.info(game.i18n.localize("PF2E_KEYRING.Notification.RequestSent"));
                return;
            }
        }

        if (transferMode === "always" || forceTransfer) {
            await assignKeyHolder(resolvedId, actor);
            await postChatMessage(
                `<div class="pf2e-keyring-chat"><p>${LF("Chat.Transferred", {
                    key: definition.name,
                    from: holderName,
                    to: actor.name,
                })}</p></div>`,
                { speakerActor: actor },
            );
            Hooks.callAll("pf2eKeyringKeyTransferred", resolvedId, actor, currentHolder);
            return;
        }
    }

    await assignKeyHolder(resolvedId, actor);
    await postChatMessage(
        `<div class="pf2e-keyring-chat"><p>${LF("Chat.Taken", {
            key: definition.name,
            actor: actor.name,
        })}</p></div>`,
        { speakerActor: actor },
    );
    Hooks.callAll("pf2eKeyringKeyTaken", resolvedId, actor);
}

export async function handleCheckKey(keyId, { userId = game.user.id } = {}) {
    const resolvedId = resolveKeyId(keyId);
    const definition = resolvedId ? getKeyDefinition(resolvedId) : null;
    if (!definition || !resolvedId) {
        ui.notifications.warn(LF("Notification.UnknownKey", { key: keyId }));
        return;
    }

    const actor = getClickerActor(userId);
    if (!actor) {
        ui.notifications.warn(game.i18n.localize("PF2E_KEYRING.Notification.NoActor"));
        return;
    }

    const state = getKeyState(resolvedId);
    const result = evaluateKeyPossession(definition, state, actor);
    const linkedLabel = await resolveLinkedItemLabel(definition.linkedItemUuid);

    const playerText = result.success
        ? (definition.checkSuccessText || game.i18n.localize("PF2E_KEYRING.Defaults.CheckSuccess"))
        : (definition.checkFailureText || game.i18n.localize("PF2E_KEYRING.Defaults.CheckFailure"));

    await postChatMessage(
        `<div class="pf2e-keyring-chat ${result.success ? "pf2e-keyring-chat--success" : "pf2e-keyring-chat--failure"}">
            <p><strong>${definition.name}</strong></p>
            <p>${playerText}</p>
        </div>`,
        { speakerActor: actor },
    );

    const gmUsers = game.users.filter((user) => user.isGM && user.active);
    const gmDetails = LF("Chat.GmCheckDetails", {
        key: definition.name,
        actor: actor.name,
        result: result.success
            ? game.i18n.localize("PF2E_KEYRING.Chat.ResultYes")
            : game.i18n.localize("PF2E_KEYRING.Chat.ResultNo"),
        holder: state.holderName || game.i18n.localize("PF2E_KEYRING.State.Missing"),
        abstract: result.hasAbstract
            ? game.i18n.localize("PF2E_KEYRING.Chat.Yes")
            : game.i18n.localize("PF2E_KEYRING.Chat.No"),
        item: definition.linkedItemUuid
            ? (result.hasItem
                ? game.i18n.localize("PF2E_KEYRING.Chat.Yes")
                : game.i18n.localize("PF2E_KEYRING.Chat.No"))
            : game.i18n.localize("PF2E_KEYRING.Chat.NotApplicable"),
        linkedItem: linkedLabel || game.i18n.localize("PF2E_KEYRING.Chat.NotApplicable"),
    });

    await postChatMessage(
        `<div class="pf2e-keyring-chat pf2e-keyring-chat--gm"><p>${gmDetails}</p></div>`,
        { whisper: gmUsers.map((user) => user.id) },
    );

    if (definition.consumable && result.success) {
        await releaseKey(resolvedId);
        await postChatMessage(
            `<div class="pf2e-keyring-chat"><p>${LF("Chat.Consumed", { key: definition.name })}</p></div>`,
            { whisper: gmUsers.map((user) => user.id) },
        );
    }

    Hooks.callAll("pf2eKeyringKeyChecked", resolvedId, actor, result.success);
}

export async function gmSetKeyHolder(keyId, actorId) {
    const resolvedId = resolveKeyId(keyId);
    if (!resolvedId) return;

    if (!actorId) {
        await releaseKey(resolvedId);
        return;
    }

    const actor = game.actors.get(actorId);
    if (!actor) return;
    await assignKeyHolder(resolvedId, actor);
}