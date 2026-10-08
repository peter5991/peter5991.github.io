// three-shim.mjs — mind-ar 1.2.5 兼容桩(D4)
// mindar dist 具名导入 sRGBEncoding/LinearEncoding(three r152 已移除),此处别名到现行常量,
// 其余导出原样转发(同一底层模块实例,类身份一致)。r185 renderer 无 outputEncoding 属性,
// mind-ar 对它的赋值静默失效;默认 outputColorSpace 即 srgb,语义不变。
export * from './three.module.min.js';
import { SRGBColorSpace, LinearSRGBColorSpace } from './three.module.min.js';
export const sRGBEncoding = SRGBColorSpace;
export const LinearEncoding = LinearSRGBColorSpace;
