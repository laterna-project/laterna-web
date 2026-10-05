/**
 * Success message ("Profile saved.") announced by screen readers: the role="status" region exists
 * before the message, otherwise the announcement is not guaranteed. Empty, it takes no space.
 */
export function Status({ message, className }: { message: string; className?: string }) {
  return (
    <p role="status" className={message ? className : "sr-only"}>
      {message}
    </p>
  );
}
