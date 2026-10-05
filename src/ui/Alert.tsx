import type { ReactNode } from "react";
import styles from "./Alert.module.css";

/** Error or information message, announced to screen readers. */
export function Alert({ tone = "danger", children }: { tone?: "danger" | "info"; children: ReactNode }) {
  return (
    <p
      className={`${styles.alert} ${styles[tone]}`}
      role={tone === "danger" ? "alert" : "status"}
      data-ui="alert"
      data-tone={tone}
    >
      {children}
    </p>
  );
}
