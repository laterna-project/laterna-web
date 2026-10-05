/**
 * Smooth scrolling, unless the user asked for reduced motion: scrolling done in JavaScript does not
 * follow the prefers-reduced-motion rule of global.css.
 */
export function scrollBehavior(): ScrollBehavior {
  return matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
