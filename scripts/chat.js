export async function createKeyringChatMessage(data) {
    let content = data.content ?? "";

    if (typeof content === "string" && /@Key(?:Take|Check)\[/.test(content)) {
        content = await TextEditor.enrichHTML(content, { async: true });
    }

    return ChatMessage.create({
        style: CONST.CHAT_MESSAGE_STYLES.OOC,
        ...data,
        content,
    });
}