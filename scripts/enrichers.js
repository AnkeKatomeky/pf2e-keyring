import { MODULE_ID } from "./const.js";
import { getKeyDefinition } from "./definitions.js";
import { emitKeyringAction } from "./socket.js";

function createKeyButton({ action, keyId, label }) {
    const definition = getKeyDefinition(keyId);
    const displayLabel = label || definition?.name || keyId;
    const invalid = !definition;

    const anchor = document.createElement("a");
    anchor.classList.add("inline-check", "pf2e-keyring-inline");
    anchor.dataset.keyringAction = action;
    anchor.dataset.keyringId = keyId;
    if (invalid) anchor.dataset.invalid = "true";

    const icon = document.createElement("i");
    icon.classList.add("icon", "fa-solid", action === "take" ? "fa-key" : "fa-door-open");

    const text = document.createElement("span");
    text.classList.add("label");
    text.textContent = displayLabel;

    anchor.append(icon, text);
    return anchor;
}

export function registerEnrichers() {
    CONFIG.TextEditor.enrichers.push({
        id: `${MODULE_ID}-key-take`,
        pattern: /@KeyTake\[([^\]|]+)\](?:\{([^}]+)\})?/g,
        enricher: (match) => {
            const [, keyId, label] = match;
            return createKeyButton({ action: "take", keyId: keyId.trim(), label });
        },
    });

    CONFIG.TextEditor.enrichers.push({
        id: `${MODULE_ID}-key-check`,
        pattern: /@KeyCheck\[([^\]|]+)\](?:\{([^}]+)\})?/g,
        enricher: (match) => {
            const [, keyId, label] = match;
            return createKeyButton({ action: "check", keyId: keyId.trim(), label });
        },
    });
}

export function registerClickListeners() {
    document.addEventListener("click", onKeyringClick);
}

export function unregisterClickListeners() {
    document.removeEventListener("click", onKeyringClick);
}

function onKeyringClick(event) {
    const button = event.target.closest("[data-keyring-action]");
    if (!button) return;

    const action = button.dataset.keyringAction;
    const keyId = button.dataset.keyringId;
    if (!action || !keyId) return;

    event.preventDefault();
    event.stopPropagation();

    if (action === "take" || action === "check") {
        emitKeyringAction(action, { keyId });
        return;
    }

    if (action === "request-approve" || action === "request-deny") {
        if (!game.user.isGM) return;
        const requesterUserId = button.dataset.requesterUserId;
        emitKeyringAction("transferResponse", {
            keyId,
            requesterUserId,
            approved: action === "request-approve",
        });
        const container = button.closest(".keyring-request-buttons");
        if (container) {
            container.innerHTML = game.i18n.localize(
                action === "request-approve"
                    ? "PF2E_KEYRING.Chat.Approved"
                    : "PF2E_KEYRING.Chat.Denied",
            );
        }
    }
}