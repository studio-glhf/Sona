import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

// A deterministic source + built application archive. No runtime data directory is read.
const root = process.cwd();
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
await readFile(path.join(root, "dist/server.mjs"));
await readFile(path.join(root, "dist/web/index.html"));
const exact = [
  "README.md",
  "design-qa.md",
  "LICENSE",
  ".env.example",
  ".gitignore",
  ".node-version",
  ".npmrc",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "vitest.config.ts",
  "playwright.config.ts",
];
const folders = [
  "apps",
  "packages",
  "examples",
  "scripts",
  "tests",
  "docs",
  "dist",
  ".github",
];
const excluded =
  /(^|\/)(node_modules|release|archive|test-results|playwright-report|coverage|\.git|\.local)(\/|$)|(^|\/)\.env(\.|$)|\.(db|sqlite|sqlite3)(-wal|-shm)?$|\.(log|pem|key|p12|pfx)$|ASD-STE100_ISSUE9/i;
const files: string[] = [];
async function visit(relative: string) {
  if (excluded.test(relative)) return;
  const stat = await lstat(path.join(root, relative));
  if (stat.isSymbolicLink())
    throw new Error(`Release does not permit symbolic links: ${relative}`);
  if (stat.isDirectory()) {
    for (const child of (await readdir(path.join(root, relative))).sort())
      await visit(`${relative}/${child}`);
  } else if (stat.isFile()) files.push(relative);
}
for (const name of exact) {
  await readFile(path.join(root, name));
  files.push(name);
}
for (const folder of folders) await visit(folder);
files.sort();
const secretValues = Object.entries(process.env)
  .filter(
    ([name, value]) =>
      /(?:TOKEN|SECRET|PASSWORD|API_KEY|ADMIN_KEY)/i.test(name) &&
      value &&
      value.length >= 12,
  )
  .map(([, value]) => value!);
let revision = "unavailable";
let epoch = Number(process.env.SOURCE_DATE_EPOCH ?? 0);
try {
  revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (!epoch)
    epoch = Number(
      execFileSync("git", ["show", "-s", "--format=%ct", "HEAD"], {
        encoding: "utf8",
      }).trim(),
    );
} catch {
  /* An unpacked source release need not contain .git. */
}
if (!Number.isSafeInteger(epoch) || epoch < 0)
  throw new Error("SOURCE_DATE_EPOCH must be a nonnegative integer.");
const entries: { name: string; content: Buffer }[] = [];
for (const name of files) {
  const content = await readFile(path.join(root, name));
  for (const secret of secretValues)
    if (content.includes(Buffer.from(secret)))
      throw new Error(
        `A configured secret occurs in ${name}; packaging stopped.`,
      );
  if (
    content.includes(Buffer.from("-----BEGIN " + "PRIVATE KEY-----")) ||
    content.includes(Buffer.from("-----BEGIN " + "RSA PRIVATE KEY-----"))
  )
    throw new Error(
      `Private key material occurs in ${name}; packaging stopped.`,
    );
  entries.push({ name, content });
}
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const manifest = {
  format: "sona-release-manifest/v1",
  application: pkg.name,
  version: pkg.version,
  sourceRevision: revision,
  sourceIdentity:
    "Per-file SHA-256 values identify this working tree, including uncommitted work.",
  sourceDateEpoch: epoch,
  runtime: pkg.engines,
  packageManager: pkg.packageManager,
  files: entries.map((entry) => ({
    path: entry.name,
    bytes: entry.content.length,
    sha256: hash(entry.content),
  })),
};
entries.push({
  name: "RELEASE-MANIFEST.json",
  content: Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
});

function tarEntry(name: string, content: Buffer): Buffer[] {
  const header = Buffer.alloc(512);
  let base = name,
    prefix = "";
  if (Buffer.byteLength(name) > 100) {
    const slash = name.lastIndexOf("/");
    prefix = name.slice(0, slash);
    base = name.slice(slash + 1);
    if (Buffer.byteLength(prefix) > 155 || Buffer.byteLength(base) > 100)
      throw new Error(`Archive path is too long: ${name}`);
  }
  const text = (value: string, offset: number, length: number) =>
    header.write(value, offset, length, "utf8");
  const octal = (value: number, offset: number, width: number) =>
    text(value.toString(8).padStart(width - 1, "0") + "\0", offset, width);
  text(base, 0, 100);
  octal(0o644, 100, 8);
  octal(0, 108, 8);
  octal(0, 116, 8);
  octal(content.length, 124, 12);
  octal(epoch, 136, 12);
  header.fill(32, 148, 156);
  text("0", 156, 1);
  text("ustar\0", 257, 6);
  text("00", 263, 2);
  text(prefix, 345, 155);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  text(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return [header, content, Buffer.alloc((512 - (content.length % 512)) % 512)];
}
const archiveName = `sona-${pkg.version}-local.tar.gz`;
const archive = gzipSync(
  Buffer.concat([
    ...entries.flatMap((entry) =>
      tarEntry(`sona-${pkg.version}/${entry.name}`, entry.content),
    ),
    Buffer.alloc(1024),
  ]),
  { level: 9 },
);
await mkdir("release", { recursive: true });
await writeFile(`release/${archiveName}`, archive);
await writeFile(
  `release/${archiveName}.sha256`,
  `${hash(archive)}  ${archiveName}\n`,
);
await writeFile(
  "release/RELEASE-MANIFEST.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Created release/${archiveName} (${entries.length} files, ${archive.length} bytes).`,
);
console.log(
  "The archive excludes dependencies, credentials, local databases, participant records, and the private STE standard.",
);
