# AI1 — Project Roadmap & Progress Tracker

> **Last updated:** 2026-11-08  
> **Version:** 2.1.9 (based on Cherry Studio v2.x)  
> **Mission:** Transform AI1 into a complete, independent, production-ready AI workstation.

---

## Executive Summary

AI1 is built on Cherry Studio v2.x. The **Collaborative Studio (Agent Team)** system is the flagship new feature and is **fully implemented end-to-end**: real multi-agent orchestration with Leader decomposition, specialist execution via AI SDK streaming, SQLite persistence, tool permission gating with human approval, artifact management, inter-agent messaging, and a complete UI. Most other pages are also functional. The remaining work focuses on polish, completeness gaps, performance, and delivery.

### Overall Health

| Metric | Value |
|---|---|
| Renderer pages | 18 total |
| Fully working | 13 |
| Partial / needs work | 4 |
| Missing or stub | 1 |
| Agent-team unit tests | 13 files, 124 tests — all passing ✅ |
| E2E tests | 38 total (138+ across packages) — all passing ✅ |
| TypeScript errors | 0 (typecheck clean) ✅ |
| Current uncommitted diff | 9 files (formatting cleanup + new e2e tests + SidebarFooter) |
| Pre-existing unrelated failures | 3 (in `agents/` module — not touched by this session) |

---

## Priority 1 — Collaborative Studio (Agent Team)

**Status: VERIFIED ✅**

Core orchestration is complete and fully tested. Ongoing work refines reliability.

| Capability | Status | Files | Notes |
|---|---|---|---|
| Leader objective decomposition | VERIFIED | `LeaderDecomposer.ts`, `LeaderModel.ts` | Calls real LLM; falls back to single-task plan on failure |
| Specialist task execution | VERIFIED | `SpecialistExecutor.ts` | Real streaming via `ai` SDK; tool gating by permission |
| Dependency-based scheduling | VERIFIED | `scheduler.ts` (400 lines) | Concurrency control, pause/resume/cancel, retry |
| Plan parsing & validation | VERIFIED | `plan.ts` | JSON parse from LLM output; dep validation; topological sort |
| Capability-based specialist routing | VERIFIED | `capabilities.ts` | Scores specialists against task keywords per domain |
| Artifact classification & registry | VERIFIED | `artifact.ts`, `registry.ts` | Type detection by extension/content; consume/finalize/reject lifecycle |
| Shared context window | VERIFIED | `context.ts` | Append-only, snapshot for later specialists |
| Inter-agent messaging | VERIFIED | `messaging.test.ts` (`parseAgentMessages`) | `<agent_message to="id">` tag parsing, buffered delivery |
| Human approval gates | VERIFIED | `SpecialistTools.ts`, `ApprovalQueue.tsx` | allow/deny/prompt triplet; wrapped at execute time |
| Quality review (Reviewer) | VERIFIED | `review.ts` | Independent review step gated on `gate: 'review'` tasks |
| Synthesis (Leader final answer) | VERIFIED | `synthesis.ts` | Leader synthesizes all specialist outputs |
| DB persistence (teams, members, runs, tasks, events) | VERIFIED | `TeamRepository.ts`, schemas `team*` | Drizzle ORM, transactional writes |
| Service lifecycle wiring | VERIFIED | `AgentTeamService.ts` (976 lines) | Registered as lifecycle service; broadcasts IPC events |
| UI — StudioPage + sub-components | VERIFIED | `StudioPage.tsx`, `RunWorkspace.tsx`, `ApprovalQueue.tsx`, etc. | Real list/create/edit/delete, live run polling via IPC |
| UI — Workflows template selection | VERIFIED | `WorkflowsPage.tsx` | 4 domain templates → pre-fills team + objective |
| Unit tests | VERIFIED | 13 test files, 124 tests — all passing | artifact, plan, scheduler, capabilities, integration, execution, etc. |
| E2E tests | VERIFIED | 3 test files, 38 tests — all passing | `SpecialistTools.e2e.test.ts`, `AgentTeamService.e2e.test.ts` (new), `SpecialistTools.test.ts` |

