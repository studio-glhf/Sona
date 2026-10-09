import { homedir } from "node:os";
import { resolve, join, relative, isAbsolute } from "node:path";
export function dataDirectory() {
  const base =
    process.platform === "win32"
      ? (process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"))
      : process.platform === "darwin"
        ? join(homedir(), "Library", "Application Support")
        : (process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"));
  const directory = resolve(process.env.SONA_DATA_DIR ?? join(base, "Sona"));
  const rel = relative(process.cwd(), directory);
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel)))
    throw new Error("SONA_DATA_DIR must be outside the repository.");
  return directory;
}
