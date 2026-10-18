# IELTS Writing Lab — 观点表达训练库

这是一个可通过 GitHub Pages 发布的静态网站原型。

## 文件
- `index.html`：页面结构
- `style.css`：视觉样式
- `app.js`：抽卡、筛选、学习状态与统计逻辑
- `words.json`：结构化词库，包含 24 条示范表达

## 本地预览
由于浏览器通常不允许 `file://` 页面读取 JSON，请使用静态服务器预览，或直接发布到 GitHub Pages。
最简单的方式：将这些文件上传至 GitHub 仓库根目录，并在 Settings → Pages 中选择 `Deploy from a branch`、`main`、`/(root)`。

## 词库字段
每条记录包含 `category`、`categoryName`、`type`、`expression`、`meaning`、`example`、`exampleTranslation`、`extension`、`extensionTranslation`。
新增词条时保持同样字段即可。

## 关于例句
核心表达参考用户上传的《浓缩版观点库》；本原型中的例句、翻译与论证扩展为新编示例，不是原 PDF 中的原文例句。例句应在后续扩展时经过人工检查，避免把不自然或不适用于所有题目的表达当作固定模板。