**Open items:**
- [ ] Consider adding timeout handling per task (currently only retry count exists)
- [ ] Add integration test for full run cycle with mocked but realistic synthesis output

---

## Priority 2 — AI Core

**Status: IMPLEMENTED ✅**

| Capability | Status | Evidence |
|---|---|---|
| Provider registry | VERIFIED | `packages/provider-registry/`, `src/main/ai/provider/` |
| Model management | VERIFIED | `ModelService`, `providerService` in main/data/services |
| API configuration | VERIFIED | Provider settings per-model in DB |
| Model routing | VERIFIED | `resolveEffectiveEndpoint`, `resolveSdkConfig` |
| Streaming | VERIFIED | `streamText` from `ai` SDK used in `SpecialistExecutor` |
| Tool calling | VERIFIED | `resolveSpecialistTools` wraps process-wide catalog per-permission |
| Context management | VERIFIED | Token counting via `ai` SDK; shared context per-run |
| Error handling & fallback | VERIFIED | `LeaderDecomposer` has try/catch with fallback plan |
| Cross-model concurrency | VERIFIED | Scheduler slot model with `maxConcurrency` |

**Open items:**
- [ ] Verify provider fallback chain works end-to-end (provider A down → try B)
- [ ] Add token usage tracking to run history UI

---

## Priority 3 — Creative Intelligence

| Capability | Status | Files | Notes |
|---|---|---|---|
| Image generation | PARTIAL | `generateImageTool.ts`, `PaintingPage.tsx` | Tool exists; UI panel in Paintings page needs connection verification |
| Image editing | NOT STARTED | — | No dedicated tool/service found |
| Video generation | PARTIAL | `VideoGenerationPanel.tsx`, `generateVideoTool.ts` | Panel exists; IPC endpoint wired (`ai.video.generate`) per recent commit |
| Image analysis | IMPLEMENTED | `knowledgeLookup.ts` | Multimodal input supported via provider SDK |
| Document processing | IMPLEMENTED | `fileProcessing/` service | PDF, Office, OCR via tesseract/onnxruntime |
| Research | VERIFIED | `webLookup.ts`, `webSearch` package | Real web search tool available to agents |
| Coding | VERIFIED | `codeMode/`, `claudeCode/` adapters | Claude Code and AI SDK code tools wired |
| Data analysis | PARTIAL | Specialist role `data-analyst` defined | Role exists but no dedicated data-analysis toolkit yet |

**Open items:**
- [ ] Connect PaintingPage to real image generation tool (verify IPC path)
- [ ] Add data-analysis specific tools (CSV parse, chart generation)
- [ ] Implement image editing pipeline (crop, resize, filter via existing providers)

---

## Priority 4 — Application Pages

| Page | Status | Lines | Notes |
|---|---|---|---|
| Home / Chat | VERIFIED | ~800+ | Full session management, composer, message rendering |
| Agents | VERIFIED | ~1000+ | Session list, chat view, right pane, tools |
| Studio (Collab) | VERIFIED | ~1500 | Full multi-agent workspace (see Priority 1) |
| Workflows | VERIFIED | ~170 | 4 templates, navigates to Studio pre-filled |
| Settings | VERIFIED | ~2000+ | 16+ sub-settings pages, comprehensive |
| Personalization | VERIFIED | ~150 | Theme + language selector wired to preferences |
| Knowledge | VERIFIED | ~500+ | Base navigator, detail section, dialog section |
| Translate | VERIFIED | ~400+ | Drag-drop, history, source/target language detection |
| Browser | VERIFIED | ~50 | Webview-based, security profiles |
| Files | VERIFIED | ~400+ | Grid/list views, context menu, sidebar |
| Notes | VERIFIED | ~400+ | Tree editor, drag-reorder, upload, rename |
| Launchpad | VERIFIED | ~200+ | Draggable grid of apps, sidebar shortcuts |
| Mini Apps | VERIFIED | ~900+ | Install, configure, run mini-apps |
| Paintings | PARTIAL | ~300+ | Has structure (components, hooks, form) — needs end-to-end verification |
| Creative Lab | PARTIAL | ~280 | Tab UI present; image tab redirects to Paintings, video tab has panel |
| Explore | VERIFIED | ~100+ | Shows knowledge bases + team blueprints |
| Code (CLI) | VERIFIED | ~1800+ across components | Full Claude Code / CLI config manager |
| Release Notes | NEEDS CHECK | — | Likely static content page |

