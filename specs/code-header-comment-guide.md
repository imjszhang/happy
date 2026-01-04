# 代码文件头部注释规范指南

> 创建时间: 2025-12-20  
> 最后更新: 2025-12-20

## 概述

本指南定义了项目中代码文件头部注释的标准格式和写作规范。所有重要的代码文件（类文件、工具模块、服务模块等）应在文件顶部添加规范的注释，以确保代码的可读性、可维护性和版本追踪。

## 适用范围

本规范适用于以下类型的代码文件：

- 核心类文件（如 `WebScraper`、`LLM` 等）
- 工具模块（如 `browserAutomation.js`、`jsCollectedDatabase.js` 等）
- 服务模块（如 `happy-service`、`local-model-server` 等）
- 其他重要的功能模块

**注意**：简单的工具函数文件、配置文件等可以简化注释格式。

---

## 注释结构要求

代码文件头部注释应使用 JSDoc 风格的块注释（`/** ... */`），并按以下顺序包含各个章节：

| 章节 | 必需 | 说明 |
|------|------|------|
| 标题和元信息 | ✅ | 模块名称、创建/更新时间、版本号 |
| 功能简介 | ✅ | 简要描述模块用途 |
| 支持的平台/类型 | ⚪ | 列出支持的平台、网站类型等 |
| 主要功能 | ✅ | 功能特性列表 |
| 使用方法 | ✅ | 代码使用示例 |
| 返回数据格式 | ⚪ | API 返回的数据结构说明 |
| CHANGELOG | ✅ | 版本更新日志 |
| 版本说明 | ✅ | 语义化版本号规则说明 |

---

## 详细规范

### 1. 标题和元信息

```javascript
/**
 * ModuleName - 模块中文描述
 * 
 * > 创建时间: YYYY-MM-DD
 * > 最后更新: YYYY-MM-DD
 * > 当前版本: x.y.z
 */
```

**要求**:
- 第一行为模块名称（英文）+ 中文描述，使用 `-` 分隔
- 元信息使用引用格式 `> ` 开头
- 创建时间和更新时间使用 ISO 日期格式 (YYYY-MM-DD)
- 版本号遵循语义化版本规范 (Semantic Versioning)
- 每次重大更新需同步修改"最后更新"时间和版本号

**示例**:
```javascript
/**
 * WebScraper - 通用网页内容抓取工具
 * 
 * > 创建时间: 2024-01-01
 * > 最后更新: 2025-12-20
 * > 当前版本: 1.2.0
 */
```

### 2. 功能简介

```javascript
/**
 * 功能简介：
 * ==========
 * [模块名称] 是一个 [功能描述]，用于 [使用场景和目的]。
 * [补充说明，如适用]
 */
```

**要求**:
- 使用分隔线 `==========` 作为章节标题
- 使用一到两句话简洁描述模块的主要用途
- 说明模块的适用场景
- 避免过于技术化的术语

**示例**:
```javascript
/**
 * 功能简介：
 * ==========
 * WebScraper 是一个支持多种网站的内容抓取类，能够自动识别网站类型并使用相应的提取策略。
 * 支持从网页URL、HTML内容或本地文件提取结构化数据。
 */
```

### 3. 支持的平台/类型（可选）

```javascript
/**
 * 支持的网站：
 * -----------
 * - 平台1 (domain.com) - 功能描述
 * - 平台2 (domain.com) - 功能描述
 * - 平台3 - 功能描述
 */
```

**要求**:
- 使用分隔线 `----------` 作为章节标题
- 使用列表格式，每个平台一行
- 可以包含域名或平台标识
- 简要说明每个平台支持的功能

**示例**:
```javascript
/**
 * 支持的网站：
 * -----------
 * - 小红书 (xiaohongshu.com) - 支持笔记内容、用户信息、评论抓取
 * - 微信公众号 (mp.weixin.qq.com) - 支持文章内容、作者、封面图提取
 * - 知乎问答 (zhihu.com/question) - 支持问题、回答、点赞数、评论数提取
 * - 通用网站 - 自动提取标题和正文内容
 */
```

### 4. 主要功能

```javascript
/**
 * 主要功能：
 * ---------
 * 1. 功能点1描述
 * 2. 功能点2描述
 * 3. 功能点3描述
 */
```

**要求**:
- 使用分隔线 `---------` 作为章节标题
- 使用有序列表（数字编号）
- 每个功能点一行，保持简洁
- 按重要性或逻辑顺序排列

