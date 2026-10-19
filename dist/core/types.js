// types.ts — v2 单一记录模型的共享类型
// 铁律：一条记录 = 一个文件 = 一个事实；派生值（content/title）不落盘。
export const SEVEN_FIELD_KEYS = ["时间", "地点", "人物", "事情", "原因", "结果", "重点"];
export class NorthstarError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
    }
}
