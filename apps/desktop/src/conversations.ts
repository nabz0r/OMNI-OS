export const EXPORT_BYTE_LIMIT = 5_000_000;
export const CAPTURE_BYTE_LIMIT = 100_000;
const CONVERSATION_LIMIT = 1_000;
const MESSAGE_LIMIT = 500;
const NODE_LIMIT = 20_000;

export interface ImportedMessage {
  role: "user" | "assistant";
  text: string;
}
export interface ImportedConversation {
  title: string;
  provider: "ChatGPT" | "Claude" | "Other";
  messages: ImportedMessage[];
  omitted: number;
}
type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const utf8Bytes = (value: string) =>
  new TextEncoder().encode(value).length;
const invalid = (reason: string): never => {
  throw new Error(reason);
};
const boundedTitle = (value: unknown) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, 200)
    : "Untitled conversation";

function textBlocks(value: unknown): { text: string; omitted: number } {
  if (typeof value === "string") return { text: value, omitted: 0 };
  if (!Array.isArray(value))
    return { text: "", omitted: value == null ? 0 : 1 };
  const texts: string[] = [];
  let omitted = 0;
  for (const block of value) {
    if (typeof block === "string") texts.push(block);
    else if (
      record(block) &&
      block.type === "text" &&
      typeof block.text === "string"
    )
      texts.push(block.text);
    else omitted++;
  }
  return { text: texts.join("\n"), omitted };
}

function addMessage(
  result: ImportedConversation,
  role: unknown,
  content: unknown,
) {
  if (role !== "user" && role !== "assistant") {
    result.omitted++;
    return;
  }
  const extracted = textBlocks(content);
  result.omitted += extracted.omitted;
  if (!extracted.text.trim()) return;
  if (utf8Bytes(extracted.text) > CAPTURE_BYTE_LIMIT)
    invalid(
      "One message exceeds 100,000 UTF-8 bytes. Use a smaller reviewed text excerpt instead.",
    );
  result.messages.push({ role, text: extracted.text });
  if (result.messages.length > MESSAGE_LIMIT)
    invalid(
      "One conversation exceeds 500 text messages. Split the export before importing.",
    );
}

function chatgpt(
  item: RecordValue,
  takeNodes: (count: number) => void,
): ImportedConversation {
  const mapping = item.mapping;
  if (!record(mapping))
    return invalid(
      "This ChatGPT conversation has no supported message mapping.",
    );
  const ids = Object.keys(mapping);
  takeNodes(ids.length);
  const result: ImportedConversation = {
    provider: "ChatGPT",
    title: boundedTitle(item.title),
    messages: [],
    omitted: 0,
  };
  // Never merge edited/regenerated branches into an invented conversation.
  let current = item.current_node;
  if (typeof current !== "string") {
    const parents = new Set<string>();
    for (const node of Object.values(mapping)) {
      if (record(node) && typeof node.parent === "string")
        parents.add(node.parent);
    }
    const leaves = ids.filter((id) => !parents.has(id));
    if (leaves.length !== 1)
      return invalid(
        "A ChatGPT conversation has ambiguous branches and no current_node. Export a selected branch or paste reviewed text.",
      );
    current = leaves[0];
  }
  const seen = new Set<string>();
  const branch: RecordValue[] = [];
  while (typeof current === "string") {
    if (seen.has(current))
      return invalid("The ChatGPT message tree contains a cycle.");
    seen.add(current);
    if (!Object.hasOwn(mapping, current) || !record(mapping[current]))
      return invalid(
        "The ChatGPT conversation references a missing message node.",
      );
    const node = mapping[current] as RecordValue;
    branch.push(node);
    if (node.parent != null && typeof node.parent !== "string")
      return invalid(
        "The ChatGPT conversation has an invalid parent reference.",
      );
    current = node.parent;
  }
  result.omitted += ids.length - seen.size;
  for (const node of branch.reverse()) {
    if (node.message == null) continue;
    if (!record(node.message))
      return invalid("The ChatGPT conversation contains an invalid message.");
    const message = node.message;
    const metadata = record(message.metadata) ? message.metadata : {};
    if (
      metadata.is_visually_hidden_from_conversation === true ||
      (message.channel != null && message.channel !== "final") ||
      (message.recipient != null && message.recipient !== "all")
    ) {
      result.omitted++;
      continue;
    }
    const content = record(message.content) ? message.content : {};
    if (content.content_type !== "text") {
      result.omitted++;
      continue;
    }
    addMessage(
      result,
      record(message.author) ? message.author.role : null,
      content.parts,
    );
  }
  return result;
}

