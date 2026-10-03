import { useEffect, useId, useRef } from 'react';

function isOutsideDialog(event) {
  if (event.target !== event.currentTarget) return false;
  const bounds = event.currentTarget.getBoundingClientRect();
  return (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  );
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel = '确认',
  onConfirm,
  onCancel,
  destructive = false,
}) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const backdropPointerRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    if (!dialog.open) dialog.showModal();
    cancelRef.current?.focus({ preventScroll: true });

    return () => {
      if (dialog.open) dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog
      className={`diary-confirm${destructive ? ' is-destructive' : ''}`}
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={children ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onPointerDown={(event) => {
        backdropPointerRef.current = isOutsideDialog(event);
      }}
      onClick={(event) => {
        if (backdropPointerRef.current && isOutsideDialog(event)) onCancel();
        backdropPointerRef.current = false;
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {children ? <div className="diary-confirm-copy" id={descriptionId}>{children}</div> : null}
      <div className="diary-confirm-actions">
        <button className="diary-secondary" type="button" ref={cancelRef} autoFocus onClick={onCancel}>
          取消
        </button>
        <button
          className={`diary-primary${destructive ? ' is-destructive' : ''}`}
          type="button"
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
