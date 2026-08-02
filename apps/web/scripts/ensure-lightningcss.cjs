/* Ensures lightningcss native binding exists (Vercel Linux + npm workspaces). */
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const webRoot = path.join(__dirname, "..");
const PKG = "lightningcss-linux-x64-gnu@1.32.0";

function canLoad() {
  try {
    require("lightningcss");
    return true;
  } catch {
    return false;
  }
}

function resolveLightningDir() {
  try {
    return path.dirname(require.resolve("lightningcss/package.json", { paths: [webRoot] }));
  } catch {
    return null;
  }
}

function npmInstall(pkg, prefix) {
  const args = ["install", pkg, "--no-save", "--no-package-lock", "--no-fund", "--no-audit"];
  if (prefix) args.push("--prefix", prefix);
  execSync(`npm ${args.join(" ")}`, {
    cwd: webRoot,
    stdio: "inherit",
    env: { ...process.env },
  });
}

function copyNodeBinary(lightningDir) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tf-lightningcss-"));
  execSync(`npm pack ${PKG}`, { cwd: tmp, stdio: "pipe" });
  const tgz = fs.readdirSync(tmp).find((f) => f.endsWith(".tgz"));
  if (!tgz) throw new Error("npm pack produced no tarball");
  execSync(`tar -xzf "${tgz}"`, { cwd: tmp, stdio: "pipe" });
  const pkgDir = path.join(tmp, "package");
  const nodeFile = fs.readdirSync(pkgDir).find((f) => f.endsWith(".node"));
  if (!nodeFile) throw new Error("no .node file in platform package");
  const dest = path.join(lightningDir, nodeFile);
  fs.copyFileSync(path.join(pkgDir, nodeFile), dest);
  console.log("[ensure-lightningcss] copied", nodeFile, "→", dest);
}

if (canLoad()) {
  console.log("[ensure-lightningcss] ok");
  process.exit(0);
}

console.log("[ensure-lightningcss] native binding missing — repairing");

// 1) Install platform package into the web app node_modules
try {
  npmInstall(PKG, webRoot);
} catch (e) {
  console.warn("[ensure-lightningcss] install into web root failed:", e.message);
}

if (canLoad()) {
  console.log("[ensure-lightningcss] ok after web install");
  process.exit(0);
}

// 2) Install as sibling of nested lightningcss
const lightningDir = resolveLightningDir();
if (lightningDir) {
  const parent = path.dirname(lightningDir);
  try {
    npmInstall(PKG, parent);
  } catch (e) {
    console.warn("[ensure-lightningcss] sibling install failed:", e.message);
  }
}

if (canLoad()) {
  console.log("[ensure-lightningcss] ok after sibling install");
  process.exit(0);
}

// 3) Fallback path used by lightningcss: ../lightningcss.linux-x64-gnu.node
if (lightningDir) {
  try {
    copyNodeBinary(lightningDir);
  } catch (e) {
    console.warn("[ensure-lightningcss] binary copy failed:", e.message);
  }
}

if (!canLoad()) {
  console.error("[ensure-lightningcss] still cannot load lightningcss");
  process.exit(1);
}

console.log("[ensure-lightningcss] ok after binary copy");
