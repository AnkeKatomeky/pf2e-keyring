import { MODULE_ID, DEFAULT_KEY_DEFINITION } from "./const.js";
import { slugifyId } from "./helpers.js";

export function getKeyDefinitions() {
    return foundry.utils.deepClone(
        game.settings.get(MODULE_ID, "keyDefinitions") ?? {},
    );
}

export async function setKeyDefinitions(definitions) {
    const payload = Object.fromEntries(
        Object.entries(foundry.utils.deepClone(definitions)),
    );
    await game.settings.set(MODULE_ID, "keyDefinitions", payload);
    Hooks.callAll("pf2eKeyringStateChanged");
}

export function resolveKeyId(keyRef) {
    if (!keyRef) return null;

    const definitions = getKeyDefinitions();
    if (definitions[keyRef]) return keyRef;

    const slug = slugifyId(keyRef);
    if (slug && definitions[slug]) return slug;

    for (const [id, definition] of Object.entries(definitions)) {
        if (definition.name === keyRef || definition.id === keyRef) return id;
    }

    return null;
}

export function getKeyDefinition(keyId) {
    const definitions = getKeyDefinitions();
    const resolved = resolveKeyId(keyId);
    return resolved ? definitions[resolved] ?? null : null;
}

export function createDefaultDefinition(name = "") {
    return foundry.utils.deepClone({
        ...DEFAULT_KEY_DEFINITION,
        name: name || "",
        checkSuccessText: game.i18n.localize("PF2E_KEYRING.Defaults.CheckSuccess"),
        checkFailureText: game.i18n.localize("PF2E_KEYRING.Defaults.CheckFailure"),
    });
}

function stripDefinitionPayload(data) {
    const payload = foundry.utils.deepClone(data);
    delete payload.id;
    return payload;
}

export async function upsertKeyDefinition(keyId, data) {
    const definitions = getKeyDefinitions();
    const id = slugifyId(keyId || data.name);
    if (!id) throw new Error("Invalid key id");

    definitions[id] = foundry.utils.mergeObject(
        createDefaultDefinition(data.name),
        { ...stripDefinitionPayload(data), name: data.name || id },
        { inplace: false, overwrite: true },
    );

    await setKeyDefinitions(definitions);
    return id;
}

export async function deleteKeyDefinition(keyId) {
    const resolvedId = resolveKeyId(keyId);
    if (!resolvedId) return false;

    const definitions = getKeyDefinitions();
    const next = Object.fromEntries(
        Object.entries(definitions).filter(([id]) => id !== resolvedId),
    );

    await setKeyDefinitions(next);

    const { clearKeyState } = await import("./state.js");
    await clearKeyState(resolvedId);
    return true;
}

export async function migrateKeyDefinitions() {
    if (!game.user.isActiveGM) return;

    const definitions = getKeyDefinitions();
    let changed = false;
    const cleaned = {};

    for (const [id, definition] of Object.entries(definitions)) {
        if (definition.id !== undefined) {
            changed = true;
        }
        const payload = stripDefinitionPayload(definition);
        cleaned[id] = payload;
    }

    if (changed) {
        await setKeyDefinitions(cleaned);
    }
}