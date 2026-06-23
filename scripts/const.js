export const MODULE_ID = "pf2e-keyring";

export const SOCKET_CHANNEL = `module.${MODULE_ID}`;

export const LINK_MODES = ["none", "reference", "sync", "either"];

export const TRANSFER_MODES = ["always", "request", "gm-only"];

export const DEFAULT_KEY_DEFINITION = {
    name: "",
    descriptionPublic: "",
    descriptionGm: "",
    checkSuccessText: "",
    checkFailureText: "",
    linkedItemUuid: "",
    linkMode: "none",
    transferMode: "",
    consumable: false,
};