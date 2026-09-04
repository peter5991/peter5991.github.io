# Dr. 程平 · 个人主页

材料科学 × 人工智能方向的个人电子简历主页,纯静态站点(单文件 HTML,无构建步骤),通过 **GitHub Pages** 部署。

🔗 **在线访问:** https://peter5991.github.io

## 目录结构

```
├── index.html      # 主页(含全部样式与脚本,荧光绿终端风格)
├── assets/         # 项目截图与演示图片(PNG)
└── scenes/         # 嵌入式演示场景
    ├── dojo.html
    ├── store.html
    ├── wuhu-map.html     # 芜湖市 3D 地图(回收站点下钻,three.js)
    └── wuhu-map/         # 地图 GeoJSON 与地形纹理
```

## 本地预览

无需安装任何依赖,任选其一:

- 直接双击打开 `index.html`
- 或启动本地服务器(避免个别浏览器对本地文件的限制):

```bash
# Python
python -m http.server 8000

# Node.js
npx serve .
```

然后访问 http://localhost:8000

## 更新与发布流程

GitHub Pages 已绑定 `main` 分支根目录,**推送到 main 即自动上线**(约 1 分钟内生效)。

```bash
# 1. 修改文件后查看改动
git status
git diff

# 2. 提交并推送
git add -A
git commit -m "更新:简述本次修改内容"
git push
```

### 日常维护速查

| 要做什么 | 改哪里 |
|---|---|
| 修改简介 / 项目 / 论文 / 联系方式 | `index.html`(页内锚点:#about #skills #projects #papers #demos #contact) |
| 更换 / 新增项目截图 | 替换或添加 `assets/*.png`,并同步 `index.html` 中的引用路径 |
| 修改演示场景 | `scenes/dojo.html`、`scenes/store.html`、`scenes/wuhu-map.html` |

> 注意:图片等资源一律使用**相对路径**(如 `assets/xxx.png`),不要使用绝对路径,以保证 GitHub Pages 下正常加载。

## 技术说明

- 纯 HTML / CSS / JavaScript,零依赖、零构建
- Canvas 背景动画 + 扫描线 / 暗角特效,自定义光标
- 响应式布局,适配移动端

## 联系方式

- ORCID: [0000-0001-7111-1179](https://orcid.org/0000-0001-7111-1179)
- Email: 101508@whit.edu.cn / peter599177@gmail.com
