import { MODULE_ID, TRANSFER_MODES } from "./const.js";
import { registerEnrichers, registerClickListeners, unregisterClickListeners } from "./enrichers.js";
import { registerSocket } from "./socket.js";
import { openKeyRingPanel } from "./panel.js";
import { destroyKeyRingHud, mountKeyRingHud, renderKeyRingHud, setHudVisible } from "./hud.js";

Hooks.once("init", () => {
    game.settings.register(MODULE_ID, "keyDefinitions", {
        name: "PF2E_KEYRING.Settings.Definitions.Name",
        scope: "world",
        config: false,
        type: Object,
        default: {},
    });

    game.settings.register(MODULE_ID, "keyState", {
        name: "PF2E_KEYRING.Settings.State.Name",
        scope: "world",
        config: false,
        type: Object,
        default: {},
    });

    game.settings.register(MODULE_ID, "defaultTransferMode", {
        name: "PF2E_KEYRING.Settings.DefaultTransfer.Name",
        hint: "PF2E_KEYRING.Settings.DefaultTransfer.Hint",
        scope: "world",
        config: true,
        type: String,
        default: "gm-only",
        choices: Object.fromEntries(
            TRANSFER_MODES.map((mode) => [
                mode,
                `PF2E_KEYRING.TransferMode.${mode}`,
            ]),
        ),
    });

    game.settings.register(MODULE_ID, "hudVisible", {
        name: "PF2E_KEYRING.Settings.HudVisible.Name",
        hint: "PF2E_KEYRING.Settings.HudVisible.Hint",
        scope: "client",
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            if (game.ready) renderKeyRingHud();
        },
    });

    game.settings.register(MODULE_ID, "hudCollapsed", {
        scope: "client",
        config: false,
        type: Boolean,
        default: false,
    });

    game.settings.register(MODULE_ID, "hudPosition", {
        scope: "client",
        config: false,
        type: Object,
        default: null,
    });

    registerEnrichers();
    registerSocket();

    game.keybindings.register(MODULE_ID, "open-panel", {
        name: "PF2E_KEYRING.Keybinding.Name",
        hint: "PF2E_KEYRING.Keybinding.Hint",
        editable: [{ key: "KeyK", modifiers: ["Alt"] }],
        restricted: true,
        onDown: () => {
            openKeyRingPanel();
            return true;
        },
    });
});

Hooks.once("ready", async () => {
    const { migrateKeyDefinitions } = await import("./definitions.js");
    await migrateKeyDefinitions();
    registerClickListeners();
    mountKeyRingHud();
});

Hooks.on("canvasReady", () => {
    renderKeyRingHud();
});

Hooks.on("getSceneControlButtons", (controls) => {
    const tokenControls = controls.tokens ?? controls.token;
    if (!tokenControls) return;

    const hudTool = {
        name: "pf2e-keyring-hud",
        title: "PF2E_KEYRING.SceneControl.HudTooltip",
        icon: "fa-solid fa-list-check",
        order: 90,
        toggle: true,
        active: game.settings.get(MODULE_ID, "hudVisible"),
        onChange: async (_event, active) => {
            await setHudVisible(active);
        },
    };

    const tools = [hudTool];

    if (game.user.isGM) {
        tools.push({
            name: "pf2e-keyring-panel",
            title: "PF2E_KEYRING.SceneControl.Tooltip",
            icon: "fa-solid fa-key",
            order: 91,
            button: true,
            onChange: () => {
                openKeyRingPanel();
            },
        });
    }

    if (Array.isArray(tokenControls.tools)) {
        for (const tool of tools) {
            if (!tokenControls.tools.some((t) => t.name === tool.name)) {
                tokenControls.tools.push(tool);
            }
        }
    } else {
        tokenControls.tools ??= {};
        for (const tool of tools) {
            tokenControls.tools[tool.name] ??= tool;
        }
    }
});

Hooks.on("settingChange", async (module, key) => {
    if (module !== MODULE_ID) return;
    if (!["keyDefinitions", "keyState"].includes(key)) return;

    if (key === "keyState") {
        const { clearClientKeyStateOverride } = await import("./state.js");
        clearClientKeyStateOverride();
    }

    Hooks.callAll("pf2eKeyringStateChanged");
});

Hooks.once("disableModule", (module) => {
    if (module !== MODULE_ID) return;
    unregisterClickListeners();
    destroyKeyRingHud();
});