// Tests run in English, the reference language; a test about another language switches to it.
// The language guessed at startup (Node reports the system's) is set first, then replaced.
import { ready, setLanguage } from "./index";

await ready;
await setLanguage("en", false);
