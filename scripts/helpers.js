import { MODULE_ID } from "./const.js";

const L = (key) => game.i18n.localize(`PF2E_KEYRING.${key}`);
const LF = (key, data) => game.i18n.format(`PF2E_KEYRING.${key}`, data);

export { L, LF };

export function slugifyId(value) {
    const slug = String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\p{L}\p{N}-]/gu, "")
        .slice(0, 64);

    if (slug) return slug;

    const seed = String(value ?? "").trim();
    if (!seed) return "";
    const hash = [...seed].reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
    return `key-${Math.abs(hash).toString(36)}`;
}

export function getClickerActor(userId = game.user.id) {
    const user = game.users.get(userId);
    if (!user) return null;

    if (userId === game.user.id) {
        const controlled = canvas.tokens?.controlled
            ?.map((token) => token.actor)
            .filter((actor) => actor?.isOwner);
        if (controlled?.length === 1) return controlled[0];
    }

    return user.character ?? null;
}

export function getPartyActors() {
    return game.actors.filter(
        (actor) => actor.type === "character" && actor.hasPlayerOwner,
    );
}

export function actorHasLinkedItem(actor, uuid) {
    if (!actor || !uuid) return false;

    for (const item of actor.items) {
        if (item.uuid === uuid) return true;
        const source = item.flags?.core?.sourceId ?? "";
        if (source === uuid) return true;
    }

    return false;
}

export async function resolveLinkedItemLabel(uuid) {
    if (!uuid) return "";
    try {
        const doc = await fromUuid(uuid);
        return doc?.name ?? uuid;
    } catch {
        return uuid;
    }
}

export function buildTakeMarkup(keyId, label) {
    const text = label || keyId;
    return `@KeyTake[${keyId}]{${text}}`;
}

export function buildCheckMarkup(keyId, label) {
    const text = label || keyId;
    return `@KeyCheck[${keyId}]{${text}}`;
}

export function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
}

export function getEffectiveTransferMode(definition) {
    if (definition.transferMode) return definition.transferMode;
    return game.settings.get(MODULE_ID, "defaultTransferMode");
}