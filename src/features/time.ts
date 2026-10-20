// time.ts — 把查询里的中文相对时间解析成时间窗（用于检索加权）
// 只做「能确定边界」的表达：今天/昨天/前天/本周/上周/本月/上个月/最近 N 天|周|月/N 天前。
// 解析不出来就返回 null——宁可不用时间信号，也不猜错。

const DAY = 86400000;

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

export interface TimeWindow {
  from: number;
  /** 不含右边界 */
  to: number;
  label: string;
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 周一为一周开始（中文习惯） */
function startOfWeek(t: number): number {
  const base = startOfDay(t);
  const dow = (new Date(base).getDay() + 6) % 7;
  return base - dow * DAY;
}

function startOfMonth(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function shiftMonth(t: number, delta: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth() + delta, 1).getTime();
}

function toCount(raw: string): number {
  if (/^\d+$/.test(raw)) return Math.max(1, Math.min(999, Number(raw)));
  return CN_NUM[raw] || 1;
}

export function parseTimeWindow(query: string, now = Date.now()): TimeWindow | null {
  const q = String(query || "");
  if (!q.trim()) return null;
  const today = startOfDay(now);

  if (/今天|今日|本日/.test(q)) return { from: today, to: now + 1, label: "今天" };
  if (/昨天|昨日/.test(q)) return { from: today - DAY, to: today, label: "昨天" };
  if (/前天/.test(q)) return { from: today - 2 * DAY, to: today - DAY, label: "前天" };
  if (/本周|这周|这个星期/.test(q)) return { from: startOfWeek(now), to: now + 1, label: "本周" };
  if (/上周|上个?星期/.test(q)) {
    const s = startOfWeek(now);
    return { from: s - 7 * DAY, to: s, label: "上周" };
  }
  if (/上个月|上月/.test(q)) {
    const s = startOfMonth(now);
    return { from: shiftMonth(s, -1), to: s, label: "上个月" };
  }
  if (/本月|这个月/.test(q)) return { from: startOfMonth(now), to: now + 1, label: "本月" };

  const recent = q.match(/最近\s*(\d+|[一二两三四五六七八九十]+)\s*(天|日|周|个?星期|个?月)/);
  if (recent) {
    const n = toCount(recent[1]);
    const unit = recent[2].includes("月") ? 30 : recent[2].includes("周") || recent[2].includes("星期") ? 7 : 1;
    return { from: now - n * unit * DAY, to: now + 1, label: `最近${recent[1]}${recent[2]}` };
  }

  const ago = q.match(/(\d+|[一二两三四五六七八九十]+)\s*(天|日|周|个?星期|个?月)前/);
  if (ago) {
    const n = toCount(ago[1]);
    const unit = ago[2].includes("月") ? 30 : ago[2].includes("周") || ago[2].includes("星期") ? 7 : 1;
    // 「三天前」= 那一天，按天对齐；「三周前」= 那一段，保留相对窗口
    const to = unit === 1 ? startOfDay(now - (n - 1) * DAY) : now - (n - 1) * unit * DAY;
    return { from: to - unit * DAY, to, label: `${ago[1]}${ago[2]}前` };
  }

  return null;
}
