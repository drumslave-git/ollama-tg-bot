// Vitest's bundled Vite version does not recognize the newer `node:sqlite`
// builtin and tries to bundle a non-existent `sqlite` package. Load the real
// builtin at runtime via createRequire so the bundler never sees it.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sqlite = require("node:sqlite");

export const DatabaseSync = sqlite.DatabaseSync;
export default sqlite;
