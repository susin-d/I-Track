import assert from "node:assert/strict";
import fs from "node:fs";

const srcRoot = new URL("../src/", import.meta.url);
const forbidden = [
  /\bcreate issue\b/i,
  /\bissue links?\b/i,
  /\blink issue\b/i,
  /\blinked issues\b/i,
  /\bwork items?\b/i,
  /\bissue type\b/i,
  /\bstandard issue\b/i,
];

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = new URL(entry.name, `${directory.href}/`);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(tsx?|md)$/.test(entry.name) ? [entryPath] : [];
  });
}

const violations = sourceFiles(srcRoot).flatMap((fileUrl) => {
  const source = fs.readFileSync(fileUrl, "utf8");
  const file = fileUrl.pathname.replace(srcRoot.pathname, "").replace(/^\//, "");
  return source.split(/\r?\n/).flatMap((line, index) =>
    forbidden.some((pattern) => pattern.test(line))
      ? [`${file}:${index + 1}: ${line.trim()}`]
      : [],
  );
});

assert.deepEqual(violations, [], `Use the canonical Ticket terminology in visible client copy:\n${violations.join("\n")}`);
console.log("Verified canonical ticket terminology.");
