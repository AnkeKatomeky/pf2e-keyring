import { MODULE_ID } from "./const.js";
import { buildKeyDisplayRows } from "./display.js";
import { openKeyRingPanel } from "./panel.js";
import { escapeHtml } from "./helpers.js";

const HUD_ID = "keyring-hud";

let dragState = null;
let hudListenersBound = false;

export function isHudVisible() {
    return game.settings.get(MODULE_ID, "hudVisible") ?? true;
}

export function isHudCollapsed() {
    return game.settings.get(MODULE_ID, "hudCollapsed") ?? false;
}

export function getHudPosition() {
    return game.settings.get(MODULE_ID, "hudPosition") ?? null;
}

export async function setHudVisible(visible) {
    await game.settings.set(MODULE_ID, "hudVisible", visible);
    renderKeyRingHud();
}

export function mountKeyRingHud() {
    bindHudListeners();
    renderKeyRingHud();
}

export function destroyKeyRingHud() {
    document.getElementById(HUD_ID)?.remove();
    dragState = null;
}

function bindHudListeners() {
    if (hudListenersBound) return;
    hudListenersBound = true;

    document.addEventListener("click", onHudDocumentClick);
    document.addEventListener("mousedown", onHudMouseDown);
    document.addEventListener("mousemove", onHudMouseMove);
    document.addEventListener("mouseup", onHudMouseUp);
}

function onHudDocumentClick(event) {
    const root = document.getElementById(HUD_ID);
    if (!root?.contains(event.target)) return;

    const collapseBtn = event.target.closest("[data-keyring-hud='collapse']");
    if (collapseBtn) {
        event.preventDefault();
        game.settings.set(MODULE_ID, "hudCollapsed", !isHudCollapsed()).then(() => {
            renderKeyRingHud();
        });
        return;
    }

    const panelBtn = event.target.closest("[data-keyring-hud='open-panel']");
    if (panelBtn && game.user.isGM) {
        event.preventDefault();
        openKeyRingPanel();
    }
}

function onHudMouseDown(event) {
    if (event.button !== 0) return;

    const root = document.getElementById(HUD_ID);
    if (!root) return;

    const dragHandle = event.target.closest("[data-keyring-hud='drag']");
    if (!dragHandle || !root.contains(dragHandle)) return;

    event.preventDefault();

    const rect = root.getBoundingClientRect();
    dragState = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
    };

    root.classList.add("is-dragging");
}

function onHudMouseMove(event) {
    if (!dragState) return;

    const root = document.getElementById(HUD_ID);
    if (!root) return;

    const left = Math.max(0, Math.min(window.innerWidth - root.offsetWidth, event.clientX - dragState.offsetX));
    const top = Math.max(0, Math.min(window.innerHeight - root.offsetHeight, event.clientY - dragState.offsetY));

    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
    root.style.bottom = "auto";
    root.style.right = "auto";
    root.classList.add("has-custom-position");
}

async function onHudMouseUp(event) {
    if (!dragState) return;

    const root = document.getElementById(HUD_ID);
    dragState = null;
    if (!root) return;

    root.classList.remove("is-dragging");

    const left = Number.parseFloat(root.style.left) || 0;
    const top = Number.parseFloat(root.style.top) || 0;
    await game.settings.set(MODULE_ID, "hudPosition", { left, top });
}

function applyHudPosition(root) {
    const position = getHudPosition();
    if (!position || position.left == null || position.top == null) {
        root.style.left = "";
        root.style.top = "";
        root.style.bottom = "";
        root.style.right = "";
        root.classList.remove("has-custom-position");
        return;
    }

    root.style.left = `${position.left}px`;
    root.style.top = `${position.top}px`;
    root.style.bottom = "auto";
    root.style.right = "auto";
    root.classList.add("has-custom-position");
}

export function renderKeyRingHud() {
    const host = document.getElementById("interface") ?? document.body;
    let root = document.getElementById(HUD_ID);

    if (!isHudVisible()) {
        root?.remove();
        return;
    }

    if (!root) {
        root = document.createElement("aside");
        root.id = HUD_ID;
        host.append(root);
    }

    applyHudPosition(root);

    const isGM = game.user.isGM;
    const collapsed = isHudCollapsed();
    const rows = buildKeyDisplayRows({ gmView: isGM });
    const heldCount = rows.filter((row) => row.isHeld).length;

    const title = game.i18n.localize("PF2E_KEYRING.Hud.Title");
    const subtitle = isGM
        ? game.i18n.format("PF2E_KEYRING.Hud.GmSubtitle", { held: heldCount, total: rows.length })
        : game.i18n.format("PF2E_KEYRING.Hud.PlayerSubtitle", { count: heldCount });

    const itemsHtml = rows.length
        ? rows.map((row) => {
            const statusClass = row.isHeld ? "keyring-hud-item--held" : "keyring-hud-item--missing";
            const statusLabel = row.isHeld
                ? game.i18n.localize("PF2E_KEYRING.State.Held")
                : game.i18n.localize("PF2E_KEYRING.State.Missing");
            const holder = row.isHeld && row.holderName
                ? `<span class="keyring-hud-holder">${escapeHtml(row.holderName)}</span>`
                : "";

            const gmNote = isGM && row.descriptionGm
                ? `<div class="keyring-hud-gm" data-visibility="gm">${escapeHtml(row.descriptionGm)}</div>`
                : "";

            const description = row.descriptionPublic
                ? `<div class="keyring-hud-desc">${escapeHtml(row.descriptionPublic)}</div>`
                : "";

            return `<li class="keyring-hud-item ${statusClass}">
                <div class="keyring-hud-item-head">
                    <span class="keyring-hud-name">${escapeHtml(row.name)}</span>
                    ${isGM ? `<span class="keyring-hud-status">${statusLabel}</span>` : ""}
                </div>
                ${holder}
                ${description}
                ${gmNote}
            </li>`;
        }).join("")
        : `<li class="keyring-hud-empty">${game.i18n.localize(
            isGM ? "PF2E_KEYRING.Hud.EmptyGm" : "PF2E_KEYRING.Hud.EmptyPlayer",
        )}</li>`;

    root.className = `pf2e-keyring-hud${collapsed ? " is-collapsed" : ""}${isGM ? " is-gm" : " is-player"}${getHudPosition() ? " has-custom-position" : ""}`;
    root.innerHTML = `
        <header class="keyring-hud-header">
            <button type="button" class="keyring-hud-drag" data-keyring-hud="drag" title="${game.i18n.localize("PF2E_KEYRING.Hud.Drag")}">
                <i class="fa-solid fa-grip-vertical"></i>
            </button>
            <button type="button" class="keyring-hud-collapse" data-keyring-hud="collapse" title="${game.i18n.localize("PF2E_KEYRING.Hud.ToggleCollapse")}">
                <i class="fa-solid fa-key"></i>
                <span class="keyring-hud-title">${title}</span>
                <i class="fa-solid fa-chevron-${collapsed ? "down" : "up"} keyring-hud-chevron"></i>
            </button>
            ${isGM ? `<button type="button" class="keyring-hud-edit" data-keyring-hud="open-panel" title="${game.i18n.localize("PF2E_KEYRING.Hud.OpenPanel")}"><i class="fa-solid fa-pen-to-square"></i></button>` : ""}
        </header>
        <div class="keyring-hud-body">
            <p class="keyring-hud-subtitle">${subtitle}</p>
            <ul class="keyring-hud-list">${itemsHtml}</ul>
        </div>
    `;

    applyHudPosition(root);
}

Hooks.on("pf2eKeyringStateChanged", () => {
    if (game.ready) renderKeyRingHud();
});