import { imageUrl } from "../api/media";
import { useThemeImages } from "../theme/ServerTheme";
import styles from "./Logo.module.css";

/**
 * Laterna brand: four dots in the universe colors, then the name; or the server theme's logo if it
 * has one (decorative: the link around it names itself).
 */
export function Logo() {
  const { logo } = useThemeImages();
  if (logo)
    return (
      <span className={styles.logo} data-ui="logo">
        <img className={styles.image} src={imageUrl(logo, 320)} alt="" />
      </span>
    );
  return (
    <span className={styles.logo} data-ui="logo">
      <span className={styles.dots} aria-hidden="true">
        <span className={styles.films} />
        <span className={styles.series} />
        <span className={styles.music} />
        <span className={styles.collections} />
      </span>
      <span className={styles.name}>laterna</span>
    </span>
  );
}
