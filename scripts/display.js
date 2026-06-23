import { getKeyDefinitions } from "./definitions.js";
import { getKeyStateMap } from "./state.js";

export function buildKeyDisplayRows({ gmView = false } = {}) {
    const definitions = getKeyDefinitions();
    const stateMap = getKeyStateMap();

    return Object.entries(definitions)
        .map(([id, definition]) => {
            const state = stateMap[id] ?? {
                status: "missing",
                holderActorId: null,
                holderName: "",
            };
            const isHeld = state.status === "held";

            return {
                id,
                name: definition.name,
                descriptionPublic: definition.descriptionPublic ?? "",
                descriptionGm: definition.descriptionGm ?? "",
                isHeld,
                holderName: isHeld ? (state.holderName || "") : "",
            };
        })
        .filter((row) => gmView || row.isHeld)
        .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}