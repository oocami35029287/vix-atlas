---
name: vix-atlas-project-control
description: 啟動或延續 VIX Atlas／量化交易專案的任何需求時，先核對 GitHub 現行程式與 Google Drive 00_專案控制文件，依索引讀取相關規格；發生實質修改後同步更新控制文件的檔案索引、決策與修改紀錄。
---

# VIX Atlas 專案啟動、交接與修改紀錄

## 固定入口（先讀，不用請使用者重貼）
- GitHub 程式：https://github.com/oocami35029287/vix-atlas
- Google Drive 資料夾：https://drive.google.com/drive/folders/1Pw4nyup9AZctSnezhCkV-I1TSPRmVaHA
- **雲端專案控制（單一入口、權威索引）**：https://docs.google.com/document/d/1k3umXNkbMreQ39MMUTBJRiKq7yFQgCXO8hkXs8L4sPU/edit

## 每個新任務的啟動程序
1. 使用已連接的 Google Drive 工具，讀取「00_專案控制」的**最新內容**；先看「目前狀態／目錄索引／最新修改／待決事項」。禁止根據對話記憶或過期摘要聲稱已確認現況。
2. 使用已連接的 GitHub 工具，核對指定 repo 與目前預設分支，至少讀取 README.md、AGENTS.md、相關原始檔或提交；不能只讀 Drive 規劃文件就推斷程式已實作。依工作需求僅開啟控制文件指向的相關文件與程式，不必每次讀完所有大檔與歷史資料。
3. 區分三個層次：**目前實作**以 GitHub 程式及測試為準；**產品需求與規劃**以 Drive 指定的討論／需求文件為準；**專案工作狀態、路由與決策記錄**以「00_專案控制」為準。若三者衝突，指出差異並避免默默覆蓋。
4. 簡短回報「已讀取哪些最新來源、目前版號／分支、尚未確認的依賴」，然後才開始處理任務。

## 每次變更後的收尾程序
- 只有在使用者要求／允許修改時才寫入 GitHub 或 Drive。只討論、不要求寫入時，不自行改檔。
- 先驗證修改結果：GitHub fetch/readback、差異、測試；Google Docs 寫入後 readback。
- 在雲端「00_專案控制」的**修改紀錄**追加一筆（不要覆蓋舊紀錄）：台北時間、任務、執行者（ChatGPT/Codex 等）、修改的 GitHub 路徑／commit SHA／Drive 文件連結、做了什麼、驗證結果、未完成事項及下一步。
- 若新增、移動或改名檔案，同時更新「文件與程式索引」。若需求、取捨或策略定義改變，同時更新「已確認決策」。把提案與已完成事項分開。
- 不要把 API token、帳密、私人授權資料、敏感原始數據或整段大檔貼入修改紀錄。公開 GitHub 請勿複製雲端文件的私有內容。
- 若無法存取某來源或雲端寫入失敗，請明確寫「未讀取／未同步」及原因，並在回覆提供待同步文字；**不得宣稱同步成功**。

## 最低交付報告
- 讀取入口（GitHub branch/commit 與雲端專案控制）
- 本次完成內容／影響檔案
- 驗證與測試結果（沒跑就標示）
- 控制文件是否已更新
- 下一步／阻塞項

## 體系限制
- 此 SKILL 是指示工作流程，**不會替工具取得 GitHub／Google Drive 的授權**；必須有已連接且可存取的帳號。
- 只在具備技能探索的 Codex／代理環境中可由技能系統發現。若要 ChatGPT 每個新對話自動先讀，還需在 ChatGPT「量化交易」Project instructions 加入固定啟動規則，或在新對話明確要求「依 VIX Atlas 專案控制 SKILL 啟動」。
