import { execFileSync } from "node:child_process";
import fs from "node:fs";
const files = fs.readdirSync("tests").filter(f => f.endsWith(".test.mjs")).sort();
const rows = [];
for (const f of files) {
  const t0 = Date.now();
  execFileSync(process.execPath, ["--test", `tests/${f}`], { stdio: "ignore" });
  rows.push([Date.now() - t0, f]);
}
rows.sort((a, b) => b[0] - a[0]);
for (const [ms, f] of rows) console.log(String(ms).padStart(6) + "ms  " + f);
console.log("total", rows.reduce((a, r) => a + r[0], 0) + "ms");
