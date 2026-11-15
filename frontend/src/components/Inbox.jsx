import { useState } from "react";
import { describeError, postJSON } from "../api.js";
import { connection } from "../connection.js";
import { ago } from "../lib/levels.js";

// Messages from Earth that the astronaut has not acknowledged yet.
export default function Inbox({ messages, onChanged }) {
  const [error, setError] = useState(null);

  const acknowledge = async (id) => {
    if (connection.isDown()) return connection.warn();
    try {
      await postJSON(`/api/messages/${id}/ack`);
      setError(null);
      onChanged();
    } catch (e) {
      setError(e);
    }
  };

  if (!messages.length) return <p className="muted">No new messages from Earth.</p>;

  return (
    <>
      <ul className="inbox">
        {messages.map((message) => (
          <li key={message.id} className={`inbox-item severity-${message.severity}`}>
            <div className="inbox-top">
              <span className="level-tag">{message.severity}</span>
              <time dateTime={message.received_at}>{ago(message.received_at)}</time>
            </div>
            <p>{message.body}</p>
            <button type="button" className="link-button" onClick={() => acknowledge(message.id)}>
              Mark as read
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="notice">{describeError(error)}</p>}
    </>
  );
}
