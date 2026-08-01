import WikiClient from "./WikiClient";
import styles from "./wiki.module.css";
import Link from "next/link";

export default function WikiPage() {
  return (
    <main className={styles.page}>
      <a className={styles.skipLink} href="#wiki-reader">Skip to article</a>
      <header className={styles.masthead}>
        <Link className={styles.brand} href="/" aria-label="Return to Blockwild">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/blockwild-icon-64.png" alt="" width="56" height="56" />
          <span><b>BLOCKWILD</b><small>Living Field Wiki</small></span>
        </Link>
        <div className={styles.mastheadRule} aria-hidden="true" />
        <Link className={styles.playLink} href="/">Play Blockwild <span aria-hidden="true">&#8599;</span></Link>
      </header>
      <WikiClient />
      <footer className={styles.footer}>
        <span>Built from the same item, ecology, and world registries used by the game.</span>
        <a href="https://github.com/RedLynx101/blockwild">Source &amp; project notes</a>
      </footer>
    </main>
  );
}
