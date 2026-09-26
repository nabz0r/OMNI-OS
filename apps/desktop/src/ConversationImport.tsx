import { useEffect, useRef, useState } from "react";
import {
  EXPORT_BYTE_LIMIT,
  parseConversationExport,
  reviewConversation,
  utf8Bytes,
  type ImportedConversation,
} from "./conversations";
import "./conversation-import.css";

export default function ConversationImport({
  onReview,
}: {
  onReview: (value: { content: string; title: string; source: string }) => void;
}) {
  const [conversations, setConversations] = useState<ImportedConversation[]>(
    [],
  );
  const [index, setIndex] = useState(-1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const epoch = useRef(0);
  useEffect(
    () => () => {
      epoch.current++;
    },
    [],
  );
  const current = conversations[index];
  let reviewed: ReturnType<typeof reviewConversation> | undefined;
  let selectionError = "";
  if (current) {
    try {
      reviewed = reviewConversation(current, selected);
    } catch (error) {
      selectionError = (error as Error).message;
    }
  }
  const reset = () => {
    setConversations([]);
    setIndex(-1);
    setSelected(new Set());
    setError("");
  };
  const parse = (text: string) => {
    reset();
    try {
      setConversations(parseConversationExport(text));
      setRaw("");
      setPasteOpen(false);
    } catch (error) {
      setError((error as Error).message);
    }
  };
  const read = async (file?: File) => {
    const attempt = ++epoch.current;
    reset();
    setRaw("");
    if (!file) {
      setReading(false);
      return;
    }
    setReading(true);
    try {
      if (
        !file.name.toLowerCase().endsWith(".json") ||
        file.size > EXPORT_BYTE_LIMIT
      )
        throw new Error("Choose an extracted .json file of at most 5 MB.");
      const bytes = await file.arrayBuffer();
      if (attempt !== epoch.current) return;
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new Error("The JSON file must use valid UTF-8 text.");
      }
      parse(text);
    } catch (error) {
      if (attempt === epoch.current) setError((error as Error).message);
    } finally {
      if (attempt === epoch.current) setReading(false);
    }
  };
  const choose = (next: number) => {
    setIndex(next);
    setSelected(
      new Set(
        conversations[next]?.messages.flatMap((message, i) =>
          message.role === "user" ? [i] : [],
        ) ?? [],
      ),
    );
  };
  return (
    <div className="conversation-import">
      <p>
        Choose an extracted ChatGPT or Claude JSON export, or an OMNI neutral
        conversation file. The file is read on this device. Nothing is saved
        yet.
      </p>
      <label htmlFor="conversation-file">Conversation JSON · up to 5 MB</label>
      <input
        id="conversation-file"
        type="file"
        accept=".json,application/json"
        onChange={(event) => {
          void read(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <details
        open={pasteOpen}
        onToggle={(event) => setPasteOpen(event.currentTarget.open)}
      >
        <summary>Or paste exported JSON</summary>
        <label htmlFor="conversation-json">Export JSON</label>
        <textarea
          id="conversation-json"
          rows={4}
          value={raw}
          maxLength={EXPORT_BYTE_LIMIT}
          disabled={reading}
          onChange={(event) => {
            reset();
            setRaw(event.target.value);
          }}
        />
        <button
          className="secondary"
          disabled={reading || !raw.trim()}
          onClick={() => parse(raw)}
        >
          Read conversations
        </button>
      </details>
      {reading && <p role="status">Reading the local file…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!!conversations.length && (
        <>
          <label htmlFor="conversation-choice">
            Choose one conversation · {conversations.length} available
          </label>
          <select
            id="conversation-choice"
            value={index}
            onChange={(event) => choose(Number(event.target.value))}
          >
            <option value={-1}>Select a conversation</option>
            {conversations.map((conversation, i) => (
              <option value={i} key={i}>
                {conversation.provider} · {conversation.title} ·{" "}
                {conversation.messages.length} text messages
              </option>
            ))}
          </select>
        </>
      )}
      {current && (
        <>
          <p className="import-boundary">
            Only your messages are selected by default. AI replies are context,
            not verified facts. Roles and source labels come from the file and
            are not authenticated. Exclude personal or unrelated work content.
          </p>
          {current.omitted > 0 && (
            <p role="status">
              {current.omitted} unsupported items, hidden messages or off-branch
              nodes omitted. Files, images, tool output and hidden reasoning are
              not imported.
            </p>
          )}
          <div className="import-selection-actions">
            <button className="secondary" onClick={() => choose(index)}>
              Select user messages
            </button>
            <button
              className="secondary"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </button>
          </div>
          <div className="import-messages" aria-label="Messages to keep">
            {current.messages.map((message, i) => (
              <article key={i}>
                <label className="import-message-label">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={(event) => {
                      const next = new Set(selected);
                      if (event.target.checked) next.add(i);
                      else next.delete(i);
                      setSelected(next);
                    }}
                  />
                  <span>
                    Message {i + 1} ·{" "}
                    {message.role === "user" ? "User" : "AI assistant"}
                  </span>
                </label>
                <pre>{message.text}</pre>
              </article>
            ))}
          </div>
          <p role="status">
            {selected.size} {selected.size === 1 ? "message" : "messages"}{" "}
            selected
            {reviewed
              ? ` · ${utf8Bytes(reviewed.content).toLocaleString()} UTF-8 bytes`
              : ""}
            .
          </p>
          {selectionError && (
            <p className="error" role="alert">
              {selectionError}
            </p>
          )}
          <button
            className="primary full"
            disabled={!reviewed || reading}
            onClick={() => {
              if (reviewed) onReview(reviewed);
            }}
          >
            Use selected messages
          </button>
        </>
      )}
    </div>
  );
}