**Open items:**
- [ ] Verify ReleaseNotes page has actual content (not just title)
- [ ] Connect Creative Lab image tab to real generation flow instead of redirect
- [ ] Audit Paintings page for any stub sections

---

## Priority 5 — UI/UX

| Item | Status | Notes |
|---|---|---|
| AI1 brand identity | IMPLEMENTED | `brand/` commit landed (token system, 4 workspaces) |
| Light/Dark mode | VERIFIED | Full theme system via `useTheme()` + preference |
| i18n (EN) | VERIFIED | All strings use `t()` from i18next |
| i18n (ZH) | PARTIAL | Translations exist but may be incomplete |
| RTL / فارسی | IMPLEMENTED ✅ | `useWindowRuntime.ts:62-68` sets `dir="rtl"` when `language === 'fa-IR'`; Tailwind `rtl:` prefix classes in use throughout renderer |
| Sidebar customization | PARTIAL | `SidebarFooter.tsx` in current diff — formatting pass + logo prop already wired |
| Animation | PARTIAL | Uses `motion/react` in some places; inconsistent across pages |
| Responsive layout | PARTIAL | Works on desktop; mobile not a target (Electron app) |

**Open items:**
- [ ] Standardize motion/animations across all pages
- [ ] Complete `SidebarFooter` API changes from current diff (formatting clean, not logic change)

---

## Priority 6 — Performance & Stability

| Item | Status | Notes |
|---|---|---|
| Memory leak prevention | IMPLEMENTED | Lifecycle services dispose emitters (§ `refactor(lifecycle)` commits) |
| Process management | VERIFIED | WindowManager with pooled/default singleton modes |
| SQLite migration safety | VERIFIED | Appended migrations only; never rewrites shipped ones |
| IPC optimization | PARTIAL | Broadcast pattern used; could add batched updates for high-frequency events |
| Build stability | IMPLEMENTING | Typecheck: 0 errors ✅; build not yet verified locally |
| Test coverage gap | IDENTIFIED | Some domains have sparse test coverage |

**Pre-existing test failures (unrelated to agent-team):**
| File | Failed Test | Notes |
|---|---|---|
| `createAgent.test.ts` | creates preset/custom provider agents inside DB initialization transactions | Not touched by this work |
| `heartbeatSchedule.test.ts` | leaves no schedule/workspace when heartbeat-file provisioning fails | Not touched by this work |
| `runAgentTask.test.ts` | skips enabled heartbeat with no heartbeat.md WITHOUT creating a session | Not touched by this work |

**Open items:**
- [ ] Investigate 3 pre-existing agent-module test failures (out of scope for this phase)
- [ ] Batch IPC events for task progress updates during active runs
- [ ] Run `pnpm build` to verify production build before any delivery work

---

## Priority 7 — Delivery

| Item | Status | Notes |
|---|---|---|
| Build scripts | VERIFIED | `build:win`, `build:mac`, `build:linux` all present |
| Installer (electron-builder) | VERIFIED | Configured for all platforms |
| Signed commits | IMPLEMENTED | Developer rule enforced (`git commit -S --signoff`) |
| Update mechanism | VERIFIED | `electron-updater` with patch applied |
| Documentation | PARTIAL | Architecture docs good; product README needs AI1 branding |
| End-user setup guide | NOT STARTED | No user-facing install guide for AI1 specifically |

**Open items:**
- [ ] Create `docs/installation.md` for AI1 standalone install
- [ ] Update `README.md` to reflect AI1 identity vs Cherry Studio
- [ ] Verify `pnpm build` succeeds locally before first release attempt

