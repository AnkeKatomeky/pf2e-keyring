import { SOCKET_CHANNEL } from "./const.js";

export function broadcastKeyState(stateMap) {
    if (!(game.user.isActiveGM ?? game.user.isGM)) return;

    game.socket.emit(SOCKET_CHANNEL, {
        action: "stateSync",
        keyState: foundry.utils.deepClone(stateMap),
    });
}