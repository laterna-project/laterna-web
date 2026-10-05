import type { HTMLAttributes } from "react";
import styles from "./Card.module.css";

/** Raised, rounded surface. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={[styles.card, className].filter(Boolean).join(" ")} data-ui="panel" {...rest} />;
}
