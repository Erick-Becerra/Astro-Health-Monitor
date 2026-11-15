import { useEffect, useRef } from "react";
import { useT } from "../shared/useT.js";

// A window on top of the page. It uses the browser's own <dialog>, so Esc closes
// it and the keyboard stays inside while it is open.
export default function Modal({ title, onClose, children }) {
  const t = useT();
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
        <button type="button" className="modal-close" aria-label={t.ui("close")} onClick={onClose}>
          ×
        </button>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