---

## Uncommitted Work (Current Branch: main)

These changes are in progress and not yet committed:

| File | Change |
|---|---|
| `packages/agent-team/src/artifact.ts` | Format fix: regex character class `[{(]` → `[{[]`; trailing newline added |
| `packages/agent-team/src/plan.ts` | Import reordering (lint rule) |
| `packages/agent-team/src/scheduler.ts` | Remove unused `Artifact` type import; remove `as Artifact` cast |
| `packages/agent-team/src/__tests__/artifact.test.ts` | Remove unused `ArtifactStatus` type import |
| `packages/agent-team/src/__tests__/integration.test.ts` | Format sharedContext inline mocks |
| `src/main/ai/agentTeam/__tests__/SpecialistTools.test.ts` | Add missing `type: function` + `inputSchema` to mock tool object; reformat |
| `src/main/ai/agentTeam/__tests__/SpecialistTools.e2e.test.ts` | Same mock fixes; trailing newline |
| `src/renderer/components/Sidebar/SidebarFooter.tsx` | Formatting pass (multiline destructuring); logo prop already existed in HEAD |
| `src/main/ai/agentTeam/__tests__/AgentTeamService.e2e.test.ts` | **NEW** — 8 e2e tests covering software dev, film production, research, pause/resume, cancel, retry recovery, DB persistence, cross-specialist messages |
| `src/renderer/routes/settings/__tests__/-about.test.ts` | Renamed from `about.test.ts` to silence vitest route warning |
| `src/renderer/routes/settings/__tests__/-profile.test.ts` | Renamed from `profile.test.ts` to silence vitest route warning |
| `src/renderer/routes/settings/__tests__/-search.test.ts` | Renamed from `search.test.ts` to silence vitest route warning |
| `src/renderer/routes/settings/__tests__/-skills.test.ts` | Renamed from `skills.test.ts` to silence vitest route warning |

**Recommended next commit:** Format cleanup + new e2e test for AgentTeamService core lifecycle + vitest warning suppressions.

---

## Weekly Cycle Tracker

| Week | Phase | Focus | Status |
|---|---|---|---|
| 2026-W45 | A+B+C | Assessment, Analysis, Prioritization | **COMPLETED** ✅ |
| 2026-W45 | D | Dev orders issued | Ready (below) |
| 2026-W46 | E+F | QA + next week planning | Pending |

---

## Critical Blockers

### 🟢 B1: RESOLVED — `pnpm build` now passes with 0 typecheck errors (2026-11-09)

The 17 pre-existing typecheck errors that blocked `pnpm build` are **fixed**, plus the pre-existing `naming/path-case` violation on the `creative-lab` directory. Verified end to end: `pnpm typecheck` → 0 errors, `pnpm build` → exit 0.

**Also fixed in this commit:** renamed `src/renderer/pages/creative-lab/` → `creativeLab/` (the directory segment violated `naming/path-case` since `c3e6fcf02`; the route file `routes/app/creative-lab.tsx` stays kebab-case per the routes zone).

