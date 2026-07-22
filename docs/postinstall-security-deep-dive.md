# npm/postinstall 安全机制深度解析：从原理到防御

> 为什么 pnpm v10+ 默认阻止了你的 Prisma 安装？这背后是一场供应链安全博弈。

---

## 一、postinstall 是什么？

npm 的 `package.json` 中有几个特殊的生命周期钩子，在包安装时自动触发：

```json
{
  "scripts": {
    "preinstall": "echo '安装前执行'",
    "install": "echo '安装中执行'",
    "postinstall": "echo '安装完成后执行'"
  }
}
```

**最常见的就是 `postinstall`** — 包下载到 `node_modules` 后，npm 会自动执行这个脚本。

### 正经用途

```bash
# Prisma 用 postinstall 下载数据库引擎二进制
@prisma/client@6.8.2
  └── postinstall → 检测 OS → 下载 query-engine → 准备就绪

# sharp 用 postinstall 编译原生 C++ 模块
sharp@0.34.2
  └── postinstall → node-gyp rebuild → 编译原生代码

# Husky 用 postinstall 配置 git hooks
husky@9.0.0
  └── postinstall → git config core.hooksPath → 初始化
```

**问题是：这个机制没有任何防护。** 任何包的作者，都可以在 `postinstall` 里写任意代码——读取文件、发网络请求、甚至删除系统文件。

---

## 二、真实攻击案例

### 案例 1：node-ipc 供应链投毒（2022 年）

这是 npm 历史上影响最大的安全事件之一。

```
事件：node-ipc 包作者 intentionally 投毒
影响：全球数百万开发者
方式：在 postinstall 中检测 IP 地理位置
后果：俄罗斯/白俄罗斯 IP 的用户 → 删除所有文件

受害者：Figma、Vue.js CLI、主流企业
原因：node-ipc 是数十万个项目的间接依赖
      开发者根本不知道自己依赖了它
```

### 案例 2：colors.js 事件（2022 年）

```javascript
// colors.js 作者在包中植入无限循环
// 导致所有依赖它的项目打印 "# 开头的乱码"
// 影响：无数 Node.js 项目构建失败
```

### 核心痛点

```
你信任的是"功能"，不是"作者的人品"

场景                              风险
───────────────────────────────────────────────
直接依赖（你知道你装了啥）         低 — 你可以审查
间接依赖（依赖的依赖）             中 — 你不会去看
传递依赖（依赖的依赖的依赖...）    高 — 没人会审查
```

---

## 三、攻击面放大效应

npm 的依赖树是 **指数级放大** 的：

```
你的项目 package.json
  └── 10 个直接依赖
       └── 每个依赖又有 10 个依赖
            └── 每个依赖又有 10 个依赖
                 └── ...
                       └── node_modules 里可能有 1000+ 个包
                       └── 其中任何一个包投毒 → 你中招
```

**数据：**
- 一个中等规模的 Next.js 项目，`node_modules` 通常有 **800-1500 个包**
- 其中任何一个包的 `postinstall` 都可能被利用
- 包管理器无法区分"正常脚本"和"恶意脚本"

---

## 四、pnpm v10+ 的解决方案

### 设计哲学：默认零信任

pnpm v10 引入 `onlyBuiltDependencies` 机制：

```
安装流程 (pnpm v10+)
  │
  ├── 下载依赖 ✅
  ├── 解压到 node_modules ✅
  │
  └── 检查 package.json 中的 allowed list
       │
       ├── 包在 allowed list 中 → 执行 postinstall ✅
       └── 包不在 allowed list → 跳过 postinstall ❌
```

**这是安装策略的一个根本转变：**

```
旧模型 (npm/yarn):
  "所有包的脚本我都信任，除非我明确说不信任"

新模型 (pnpm v10+):
  "所有包的脚本我都不信任，除非我明确说信任"
```

### 配置方式

**方式一：.npmrc 通配放行（方便但不精确）**

```bash
# .npmrc
onlyBuiltDependencies=*
```

**方式二：package.json 逐个放行（推荐）**

```json
{
  "pnpm": {
    "onlyBuiltDependencies": [
      "@prisma/client",
      "@prisma/engines",
      "prisma",
      "sharp",
      "@tailwindcss/oxide"
    ]
  }
}
```

**方式三：交互式选择**

