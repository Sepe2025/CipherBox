# CipherBox

本地优先的加密密码保险箱 —— 同一个 HTML 内核，双端运行：**PC 网页版** + **Android App（零权限）**。数据只存在你自己的设备上，不上传、不联网。

> 当前 Android 版本：**v1.9.0 新签名迁移版**（2026-09-22）· [安全说明与迁移步骤](SECURITY-MIGRATION.md)

## 下载与本次修复

- [下载 Android 新签名迁移版 APK](https://github.com/Sepe2025/CipherBox/raw/refs/heads/main/CipherBox-1.9.0.apk)
- [电脑 HTML 版](vault.html)：打开文件页面，点击 **Download raw file** 下载，再用本机浏览器打开。

本次仅修复主页“查看说明”的显示条件：保存信息后立即隐藏，重新登录后也不再显示；没有保存信息且未手动关闭时显示。回收站信息仍计入，原有手动关闭行为保留。

旧签名密钥曾公开，旧 APK 已撤下当前分支下载入口。**先在旧 App 导出加密备份，再安装“CipherBox 新签名版”并导入核对；不要先卸载旧版。** 新版是独立应用，不会自动迁移数据，详细步骤见 [安全迁移说明](SECURITY-MIGRATION.md)。此前欢迎提示修复仍保留，见 [修复记录](WELCOME-FIX.md)。

## 核心特性

- **加密**：AES-GCM + PBKDF2 派生（**600,000 次迭代**）；主密码无找回通道（设计如此，谁也解不开）
- **双端**：PC 浏览器页面 ⇄ Android App；App **零网络权限**（系统层面无法联网）、**防截屏**
- **八套主题**：深空 / 晨雾 / 饮品粉 / 草莓雪 / 咖啡绿金 / 星巴克 / 咖啡棕 / 暗夜（预览卡即真实效果）
- **数据管理**
  - 拼音首字母搜索（打 `tb` 找到「淘宝」）
  - 分类筛选、置顶、回收站（30 天自动清理）、重复密码检测
  - 密码强度评估与生成器
- **备份体系**
  - 导出三去向：保存到下载 / 保存到指定位置 / 分享到其他应用
  - **智能合并导入**：按记录逐条「新者胜」合并（非覆盖），导入前显示差异摘要；**两端主密码可以不同**
  - 数据面板：记录数 / 最后修改 / 上次备份 / 上次合并 / 存储占用
  - App 端自动备份轮换（最近 5 份，静默写入应用目录）
- **首次引导**：欢迎栏 + 8 章节使用说明

## 目录结构

```
vault.html                      # PC 版源码（与 App 内 assets/vault.html 字节一致）
CipherBox-1.9.0.apk             # 新签名 Android 安装包（零权限）
SECURITY-MIGRATION.md          # 签名迁移与数据迁移说明
releases/CipherBox-v1.8.6/      # 历史源码与说明，旧 APK 不再分发
android-build/                  # Android 壳工程
  app/src/com/g/vault/          #   MainActivity / BackupProvider / CrashApp
  app/AndroidManifest.xml
  app/res/                      #   图标（adaptive + legacy 五密度）
  build-app.js                  #   零依赖构建脚本（aapt2 + javac + d8 + zipalign + apksigner）
verify_v2.js  test-*.js         # 自动化测试（端到端 86 项 + 各专项，共约 150+ 断言）
```

## 构建 Android App

无 Gradle、无 Android Studio 依赖，一个 Node 脚本串联官方命令行工具：

```bash
node android-build/build-app.js    # → CipherBox-<version>.apk
```

构建前须设置 `CIPHERBOX_KEYSTORE`（仓库外路径）、`CIPHERBOX_STORE_PASSWORD`（仅当前进程环境）、可选的 `CIPHERBOX_KEY_ALIAS`（默认 cipherbox-prod）。工具链可通过 `CIPHERBOX_ANDROID_TOOLS` 指定，Python 可通过 `CIPHERBOX_PYTHON` 指定。禁止把私钥或密码放进仓库。已配置 Windows 私有凭据的维护者可运行 `android-build/Build-Private.ps1`。

构建链路：`aapt2 编译资源 → aapt2 link → javac（全部源文件）→ d8 → 注入 dex → zipalign → apksigner 签名`

## 测试

```bash
node verify_v2.js      # 端到端 86 项（创建/增删改查/搜索/回收站/锁定/主题/合并导入）
node test-lock.js      # 锁定安全 16 项（明文清理/弹层关闭/光场暂停）
node test-import.js    # 智能合并导入 15 项（含跨主密码）
node contrast-real.js  # 八主题对比度实测（真实渲染探针）
```

## 安全模型（诚实声明）

- 数据在设备本地以密文形式存储；无任何网络传输代码，App 无网络权限
- **备份文件是有效的离线爆破目标**：请只发给自己（文件传输助手 / 私有网盘），不要发到公开场合
- 忘记主密码 = 数据永久丢失，没有后门