**示例**:
```javascript
/**
 * 主要功能：
 * ---------
 * 1. 自动识别网站类型并应用相应的提取策略
 * 2. 支持自定义URL规则和请求头（headers）
 * 3. 支持从URL、HTML内容或本地文件抓取
 * 4. 支持小红书评论分页抓取（可配置最大页数）
 * 5. 智能处理JavaScript注入的JSON数据
 * 6. 结构化提取内容（标题、正文、图片、作者、统计数据等）
 */
```

### 5. 使用方法

```javascript
/**
 * 使用方法：
 * ---------
 * ```javascript
 * const ModuleName = require('./modules/moduleName');
 * 
 * // 示例1：基本用法
 * const instance = new ModuleName(options);
 * const result = await instance.method();
 * 
 * // 示例2：高级用法
 * const instance2 = new ModuleName(options2);
 * const result2 = await instance2.method2();
 * ```
 */
```

**要求**:
- 使用分隔线 `---------` 作为章节标题
- 代码示例使用 Markdown 代码块格式
- 提供多种使用场景的示例
- 每个示例添加简要注释说明
- 展示完整的生命周期（初始化、使用、结果）

**示例**:
```javascript
/**
 * 使用方法：
 * ---------
 * ```javascript
 * const WebScraper = require('./modules/webScraper');
 * 
 * // 方式1：从URL抓取
 * const scraper = new WebScraper('https://www.xiaohongshu.com/explore/xxx', null, {
 *     maxCommentPages: 3  // 抓取最多3页评论
 * });
 * const result = await scraper.scrape();
 * 
 * // 方式2：从HTML内容抓取
 * const scraper2 = new WebScraper('https://example.com');
 * const result2 = await scraper2.scrapeFromHtml(htmlContent);
 * ```
 */
```

### 6. 返回数据格式（可选）

```javascript
/**
 * 返回数据格式：
 * -------------
 * 根据 [条件] 返回不同的数据结构：
 * - 类型1：field1, field2, field3
 * - 类型2：field1, field2, field3
 * - 类型3：field1, field2
 */
```

**要求**:
- 使用分隔线 `-------------` 作为章节标题
- 说明不同场景下的返回数据结构
- 使用列表格式，每个类型一行
- 字段名使用小写加下划线（snake_case）

**示例**:
```javascript
/**
 * 返回数据格式：
 * -------------
 * 根据网站类型返回不同的数据结构：
 * - 小红书：title, description, content, image_urls, note_comment, note_like, 
 *          note_collect, user_id, nickname, user_url, comments, total_comments_count
 * - 微信公众号：title, cover_url, description, author, content
 * - 知乎问答：title, author_name, content, upvote_count, comment_count
 */
```

### 7. CHANGELOG

```javascript
/**
 * CHANGELOG：
 * ==========
 * 
 * ## [x.y.z] - YYYY-MM-DD
 * 
 * ### 新增
 * - ✨ 新功能描述
 * 
 * ### 改进
 * - 🔄 改进描述
 * 
 * ### 修复
 * - 🐛 修复描述
 * 
 * ## [x.y.z] - YYYY-MM-DD
 * 
 * ### 新增
 * - ✨ 新功能描述
 */
```

**要求**:
- 使用分隔线 `==========` 作为章节标题
- 版本记录按时间倒序排列（最新版本在最上方）
- 每个版本包含版本号、日期和分类的变更列表
- 使用 emoji 标记变更类型
- 遵循语义化版本规范

**更新类型 emoji**:
- ✨ **新增** - 新功能、新组件
- 🔄 **改进** - 功能改进、性能优化、重构
- 🐛 **修复** - Bug 修复
- 📝 **文档** - 文档更新
- 🔧 **配置** - 配置文件变更
- ⚠️ **破坏性变更** - 不兼容的 API 变更
- 🗑️ **废弃** - 即将移除的功能
- 🔐 **安全** - 安全相关修复

**示例**:
```javascript
/**
 * CHANGELOG：
 * ==========
 * 
 * ## [1.2.0] - 2025-12-20
 * 
 * ### 新增
 * - ✨ 支持小红书评论分页抓取，可通过 maxCommentPages 配置最大抓取页数
 * 
 * ### 改进
 * - 🔄 优化小红书meta标签提取，同时支持 name 和 property 属性
 * - 🔄 增强知乎内容提取，支持结构化富文本（链接卡片、列表、格式化文本等）
 * - 🔄 改进JSON解析，安全处理JavaScript特有的值（undefined, NaN, Infinity等）
 * 
 * ## [1.1.0] - 2024-06-01
 * 
 * ### 新增
 * - ✨ 添加自定义URL规则支持
 * - ✨ 添加从HTML内容和本地文件抓取的功能
 * 
 * ### 改进
 * - 🔄 优化错误处理和日志输出
 * - 🔄 添加知乎会话建立机制，提高抓取成功率
 */
```