function claude(
  item: RecordValue,
  takeNodes: (count: number) => void,
): ImportedConversation {
  if (!Array.isArray(item.chat_messages))
    return invalid("This Claude conversation has no supported messages.");
  takeNodes(item.chat_messages.length);
  const result: ImportedConversation = {
    provider: "Claude",
    title: boundedTitle(item.name),
    messages: [],
    omitted: 0,
  };
  for (const message of item.chat_messages) {
    if (!record(message))
      return invalid("The Claude export contains an invalid message.");
    // Prefer structured content; do not duplicate the legacy text field.
    const content = message.content ?? message.text;
    const role = message.sender === "human" ? "user" : message.sender;
    addMessage(result, role, content);
    for (const key of ["attachments", "files"]) {
      if (Array.isArray(message[key])) result.omitted += message[key].length;
    }
  }
  return result;
}

function neutral(
  item: RecordValue,
  takeNodes: (count: number) => void,
): ImportedConversation {
  if (!Array.isArray(item.messages))
    return invalid("Each neutral conversation must contain a messages array.");
  takeNodes(item.messages.length);
  const result: ImportedConversation = {
    provider: "Other",
    title: boundedTitle(item.title),
    messages: [],
    omitted: 0,
  };
  for (const message of item.messages) {
    if (!record(message))
      return invalid("The neutral export contains an invalid message.");
    addMessage(result, message.role, message.content);
  }
  return result;
}

/** Parses selected local text only. Provider export layouts are not stable APIs. */
export function parseConversationExport(raw: string): ImportedConversation[] {
  if (utf8Bytes(raw) > EXPORT_BYTE_LIMIT)
    return invalid(
      "Choose a JSON export of at most 5 MB. Split larger exports first.",
    );
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return invalid(
      "This is not valid JSON. Extract the conversation JSON from the downloaded archive first.",
    );
  }
  const neutralFormat =
    record(value) && value.format === "omni-conversations-v1";
  const items =
    neutralFormat && record(value)
      ? value.conversations
      : Array.isArray(value)
        ? value
        : [value];
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.length > CONVERSATION_LIMIT
  )
    return invalid("Choose an export containing 1–1,000 conversations.");
  let nodes = 0;
  const takeNodes = (count: number) => {
    nodes += count;
    if (nodes > NODE_LIMIT)
      invalid(
        "This export exceeds 20,000 message nodes. Split it before importing.",
      );
  };
  const result = items.map((item) => {
    if (!record(item))
      return invalid("Every exported conversation must be an object.");
    if (neutralFormat) return neutral(item, takeNodes);
    if (Object.hasOwn(item, "mapping")) return chatgpt(item, takeNodes);
    if (Object.hasOwn(item, "chat_messages")) return claude(item, takeNodes);
    return invalid(
      "Unsupported conversation format. Use a ChatGPT mapping, Claude chat_messages, or omni-conversations-v1 export; otherwise paste reviewed text.",
    );
  });
  if (!result.some((conversation) => conversation.messages.length))
    return invalid(
      "This export contains no supported user or assistant text messages.",
    );
  return result;
}

export function reviewConversation(
  conversation: ImportedConversation,
  selected: ReadonlySet<number>,
) {
  if (
    [...selected].some(
      (index) =>
        !Number.isInteger(index) ||
        index < 0 ||
        index >= conversation.messages.length,
    )
  )
    return invalid(
      "The message selection is invalid. Review the conversation again.",
    );
  const messages = conversation.messages.filter((_, index) =>
    selected.has(index),
  );
  if (!messages.length)
    return invalid("Select at least one message to review.");
  // JSON quoting preserves role boundaries when message text contains forged labels.
  const content = JSON.stringify(
    {
      format: "omni-reviewed-conversation-v1",
      provider: conversation.provider,
      title: conversation.title,
      messages,
    },
    null,
    2,
  );
  if (utf8Bytes(content) > CAPTURE_BYTE_LIMIT)
    return invalid(
      "The selected messages exceed 100,000 UTF-8 bytes including their labels. Select fewer messages.",
    );
  return {
    content,
    title: conversation.title,
    source: `${conversation.provider.toLowerCase()}_export_review`,
  };
}
