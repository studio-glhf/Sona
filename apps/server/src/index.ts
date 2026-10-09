import { createApp } from "./app.js";
import { dataDirectory } from "./paths.js";
const port = Number(process.env.SONA_PORT ?? 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("SONA_PORT must be an integer from 1024 through 65535.");
const { app } = await createApp({
  dataDir: dataDirectory(),
  port,
  development: process.env.NODE_ENV === "development",
});
await app.listen({ host: "127.0.0.1", port });
console.log(`Sona is ready on local port ${port}. Raw audio is not saved.`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => void app.close().then(() => process.exit(0)));