```bash
pnpm approve-builds
# 交互界面列出所有需要 postinstall 的包
# 空格选择 → 回车确认
```

---

## 五、这个方案解决了什么？

### 解决的问题 ✅

| 威胁场景 | 之前 | pnpm v10+ |
|---------|------|-----------|
| 某个间接依赖投毒 | 自动执行，中招 | 不被允许，静默跳过 |
| 想审查所有 install 脚本 | 不知道哪些包有 | 安装失败，显式暴露 |
| 新加入的依赖有 postinstall | 无感执行 | 需要你批准 |
| CI/CD 中被植入恶意包 | 自动执行 | 构建失败，提前发现 |

### 没解决的问题 ❌

- **运行时攻击**：postinstall 只是攻击面之一，代码运行时仍有风险
- **已批准的包被投毒**：你手动批准的 Prisma 如果有后门，仍然中招
- **作用域限制**：`onlyBuiltDependencies=*` 等于放行了所有包，失去了保护

---

## 六、企业级防御体系

pnpm 的 postinstall 保护只是供应链安全的一环。完整的防御应该是多层的：

```
Layer 1: 依赖管理 (开发阶段)
  ├── pnpm onlyBuiltDependencies  ✅  你正在做的
  ├── 锁文件版本控制 (pnpm-lock.yaml)
  └── 定期 `pnpm audit`

Layer 2: 静态分析 (CI/CD)
  ├── Socket.dev / Snyk 扫描
  ├── 检测敏感 API 调用 (fs.writeFile, child_process)
  └── 阻止新引入的未审核依赖

Layer 3: 运行时防护 (生产环境)
  ├── 最小权限原则 (容器非 root)
  ├── seccomp / AppArmor 限制系统调用
  └── 只读文件系统 (--read-only)

Layer 4: 供应链验证
  ├── npm 签名验证 (`npm audit signatures`)
  ├── 私有 registry 镜像 (Verdaccio)
  └── SBOM (Software Bill of Materials) 生成
```

---

## 七、实用建议

### 你应该怎么做？

**1. 不要用 `onlyBuiltDependencies=*`**

除非你明确知道你项目里所有依赖的来源可信。这个通配符等于关掉了 pnpm 的安全保护。

**2. 逐个列明需要构建的包**

```json
{
  "pnpm": {
    "onlyBuiltDependencies": [
      "@prisma/client",
      "@prisma/engines",
      "prisma",
      "sharp"
    ]
  }
}
```

如果后续安装新包报错，说明它有 postinstall 脚本——你多了一个审查机会。

**3. 把 allowed list 纳入 Code Review**

```
PR 中新增了一个依赖带 postinstall？
→ 需要审查者确认："这个包为什么需要跑脚本？"
→ 如果不需要，就不放行
```

**4. 结合 pnpm audit 和 Socket.dev**

```bash
# 基本安全检查
pnpm audit

# Socket.dev CLI (检测恶意包)
npx @socketsecurity/cli scan
```

---

## 八、总结一张图

```
┌────────────────────────────────────────────────────────┐
│                    供应链安全                           │
├────────────────────────────────────────────────────────┤
│                                                        │
│  你的 package.json                                      │
│    └── 直接依赖 (10个)                                  │
│         └── 间接依赖 (100个)                            │
│              └── 传递依赖 (1000个)                      │
│                                                        │
│  任何一层投毒                                           │
│    └── postinstall 自动执行                             │
│         └── pnpm 默认阻止 🛡️                           │
│              └── 你需要显式批准 ✅                       │
│                                                        │
│  "批准不是麻烦，而是赋予了你一个审查的机会"              │
└────────────────────────────────────────────────────────┘
```

## 快问快答

| 问题 | 回答 |
|------|------|
| 为什么以前 npm 没这问题？ | 不是没这问题，是没意识到。npm 生态的"运行任何代码"模型从第一天就这样 |
| pnpm 是不是太严格了？ | 严格换安全。安装一次就能发现所有有 postinstall 的包，这个知情权很有价值 |
| 和 npm v10 的 `--ignore-scripts` 区别？ | `--ignore-scripts` 是全部忽略，pnpm 是逐个审批 — 更精细 |
| 加了 allowed list 后还安全吗？ | 只对你批准的包安全。任何时候新包的 postinstall 都会暴露出来 |
