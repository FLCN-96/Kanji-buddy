// ConfirmModal — shared in-app dialog that replaces native confirm()/alert().
// Native dialogs block the main thread, look out-of-place against the kb-*
// aesthetic, and miss our keyboard wiring. This matches the ku-modal vibe
// (scrim + cornered panel + mono accents) but is purpose-built for prompts.
//
// API:
//   <ConfirmModal
//     open
//     tone="danger"           // 'danger' (magenta) | 'info' (cyan)
//     title="ABORT MISSION?"
//     body="Leeches remain at large."
//     confirmLabel="ABORT"
//     cancelLabel="STAY"      // omit for single-button info mode
//     onConfirm={() => ...}
//     onCancel={() => ...}    // omit for single-button info mode
//   />
//
// Keyboard: ESC = cancel (or confirm in info mode), Enter/Space = confirm.
// The keydown listener is registered with capture + stopImmediatePropagation,
// so the parent shell's window-level handlers don't also fire while the
// modal is up.

const ConfirmModal = ({
  open,
  title,
  body,
  confirmLabel = 'CONFIRM',
  cancelLabel,
  onConfirm,
  onCancel,
  tone = 'danger',
}) => {
  const confirmRef = React.useRef(null);
  const isInfo = !cancelLabel || !onCancel;

  React.useEffect(() => {
    if (!open) return;
    // Defer focus a tick so the entry animation can start without snapping
    // the focus ring in mid-frame.
    const id = requestAnimationFrame(() => confirmRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopImmediatePropagation();
        (isInfo ? onConfirm : onCancel)?.();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); e.stopImmediatePropagation();
        onConfirm?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, isInfo, onConfirm, onCancel]);

  if (!open) return null;

  const scrimDismiss = isInfo ? onConfirm : onCancel;

  return (
    <div
      className="kb-confirm-scrim"
      onClick={scrimDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="kb-confirm-title"
    >
      <div className={`kb-confirm tone-${tone}`} onClick={e => e.stopPropagation()}>
        <span className="kb-confirm-corner tl">◤</span>
        <span className="kb-confirm-corner tr">◥</span>
        <span className="kb-confirm-corner bl">◣</span>
        <span className="kb-confirm-corner br">◢</span>

        <header className="kb-confirm-top">
          <span>▸ SYSTEM // {isInfo ? 'NOTICE' : 'CONFIRM'}</span>
        </header>

        <div className="kb-confirm-body">
          <div id="kb-confirm-title" className="kb-confirm-title">{title}</div>
          {body && <div className="kb-confirm-msg">{body}</div>}
        </div>

        <div className={`kb-confirm-actions${isInfo ? ' is-info' : ''}`}>
          {!isInfo && (
            <button
              type="button"
              className="kb-confirm-btn kb-confirm-btn-cancel"
              onClick={onCancel}
            >
              ‹ {cancelLabel}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            className={`kb-confirm-btn kb-confirm-btn-confirm tone-${tone}`}
            onClick={onConfirm}
          >
            {confirmLabel} ▸
          </button>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { ConfirmModal });