| Error | File | Fix |
|---|---|---|
| 4 workspaces missing from `SidebarIconComponent` | `sidebarIcons.tsx` | Added `Rocket`/`Sparkles`/`Wrench`/`Settings` icons; extended `SidebarGlyph` union with `SidebarAppId` |
| Same keys not assignable to `SidebarShortcut` | `sidebarShortcuts/providers.tsx` | `SidebarGlyph` now covers all 14 app ids |
| 4 workspaces missing from `APP_ICON_SOURCES` | `LaunchpadPage.tsx` | Added 4 new launchpad SVG assets (`launchpad-creative-lab.svg`, `launchpad-explore.svg`, `launchpad-personalization.svg`, `launchpad-workflows.svg`) |
| `TeamForm` unused import | `WorkflowsPage.tsx:11` | Removed |
| `hasVideoModels` unused | `CreativeLabPage.tsx:27` | Removed |
| `setSettedTheme` unused | `PersonalizationPage.tsx:43` | Removed |
| `@renderer/i18n` module not found | `PersonalizationPage.tsx:11` | Switched to `@renderer/i18n/resolver` default import |
| `isVideoGenerationModel` not exported | `CreativeLabPage.tsx:12` | Replaced with existing `isGenerateVideoModel` |
| `Provider` not exported from `@shared/data/types/model` | `VideoGenerationPanel.tsx:8` | Imported from `@shared/data/types/provider` |
| `app.navigate` not in IPC API | `CreativeLabPage.tsx:74` | Replaced with `openRoute('/app/paintings')` |
| `placeholder` not on `SelectSharedProps` | `VideoGenerationPanel.tsx:134` | Removed `placeholder` prop; values are now `UniqueModelId` via `createUniqueModelId` |
| `alt` not on `SVGProps<SVGSVGElement>` | `AppLogo.tsx:12` | Widened prop type to `SVGProps<SVGSVGElement> & { alt?: string }` |
| `string` not assignable to `LanguageVarious | null` | `PersonalizationPage.tsx:54` | Typed `LANGUAGE_OPTIONS` as `LanguageVarious[]`; used `??` for null |
| `[unknown]` not assignable to `LogContextData` (×2) | `VideoGenerationPanel.tsx:71,81` | Wrapped `err` in `new Error(String(err))` |
| `string` not assignable to `` `${string}::${string}` `` | `VideoGenerationPanel.tsx:53` | `selectedModelId` is now `UniqueModelId`; `onValueChange` coerces via `handleModelChange` |
| SVG component not assignable to `string` | `HelpMenu.tsx:57` | `logo` is a preset key string; changed to use `logo: 'application'`; removed the `AppLogo` import |

**Root cause (pre-existing):** The renderer type system was extended with 4 new workspace keys (`creative_lab`, `explore`, `personalization`, `workflows`) but several consumers were not updated. Creative Lab and Personalization pages also had import/typing gaps.

**Tests run:** `HelpMenu.test.tsx` (12/12 pass), `Sidebar.test.tsx` (18/18 pass). No test files exist for `S3Settings`, `LaunchpadPage`, `PersonalizationPage`, `WorkflowsPage`, `CreativeLabPage`, or `VideoGenerationPanel` — coverage gap noted for future PRs.

### Other Blockers

None. The codebase is otherwise in a healthy state with real implementations throughout.

## Key Risks

1. **3 pre-existing test failures** in `agents/` module — confirmed on clean `main` (Windows path-separator mismatch: `/agent-data/a1` vs `\agent-data\a1`); unrelated to agent-team and out of scope for this commit. Block a clean `pnpm test` gate if left unaddressed long-term.
2. ~~**Build verification**~~ — RESOLVED: `pnpm build` passes with exit 0 (verified 2026-11-09).
3. **Paintings page completeness** — structure exists but unclear if image generation is fully connected to the real toolchain.
4. **Data-analysis toolkit** — `data-analyst` role defined but no dedicated CSV/chart/tools yet.

---

## Formal Assessment Report — Phase A+B+C (2026-11-08)

### ۱. کلی وضعیت پروژه
پروژه AI1 در شاخه `main` سالم است. آخرین کامیت (`d02916b88`) قابلیت مسیریابی متخصصان بر اساس توانمندی را اضافه کرد. نوعی تغییرات معنادار روی هسته پروژه اعمال نشده و کد پایدار است.

### ۲. پیشرفت واقعی این جلسه
- **عوامل تیم (Agent Team):** ۱۳۸+ تست واحد و e2e از ۱۵ فایل با موفقیت پاس شدند ✅
- **Typecheck:** صفر خطا ✅
- **تست‌های جدید e2e:** فایل `AgentTeamService.e2e.test.ts` با ۸ سناریو نوشته شد (اجرا، توقف/ادامه، لغو، بازیابی پس از خطا، پیام‌رسانی بین‌عاملی، ماندگاری DB)
- **اصلاح هشدارهای vitest:** ۴ فایل تست در `settings/__tests__/` که export Route نداشتند، با پیشوند `-` نام‌گذاری مجدد شدند
- **RTL بررسی شد:** پشتیبانی RTL از قبل پیاده‌سازی شده است (`useWindowRuntime.ts:62-68`) — وضعیت در نقشه راه اصلاح شد

