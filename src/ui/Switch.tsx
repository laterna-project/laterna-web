import styles from "./Switch.module.css";

/** Switch (role="switch") with its label and a hint; "danger" for removing a permission. */
export function Switch({
  label,
  hint,
  on,
  onChange,
  disabled = false,
  tone,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  tone?: "danger";
}) {
  return (
    <div className={styles.row} data-ui="switch" data-disabled={disabled || undefined}>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {hint && <span className={styles.hint}>{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={styles.switch}
        data-tone={tone}
        disabled={disabled}
        onClick={() => onChange(!on)}
      >
        <span />
      </button>
    </div>
  );
}
