# Feature Inventory

> **说明**：本文件用于追踪项目功能状态、代码映射及开发计划。每次开始开发前请查阅并更新此文件。

## 已修复和优化的特性区 (Bug fixes & Enhancements)

| 功能模块             | 状态 | 关键类/代码                      | 描述                                               |
| :------------------- | :--- | :------------------------------- | :------------------------------------------------- |
| **Backend Runtime**  | ✅   | `backend/main.py` / `run.py`     | Python 业务运行时统一由 FastAPI backend 承载，Electron 不再启动第二套 Python 命令进程。 |
