import { type ReactNode, useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import styles from "./Dialog.module.css";
import { Icon } from "./Icon";

/**
 * Modal dialog (the <dialog> element): the browser keeps focus inside and Escape closes it. Mounted
 * only while open; the field marked data-autofocus gets focus.
 */
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Wider, for content that needs it (folder picker). */
  wide?: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el || el.open) return;
    el.showModal();
    // The field marked data-autofocus takes focus (otherwise the browser gives it to the first
    // button, the close button); autoFocus does not work because the dialog is still closed at that
    // point.
    el.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);
  return (
    // A click on the backdrop (the element itself) closes it; a click in the content does not.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape already closes the dialog natively.
    <dialog
      ref={ref}
      className={styles.dialog}
      data-wide={wide || undefined}
      data-ui="dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
    >
      <div className={styles.box}>
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={() => ref.current?.close()}
            aria-label={t("common.close")}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
