// three-shim.js — mind-ar 1.2.5 兼容桩
// mindar dist 具名导入 sRGBEncoding/LinearEncoding(three r162+ 已移除),此处别名到现行常量,
// 其余导出原样转发(同一底层 three 模块实例,类身份一致,与业务代码共用)。
// r169 renderer 无 outputEncoding 属性,mind-ar 对它的赋值静默失效;默认 outputColorSpace 即 srgb,语义不变。
export * from './three.module.js?v=20261012104101';
import { SRGBColorSpace, LinearSRGBColorSpace } from './three.module.js?v=20261012104101';
export const sRGBEncoding = SRGBColorSpace;
export const LinearEncoding = LinearSRGBColorSpace;
