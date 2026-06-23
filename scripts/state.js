import { MODULE_ID } from "./const.js";
import { broadcastKeyState } from "./broadcast.js";

let clientKeyStateOverride = null;

export function clearClientKeyStateOverride() {
    clientKeyStateOverride = null;
}

export function applyClientKeyStateSync(keyState) {
    if (game.user.isActiveGM) {
        Hooks.callAll("pf2eKeyringStateChanged");
        return;
    }

    clientKeyStateOverride = foundry.utils.deepClone(keyState ?? {});
    Hooks.callAll("pf2eKeyringStateChanged");
}

export function getKeyStateMap() {
    const source = clientKeyStateOverride
        ?? game.settings.get(MODULE_ID, "keyState")
        ?? {};
    return foundry.utils.deepClone(source);
}

export async function setKeyStateMap(stateMap) {
    const payload = Object.fromEntries(
        Object.entries(foundry.utils.deepClone(stateMap)),
    );
    await game.settings.set(MODULE_ID, "keyState", payload);
    broadcastKeyState(payload);
    Hooks.callAll("pf2eKeyringStateChanged");
}

export function getKeyState(keyId) {
    const stateMap = getKeyStateMap();
    return stateMap[keyId] ?? { status: "missing", holderActorId: null, holderName: "" };
}

export async function updateKeyState(keyId, patch) {
    const stateMap = getKeyStateMap();
    const current = stateMap[keyId] ?? { status: "missing", holderActorId: null, holderName: "" };
    stateMap[keyId] = foundry.utils.mergeObject(current, patch, { inplace: false, overwrite: true });
    await setKeyStateMap(stateMap);
    return stateMap[keyId];
}

export async function clearKeyState(keyId) {
    const stateMap = getKeyStateMap();
    delete stateMap[keyId];
    await setKeyStateMap(stateMap);
}

export async function resetAllKeyState() {
    await setKeyStateMap({});
}

export async function assignKeyHolder(keyId, actor) {
    return updateKeyState(keyId, {
        status: "held",
        holderActorId: actor?.id ?? null,
        holderName: actor?.name ?? "",
        acquiredAt: Date.now(),
    });
}

export async function releaseKey(keyId) {
    return updateKeyState(keyId, {
        status: "missing",
        holderActorId: null,
        holderName: "",
        acquiredAt: null,
    });
}