// three 垫片:仅服务于 mind-ar 1.2.5(构建于旧 three API)
// sRGBEncoding 在 three r162 被移除;mind-ar 仅用它给 renderer.outputEncoding 赋值,
// r169 下该属性已不存在(赋值无效且无害),且默认输出已是 sRGB——数值占位即可。
// 由 vite.config.js 的 mindar-three-shim 插件按 importer 定向注入,不影响其他模块。
export * from '../../vendor/three.module.js?v=20261012103431';
export const sRGBEncoding = 3001;
