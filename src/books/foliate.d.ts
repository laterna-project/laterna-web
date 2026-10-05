// Types of the part of foliate-js used by the EPUB reader (the package ships none).
declare module "foliate-js/view.js" {
  export interface TocItem {
    label: string;
    href: string;
    subitems?: TocItem[];
  }

  export interface Location {
    /** From 0 to 1 across the whole book. */
    fraction: number;
    cfi: string;
    tocItem?: { label: string; href: string };
    section?: { current: number; total: number };
  }

  export interface Paginator extends HTMLElement {
    setStyles(css: string): void;
  }

  export class View extends HTMLElement {
    book: { toc?: TocItem[]; dir?: string; metadata?: { title?: string } };
    renderer: Paginator;
    lastLocation?: Location;
    open(book: string | Blob): Promise<void>;
    init(options: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;
    close(): void;
    goTo(target: string): Promise<unknown>;
    goToFraction(fraction: number): Promise<void>;
    getSectionFractions(): number[];
    prev(): Promise<void>;
    next(): Promise<void>;
    goLeft(): Promise<void>;
    goRight(): Promise<void>;
  }
}