### 8. 版本说明

```javascript
/**
 * 版本说明：
 * ---------
 * - **主版本号** (x.0.0): 不兼容的 API 变更
 * - **次版本号** (0.x.0): 新增功能，向后兼容
 * - **修订号** (0.0.x): 问题修复和小改进
 */
```

**要求**:
- 使用分隔线 `---------` 作为章节标题
- 说明语义化版本号的规则
- 帮助开发者理解版本号的含义

**版本号规则**:
- **主版本号** (x.0.0): 不兼容的 API 变更，需要修改调用代码
- **次版本号** (0.x.0): 新增功能，向后兼容，可以安全升级
- **修订号** (0.0.x): 问题修复和小改进，建议尽快升级

---

## 完整示例

### 示例 1：完整格式（推荐）

```javascript
/**
 * WebScraper - 通用网页内容抓取工具
 * 
 * > 创建时间: 2024-01-01
 * > 最后更新: 2025-12-20
 * > 当前版本: 1.2.0
 * 
 * 功能简介：
 * ==========
 * WebScraper 是一个支持多种网站的内容抓取类，能够自动识别网站类型并使用相应的提取策略。
 * 支持从网页URL、HTML内容或本地文件提取结构化数据。
 * 
 * 支持的网站：
 * -----------
 * - 小红书 (xiaohongshu.com) - 支持笔记内容、用户信息、评论抓取
 * - 微信公众号 (mp.weixin.qq.com) - 支持文章内容、作者、封面图提取
 * - 知乎问答 (zhihu.com/question) - 支持问题、回答、点赞数、评论数提取
 * - 知乎专栏 (zhuanlan.zhihu.com) - 支持文章内容、作者、发布时间提取
 * - 通用网站 - 自动提取标题和正文内容
 * 
 * 主要功能：
 * ---------
 * 1. 自动识别网站类型并应用相应的提取策略
 * 2. 支持自定义URL规则和请求头（headers）
 * 3. 支持从URL、HTML内容或本地文件抓取
 * 4. 支持小红书评论分页抓取（可配置最大页数）
 * 5. 智能处理JavaScript注入的JSON数据
 * 6. 结构化提取内容（标题、正文、图片、作者、统计数据等）
 * 
 * 使用方法：
 * ---------
 * ```javascript
 * const WebScraper = require('./modules/webScraper');
 * 
 * // 方式1：从URL抓取
 * const scraper = new WebScraper('https://www.xiaohongshu.com/explore/xxx', null, {
 *     maxCommentPages: 3  // 抓取最多3页评论
 * });
 * const result = await scraper.scrape();
 * 
 * // 方式2：从HTML内容抓取
 * const scraper2 = new WebScraper('https://example.com');
 * const result2 = await scraper2.scrapeFromHtml(htmlContent);
 * ```
 * 
 * 返回数据格式：
 * -------------
 * 根据网站类型返回不同的数据结构：
 * - 小红书：title, description, content, image_urls, note_comment, note_like, 
 *          note_collect, user_id, nickname, user_url, comments, total_comments_count
 * - 微信公众号：title, cover_url, description, author, content
 * - 知乎问答：title, author_name, content, upvote_count, comment_count
 * 
 * CHANGELOG：
 * ==========
 * 
 * ## [1.2.0] - 2025-12-20
 * 
 * ### 新增
 * - ✨ 支持小红书评论分页抓取，可通过 maxCommentPages 配置最大抓取页数
 * 
 * ### 改进
 * - 🔄 优化小红书meta标签提取，同时支持 name 和 property 属性
 * - 🔄 增强知乎内容提取，支持结构化富文本
 * 
 * ## [1.1.0] - 2024-06-01
 * 
 * ### 新增
 * - ✨ 添加自定义URL规则支持
 * - ✨ 添加从HTML内容和本地文件抓取的功能
 * 
 * ## [1.0.0] - 2024-01-01
 * 
 * ### 新增
 * - ✨ 初始版本发布
 * - ✨ 支持小红书、微信公众号、知乎问答和专栏的基础内容提取
 * 
 * 版本说明：
 * ---------
 * - **主版本号** (x.0.0): 不兼容的 API 变更
 * - **次版本号** (0.x.0): 新增功能，向后兼容
 * - **修订号** (0.0.x): 问题修复和小改进
 */
```

