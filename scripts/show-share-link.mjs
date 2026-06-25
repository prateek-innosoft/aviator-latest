import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const linkFile = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  "share-link.url",
);

if (!fs.existsSync(linkFile)) {
  console.log("No share link yet. Run task: Aviator: Start App");
  process.exit(1);
}

console.log(fs.readFileSync(linkFile, "utf8").trim());
