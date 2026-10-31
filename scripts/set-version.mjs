import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];

if (!version) {
  console.error("Usage: node scripts/set-version.mjs <version>");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid version: ${version}`);
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const updated = [];

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function write(relativePath, contents) {
  writeFileSync(join(root, relativePath), contents);
  updated.push(relativePath);
}

function updateJson(relativePath, mutate) {
  const data = JSON.parse(read(relativePath));
  mutate(data);
  write(relativePath, `${JSON.stringify(data, null, 2)}\n`);
}

function replaceOnce(relativePath, pattern, replacement) {
  const source = read(relativePath);
  if (!pattern.test(source)) {
    throw new Error(`version pattern not found in ${relativePath}`);
  }
  write(relativePath, source.replace(pattern, replacement));
}

updateJson("package.json", (data) => {
  data.version = version;
});

updateJson("package-lock.json", (data) => {
  data.version = version;
  if (data.packages?.[""]) {
    data.packages[""].version = version;
  }
});

replaceOnce(
  "src-tauri/tauri.conf.json",
  /^(\s*"version":\s*")[^"]*(")/m,
  `$1${version}$2`,
);

replaceOnce(
  "src-tauri/Cargo.toml",
  /^version = "[^"]*"/m,
  `version = "${version}"`,
);

replaceOnce(
  "src-tauri/Cargo.lock",
  /(\[\[package\]\]\r?\nname = "prompt-debugger"\r?\nversion = ")[^"]*(")/,
  `$1${version}$2`,
);

replaceOnce(
  "src-tauri/src/main.rs",
  /version: Some\("[^"]*"\.into\(\)\)/,
  `version: Some("${version}".into())`,
);

console.log(`Set version to ${version}:`);
for (const file of updated) {
  console.log(`  ${file}`);
}
