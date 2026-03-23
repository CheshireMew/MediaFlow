# Feature Inventory

> **说明**：本文件用于追踪项目功能状态、代码映射及开发计划。每次开始开发前请查阅并更新此文件。

## 已修复和优化的特性区 (Bug fixes & Enhancements)

| 功能模块             | 状态 | 关键类/代码                      | 描述                                               |
| :------------------- | :--- | :------------------------------- | :------------------------------------------------- |
| **Download Worker**  | ✅   | `backend/desktop_worker.py`      | 修复了在 Windows 平台下 Electron 传参时的 Unicode/GBK 乱码问题，确保 `sys.stdin.reconfigure(encoding="utf-8")` 被调用。 |