### 示例 2：简化格式（适用于简单模块）

```javascript
/**
 * SimpleUtil - 简单工具函数集合
 * 
 * > 创建时间: 2024-01-01
 * > 最后更新: 2025-12-20
 * > 当前版本: 1.0.0
 * 
 * 功能简介：
 * ==========
 * SimpleUtil 提供了一系列常用的工具函数，用于字符串处理、日期格式化等常见操作。
 * 
 * 主要功能：
 * ---------
 * 1. 字符串格式化处理
 * 2. 日期时间转换
 * 3. 数据验证
 * 
 * 使用方法：
 * ---------
 * ```javascript
 * const SimpleUtil = require('./utils/simpleUtil');
 * 
 * const formatted = SimpleUtil.formatString('hello {name}', { name: 'world' });
 * const dateStr = SimpleUtil.formatDate(new Date());
 * ```
 * 
 * CHANGELOG：
 * ==========
 * 
 * ## [1.0.0] - 2024-01-01
 * 
 * ### 新增
 * - ✨ 初始版本发布
 * - ✨ 基础工具函数集合
 * 
 * 版本说明：
 * ---------
 * - **主版本号** (x.0.0): 不兼容的 API 变更
 * - **次版本号** (0.x.0): 新增功能，向后兼容
 * - **修订号** (0.0.x): 问题修复和小改进
 */
```

---

## 格式要求

### 注释格式

- 使用 JSDoc 风格的块注释：`/** ... */`
- 每行以 ` * ` 开头（星号前后各一个空格）
- 空行使用 ` * `（仅包含星号和空格）
- 代码块内的代码不需要额外的缩进

### 分隔线格式

- 章节标题使用等号或减号作为分隔线
- 分隔线长度应与标题文字长度一致
- 常用分隔线：
  - `==========` - 一级章节（功能简介、CHANGELOG）
  - `----------` - 二级章节（支持的网站、主要功能、使用方法）
  - `-------------` - 三级章节（返回数据格式）

### 代码块格式

- 代码示例使用 Markdown 代码块格式
- 在注释中，代码块前后各留一个空行
- 代码块内的代码保持原有缩进

---

## 更新维护

### 何时更新注释

1. **新增功能** - 更新"主要功能"章节和 CHANGELOG
2. **修复 Bug** - 更新 CHANGELOG
3. **API 变更** - 更新"使用方法"和 CHANGELOG，升级版本号
4. **重大重构** - 更新"功能简介"和 CHANGELOG，升级主版本号
5. **文档完善** - 更新相关章节，更新"最后更新"时间

### 版本号更新规则

| 变更类型 | 版本号变更 | 示例 |
|---------|-----------|------|
| 不兼容的 API 变更 | 主版本号 +1 | 1.2.0 → 2.0.0 |
| 新增功能（向后兼容） | 次版本号 +1 | 1.2.0 → 1.3.0 |
| Bug 修复、小改进 | 修订号 +1 | 1.2.0 → 1.2.1 |
| 文档更新 | 修订号 +1 | 1.2.0 → 1.2.1 |

---

## 检查清单

在提交代码前，请确认以下事项：

### 必需检查项

- [ ] 标题包含模块名和中文描述
- [ ] 创建/更新时间已填写
- [ ] 当前版本号已填写
- [ ] 功能简介简洁明了
- [ ] 主要功能列表完整
- [ ] 提供了使用示例
- [ ] CHANGELOG 包含最新版本记录
- [ ] 版本说明已添加

### 可选检查项

- [ ] 支持的平台/类型列表完整（如适用）
- [ ] 返回数据格式说明清晰（如适用）
- [ ] 代码示例可运行
- [ ] emoji 使用恰当
- [ ] 分隔线格式正确
- [ ] 版本号遵循语义化版本规范

---

## 相关资源

- [Semantic Versioning](https://semver.org/) - 语义化版本规范
- [Keep a Changelog](https://keepachangelog.com/) - CHANGELOG 编写指南
- [JSDoc 规范](https://jsdoc.app/) - JavaScript 文档注释规范
- [模块文档规范指南](./module-documentation-guide.md) - 模块级文档规范

---

## 参考示例

- [WebScraper 注释示例](../modules/webScraper.js) - 完整格式示例
- [LLM 模块注释示例](../modules/llm.js) - 可参考的另一个示例

---

*本规范参考 WebScraper 模块注释格式制定*

