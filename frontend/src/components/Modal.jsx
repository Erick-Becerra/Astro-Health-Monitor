import { useEffect, useRef } from "react";

// A window on top of the page. It uses the browser's own <dialog>, so Esc closes
// it and the keyboard stays inside while it is open.
export default function Modal({ title, onClose, children }) {
  const dialog = useRef(null);

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-label={title}
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && onClose()}
    >
      <header className="modal-head">
        <h2>{title}</h2>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
