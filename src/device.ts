// device.ts — 设备身份（不放进同步目录，避免多设备互相覆盖）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export function getDeviceId(): string {
  const env = (process.env.TM_DEVICE_ID || "").trim();
  if (env) return env;
  const dir = path.join(os.homedir(), ".northstar");
  const file = path.join(dir, "device_id");
  try {
    const v = fs.readFileSync(file, "utf8").trim();
    if (/^dev_[a-z0-9]{6,}$/.test(v)) return v;
  } catch {
    /* generate below */
  }
  const id = "dev_" + crypto.randomBytes(4).toString("hex");
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, id + "\n", "utf8");
  } catch {
    /* fall back to in-memory id */
  }
  return id;
}