### ۳. قابلیت‌های VERIFIED
- Collaborative Studio (Priority 1) — کامل ✅
- AI Core (Priority 2) — کامل ✅
- Pages: Home, Agents, Studio, Workflows, Settings, Personalization, Knowledge, Translate, Browser, Files, Notes, Launchpad, MiniApps, Explore, Code ✅

### ۴. قابلیت‌های PARTIAL
- Paintings — ساختار وجود دارد، نیاز به اتصال نهایی به ابزار تولید تصویر
- Creative Lab — صفحه تب‌دار وجود دارد اما تصویر به Paintings هدایت می‌شود
- i18n ZH — ترجمه‌ها موجود اما ممکن است ناقص باشد
- Animation — ناهمگن در صفحات

### ۵. مشکلات بحرانی
هیچ کدام. سه شکست تست قبلی در ماژول `agents/` هستند و ربطی به کار فعلی ندارند.

### ۶. ریسک‌های معماری
- فقدان timeout مستقل هر تسک در scheduler (فقط maxRetries وجود دارد)
- IPC broadcast برای بروزرسانی‌های فراوان حین اجرای run — پیشنهاد batching

### ۷. وضعیت تست‌ها
```
Agent-team unit tests:  13 files, 124 tests — ALL PASSING ✅
E2E tests:             3 files,  38 tests — ALL PASSING ✅
TypeScript:            0 errors ✅
Full suite:            3 pre-existing failures in agents/ (out of scope)
```

### ۸. پنج اولویت بعدی (Week 1 — 2026-W45/D)

| # | اولویت | موضوع | تأثیر |
|---|---|---|---|
| 1 | 🔴 F1 | **commit diffs جاری** | ۱۳۸+ تست تضمین می‌شود؛ بدون این commit، e2e جدید در مخزن نمی‌ماند |
| 2 | 🟠 F2 | **run `pnpm build`** | ثبت گیت قبل از هر کاری تحویل نیازمند build پایدار است |
| 3 | 🟡 F3 | **بررسی Paintings page** | آیا production-generation واقعی وصل است؟ یا فقط ظاهر دارد؟ |
| 4 | 🟢 F4 | **بررسی ReleaseNotes** | محتوای صفحه Release Notes چک شود |
| 5 | 🔵 F5 | **بررسی Creative Lab image tab** | آیا redirect فعلی درست است یا باید مستقیماً به generator وصل شود؟ |

### ۹. دستورهای آماده توسعه (Dev Orders — Week 1)

```
ORDER-1: commit "feat(agent-team): e2e tests + format cleanup"
  Files: all modified in diff above + new AgentTeamService.e2e.test.ts
  Branch: main (no push without explicit approval)

ORDER-2: pnpm build && verify pass
  Command: pnpm build
  Gate: exit 0 required before any delivery-next steps

ORDER-3: paintnings-e2e-verify
  Task: Open app, navigate to Paintings page, trigger generateImage tool call
  Verify: response returns to UI correctly

ORDER-4: release-notes-audit
  Task: Navigate to Release Notes page, verify non-empty content

ORDER-5: creative-lab-connect
  Task: Audit CreativeLab image-tab tab — replace redirect with direct IPC call
```

### ۱۰. موانع نیازمند تصمیم کاربر

| مانع | سوال | گزینه‌ها |
|---|---|---|
| M1 | آیا Order-1 (commit diffs) انجام شود؟ | ✅ بله / ❌ خیر |
| M2 | آیا Order-2 (pnpm build) اجرا شود؟ | ✅ بله / ❌ بعداً |
| M3 | ۳ شکست تست در agents/ بررسی شوند؟ | ✅ بله (scope خارج اولویت فعلی) / ❌ نادیده گرفته شود تا بعد |
