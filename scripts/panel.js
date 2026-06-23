import { MODULE_ID, LINK_MODES, TRANSFER_MODES } from "./const.js";
import {
    createDefaultDefinition,
    deleteKeyDefinition,
    getKeyDefinitions,
    upsertKeyDefinition,
} from "./definitions.js";
import { getKeyStateMap, resetAllKeyState } from "./state.js";
import { gmSetKeyHolder } from "./actions.js";
import {
    buildCheckMarkup,
    buildTakeMarkup,
    escapeHtml,
    getPartyActors,
    L,
    LF,
    slugifyId,
} from "./helpers.js";
import { createKeyringChatMessage } from "./chat.js";

let activePanel;

export function openKeyRingPanel() {
    if (!game.user.isGM) return;

    if (activePanel?.rendered) {
        activePanel.bringToFront();
        return;
    }
    activePanel = new KeyRingPanel();
    activePanel.render(true);
}

class KeyRingPanel extends foundry.applications.api.HandlebarsApplicationMixin(
    foundry.applications.api.ApplicationV2,
) {
    static DEFAULT_OPTIONS = {
        id: `${MODULE_ID}-panel`,
        tag: "form",
        classes: ["pf2e-keyring"],
        window: {
            title: "PF2E KeyRing",
            icon: "fa-solid fa-key",
            resizable: true,
        },
        position: {
            width: 860,
            height: 620,
        },
    };

    static PARTS = {
        content: {
            template: `modules/${MODULE_ID}/templates/panel.hbs`,
        },
    };

    constructor(options = {}) {
        super(options);
        this.editingId = null;
        this.eventController = null;
    }

    get title() {
        return game.i18n.localize("PF2E_KEYRING.Title");
    }

    _onRender(context, options) {
        super._onRender(context, options);
        this.eventController?.abort();
        this.eventController = new AbortController();
        const { signal } = this.eventController;

        this.element.addEventListener("submit", (event) => event.preventDefault(), { signal });
        this.element.addEventListener("click", (event) => this.#onClick(event), { signal });
        this.element.addEventListener("change", (event) => this.#onChange(event), { signal });
        this.element.addEventListener("input", () => this.#refreshMarkupPreview(), { signal });

        this.#setupDragDrop(signal);
    }

    close(options) {
        this.eventController?.abort();
        if (activePanel === this) activePanel = null;
        return super.close(options);
    }

    #getFormState() {
        if (!this.editingId && !this.element) {
            return createDefaultDefinition();
        }

        const element = this.element;
        if (!element) {
            if (this.editingId) {
                const definitions = getKeyDefinitions();
                return foundry.utils.deepClone(definitions[this.editingId] ?? createDefaultDefinition());
            }
            return createDefaultDefinition();
        }

        const fd = new FormData(element.querySelector("form") ?? element);
        return {
            id: String(fd.get("id") ?? this.editingId ?? "").trim(),
            name: String(fd.get("name") ?? "").trim(),
            descriptionPublic: String(fd.get("descriptionPublic") ?? "").trim(),
            descriptionGm: String(fd.get("descriptionGm") ?? "").trim(),
            linkedItemUuid: this.#normalizeUuid(String(fd.get("linkedItemUuid") ?? "").trim()),
            linkMode: String(fd.get("linkMode") ?? "none"),
            transferMode: String(fd.get("transferMode") ?? ""),
            checkSuccessText: String(fd.get("checkSuccessText") ?? "").trim(),
            checkFailureText: String(fd.get("checkFailureText") ?? "").trim(),
            consumable: fd.has("consumable"),
        };
    }

    #normalizeUuid(value) {
        if (!value) return "";
        const match = value.match(/@UUID\[([^\]]+)\]/);
        return match ? match[1] : value;
    }

    async #onClick(event) {
        const button = event.target.closest("[data-keyring-panel]");
        if (!button) return;
        event.preventDefault();

        const action = button.dataset.keyringPanel;
        const keyId = button.dataset.keyId
            ?? button.closest("[data-key-id]")?.dataset.keyId;

        switch (action) {
            case "save":
                await this.#saveKey();
                break;
            case "cancel-edit":
                this.editingId = null;
                await this.render(true);
                break;
            case "edit":
                this.editingId = keyId;
                await this.render(true);
                break;
            case "delete":
                await this.#deleteKey(keyId);
                break;
            case "copy-take":
                await this.#copyMarkup(buildTakeMarkup(keyId, getKeyDefinitions()[keyId]?.name ?? keyId));
                break;
            case "copy-check":
                await this.#copyMarkup(buildCheckMarkup(keyId, getKeyDefinitions()[keyId]?.name ?? keyId));
                break;
            case "post-take":
                await this.#postKeyChat(keyId, "take");
                break;
            case "post-check":
                await this.#postKeyChat(keyId, "check");
                break;
            case "post-form-take":
                await this.#postFormChat("take");
                break;
            case "post-form-check":
                await this.#postFormChat("check");
                break;
            case "reset-all":
                await this.#resetAll();
                break;
        }
    }

    async #onChange(event) {
        const select = event.target.closest("[data-keyring-panel='holder']");
        if (!select || !game.user.isGM) return;

        const keyId = select.dataset.keyId;
        const actorId = select.value || null;
        await gmSetKeyHolder(keyId, actorId);
        ui.notifications.info(game.i18n.localize("PF2E_KEYRING.Notification.HolderUpdated"));
        await this.render(true);
    }

    async #saveKey() {
        const form = this.#getFormState();
        const id = slugifyId(form.id || form.name);
        if (!id) {
            ui.notifications.warn(L("Notification.InvalidId"));
            return;
        }
        if (!form.name) form.name = id;

        await upsertKeyDefinition(id, form);
        this.editingId = id;
        ui.notifications.info(LF("Notification.KeySaved", { name: form.name }));
        await this.render(true);
    }

    async #deleteKey(keyId) {
        const definitions = getKeyDefinitions();
        const name = definitions[keyId]?.name ?? keyId;
        const confirmed = await Dialog.confirm({
            title: L("Panel.Delete"),
            content: `<p>${LF("Panel.DeleteConfirm", { name })}</p>`,
        });
        if (!confirmed) return;

        const deleted = await deleteKeyDefinition(keyId);
        if (!deleted) {
            ui.notifications.warn(LF("Notification.UnknownKey", { key: keyId }));
            return;
        }
        if (this.editingId === keyId) this.editingId = null;
        ui.notifications.info(L("Notification.KeyDeleted"));
        await this.render(true);
    }

    async #resetAll() {
        const confirmed = await Dialog.confirm({
            title: L("Panel.ResetAll"),
            content: `<p>${L("Panel.ResetAllConfirm")}</p>`,
        });
        if (!confirmed) return;
        await resetAllKeyState();
        ui.notifications.info(L("Notification.StateReset"));
        await this.render(true);
    }

    async #copyMarkup(text) {
        try {
            await navigator.clipboard.writeText(text);
            ui.notifications.info(L("Notification.Copied"));
        } catch {
            ui.notifications.warn(L("Notification.CopyFailed"));
        }
    }

    async #postKeyChat(keyId, kind) {
        const definitions = getKeyDefinitions();
        const definition = definitions[keyId];
        if (!definition) {
            ui.notifications.warn(LF("Notification.UnknownKey", { key: keyId }));
            return;
        }

        await this.#sendKeyChatMessage({
            keyId,
            name: definition.name || keyId,
            descriptionPublic: definition.descriptionPublic ?? "",
            kind,
        });
        ui.notifications.info(L("Notification.Posted"));
    }

    async #postFormChat(kind) {
        const form = this.#getFormState();
        const id = slugifyId(form.id || form.name);
        if (!id) {
            ui.notifications.warn(L("Notification.InvalidId"));
            return;
        }

        await this.#sendKeyChatMessage({
            keyId: id,
            name: form.name || id,
            descriptionPublic: form.descriptionPublic ?? "",
            kind,
        });
        ui.notifications.info(L("Notification.Posted"));
    }

    async #sendKeyChatMessage({ keyId, name, descriptionPublic, kind }) {
        const label = name || keyId;
        const markup = kind === "take"
            ? buildTakeMarkup(keyId, label)
            : buildCheckMarkup(keyId, label);

        const parts = [];
        if (descriptionPublic) {
            parts.push(`<p>${escapeHtml(descriptionPublic)}</p>`);
        }
        parts.push(`<p>${markup}</p>`);

        await createKeyringChatMessage({
            content: parts.join("\n"),
            speaker: ChatMessage.getSpeaker(),
        });
    }

    #refreshMarkupPreview() {
        const form = this.#getFormState();
        const id = slugifyId(form.id || form.name) || "new-key";
        const takeEl = this.element.querySelector("[data-keyring-preview='take']");
        const checkEl = this.element.querySelector("[data-keyring-preview='check']");
        if (takeEl) takeEl.textContent = buildTakeMarkup(id, form.name || id);
        if (checkEl) checkEl.textContent = buildCheckMarkup(id, form.name || id);
    }

    #setupDragDrop(signal) {
        const input = this.element.querySelector("[data-keyring-drop='linked-item']");
        if (!input) return;

        input.addEventListener("dragover", (event) => {
            event.preventDefault();
            input.classList.add("keyring-drag-over");
        }, { signal });

        input.addEventListener("dragleave", () => {
            input.classList.remove("keyring-drag-over");
        }, { signal });

        input.addEventListener("drop", (event) => {
            event.preventDefault();
            input.classList.remove("keyring-drag-over");
            try {
                const raw = event.dataTransfer.getData("text/plain");
                const data = JSON.parse(raw);
                if (data.type === "Item" && data.uuid) {
                    input.value = data.uuid;
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                }
            } catch {
                // ignore
            }
        }, { signal });
    }

    async _prepareContext(options) {
        const base = await super._prepareContext(options);
        const definitions = getKeyDefinitions();
        let form = createDefaultDefinition();

        if (this.editingId && definitions[this.editingId]) {
            form = foundry.utils.deepClone(definitions[this.editingId]);
            form.id = this.editingId;
        }

        const stateMap = getKeyStateMap();
        const partyActors = getPartyActors();
        const keyId = slugifyId(form.id || form.name) || "new-key";

        const keys = Object.entries(definitions)
            .map(([id, definition]) => {
                const state = stateMap[id] ?? { status: "missing", holderActorId: null, holderName: "" };
                const holderActorId = state.holderActorId ?? "";
                return {
                    ...definition,
                    id,
                    isHeld: state.status === "held",
                    holderActorId,
                    holderLabel: state.status === "held"
                        ? (state.holderName || game.i18n.localize("PF2E_KEYRING.State.UnknownHolder"))
                        : game.i18n.localize("PF2E_KEYRING.State.Missing"),
                    holderOptions: [
                        {
                            id: "",
                            label: game.i18n.localize("PF2E_KEYRING.Panel.NoHolder"),
                            selected: !holderActorId,
                        },
                        ...partyActors.map((actor) => ({
                            id: actor.id,
                            label: actor.name,
                            selected: actor.id === holderActorId,
                        })),
                    ],
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));

        return {
            ...base,
            isGM: game.user.isGM,
            keys,
            partyActors: partyActors.map((actor) => ({ id: actor.id, name: actor.name })),
            editingId: this.editingId,
            form,
            linkModes: LINK_MODES.map((value) => ({
                value,
                label: game.i18n.localize(`PF2E_KEYRING.LinkMode.${value}`),
                selected: form.linkMode === value,
            })),
            transferModes: TRANSFER_MODES.map((value) => ({
                value,
                label: game.i18n.localize(`PF2E_KEYRING.TransferMode.${value}`),
                selected: form.transferMode === value,
            })),
            markup: {
                take: buildTakeMarkup(keyId, form.name || keyId),
                check: buildCheckMarkup(keyId, form.name || keyId),
            },
        };
    }
}

Hooks.on("pf2eKeyringStateChanged", () => {
    if (activePanel?.rendered) activePanel.render(true);
});