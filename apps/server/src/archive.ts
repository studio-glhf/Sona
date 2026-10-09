import { gzipSync } from "node:zlib";
export function csvArchive(files: Record<string, string>): Buffer {
  const entries: Buffer[] = [];
  for (const [name, text] of Object.entries(files)) {
    if (!/^[a-z0-9.-]+$/i.test(name) || name.length > 100)
      throw new Error("Invalid archive entry.");
    const data = Buffer.from(text),
      h = Buffer.alloc(512);
    const put = (s: string, o: number, n: number) => h.write(s, o, n, "utf8");
    const oct = (v: number, o: number, n: number) =>
      put(v.toString(8).padStart(n - 1, "0") + "\0", o, n);
    put(name, 0, 100);
    oct(0o600, 100, 8);
    oct(0, 108, 8);
    oct(0, 116, 8);
    oct(data.length, 124, 12);
    oct(0, 136, 12);
    h.fill(32, 148, 156);
    put("0", 156, 1);
    put("ustar\0", 257, 6);
    put("00", 263, 2);
    put(
      h
        .reduce((s, b) => s + b, 0)
        .toString(8)
        .padStart(6, "0") + "\0 ",
      148,
      8,
    );
    entries.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  entries.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(entries));
}
