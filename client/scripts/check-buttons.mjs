import fs from "node:fs";
import assert from "node:assert/strict";

const srcRoot = new URL("../src/", import.meta.url);

function listTsxFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = new URL(entry.name, `${directory.href}/`);
    if (entry.isDirectory()) return listTsxFiles(entryPath);
    return entry.name.endsWith(".tsx") ? [entryPath] : [];
  });
}

const buttons = listTsxFiles(srcRoot).flatMap((fileUrl) => {
  const source = fs.readFileSync(fileUrl, "utf8");
  const file = fileUrl.pathname.replace(srcRoot.pathname, "").replace(/^\//, "");
  return [...source.matchAll(/<button\b([^>]*)>/gs)].map((match) => ({
    file,
    attributes: match[1].replace(/\s+/g, " ").trim(),
    line: source.slice(0, match.index).split("\n").length,
  }));
});
const inert = buttons.filter(({ attributes }) => !/(onClick|type=["']submit["']|disabled)/.test(attributes));
assert.deepEqual(inert, [], `Every button must have an action or disabled state: ${JSON.stringify(inert)}`);
console.log(`Verified ${buttons.length} button contracts.`);
