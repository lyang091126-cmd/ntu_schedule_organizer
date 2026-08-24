# NTU Learn 自动日程与 DDL 整理助手

本程序是一个专为 **南洋理工大学 NTU (Nanyang Technological University)** 学子打造的 Chrome 浏览器扩展程序 (Chrome Extension)。

当您登录并打开 NTU Learn (`ntulearn.ntu.edu.sg`) 网页时，程序会在后台自动连接课程系统，提取所有课程的 **作业 (Assignments)、测验 (Quizzes)、讨论公告 (Discussions) 以及精确的截止时间 (DDL)**，并在现代炫彩 Dashboard 中为您自动归类呈现。

---

## 🌟 核心功能

1. **⚡ 零登录障碍自动整理**：借助您在 Chrome 浏览器中已登录的 NTU Learn 会话，无需再次输入密码或处理 Duo 2FA 验证，自动识别课程与任务。
2. **🚨 紧急 DDL 倒计时雷达**：
   - 🔥 **24 小时内截止**（红色高亮倒计时 + 浏览器徽标提醒）
   - ⏳ **3 天内截止**（黄色预警）
   - 📅 **本周与后续任务**（正常进行）
3. **📋 “我需要做什么”智能待办清单**：支持按课程代码筛选、关键词搜索、完成状态勾选及直接跳转 NTU Learn 提交页面。
4. **📅 一键导出系统日历 (.ics)**：支持一键生成 `.ics` 标准日历文件，直接导入 Apple Calendar（Mac/iPhone）、Google Calendar 或 Outlook。
5. **🎨 Modern Glassmorphism UI**：暗黑炫彩视效、微动画交互、数据全留在本地，保障隐私安全。

---

## 📦 如何安装使用 (3 分钟快捷步骤)

### 第一步：在 Chrome 中加载扩展程序
1. 打开 Chrome 浏览器（支持 Chrome / Edge / Brave / Opera）。
2. 在地址栏输入 `chrome://extensions/` 并按回车。
3. 开启右上角的 **【开发者模式】(Developer mode)** 状态开关。
4. 点击左上角的 **【加载已解压的扩展程序】(Load unpacked)** 按钮。
5. 选择本项目所在文件夹：
   `C:\Users\Lyang\.gemini\antigravity\scratch\ntu_schedule_organizer`

### 第二步：自动抓取 NTU Learn 日程
1. 打开 [ntulearn.ntu.edu.sg](https://ntulearn.ntu.edu.sg) 并完成正常登录。
2. 页面右下角会自动出现 **【⚡ 智能日程整理】** 悬浮按钮，点击它或刷新页面即可自动提取所有 DDL！
3. 您可以随时点击浏览器右上角的 **【NTU Learn 日程助手】插件图标**，查看倒计时看板与导出日历！

---

## 📁 项目文件清单

- `manifest.json`: Chrome Extension V3 配置文件
- `content.js`: 页面注入数据提取脚本（支持 Canvas API 与 DOM 适配）
- `content.css`: 页面内悬浮按钮样式
- `background.js`: 后台服务与急件 Badge 提醒
- `popup/popup.html`: 日程整理 Dashboard HTML 结构
- `popup/popup.css`: 暗黑现代视觉与倒计时组件
- `popup/popup.js`: DDL 倒计时算法、筛选、存储与 iCal 导出逻辑
- `icons/`: 扩展图标 (16x16, 48x48, 128x128)
