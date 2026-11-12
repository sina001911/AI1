# AI1 Cloud-Only Live Voice Architecture Audit — RoomKit Integration Preparation

**Date:** 2026-11-12  
**Scope:** Read-only investigation. No code was changed. No packages were installed or removed.  
**Goal:** Assess current voice subsystem readiness for a future RoomKit cloud-live-voice integration via an abstraction/integration layer.  
**Decision confirmed:** AI1 will NOT use local ASR/TTS models; only cloud-based live voice.

---

## 1. Verified Findings (یافته‌های تأییدشده)

### 1.1 Core services — Main process
| Finding | File | Evidence |
|---------|------|----------|
| `VoiceSessionService` is the central orchestrator | [`src/main/ai/voice/VoiceSessionService.ts:119`](src/main/ai/voice/VoiceSessionService.ts) | Extends `BaseService`, decorated `@Injectable('VoiceSessionService') @ServicePhase(Phase.WhenReady)`. Lifecycle-managed (`onInit` / `onStop` / `onDestroy`). |
| Session state machine supports all required phases | [`src/shared/ipc/schemas/voice.ts:92-105`](src/shared/ipc/schemas/voice.ts) | `VOICE_SESSION_PHASES = ['idle','recording','recorded','recognizing','generating','ready','playing','paused','failed']`. Commands include `'interrupt'`. |
| Recording pipeline: MediaRecorder → blob → `file.voice_recording.create` IPC | [`src/main/ai/voice/VoiceSessionService.ts:250-276`](src/main/ai/voice/VoiceSessionService.ts) | Validates webm/opus header bytes, stores as `InternalFileEntry` with `cleanupPolicy: 'delete_when_unreferenced'`. |
| Streaming transcription via PCM input | [`src/main/ai/voice/VoiceSessionService.ts:278-347`](src/main/ai/voice/VoiceSessionService.ts) | `startStreamingTranscription()` opens `VoiceInputStream`, streams PCM chunks via `ai.voice.input.write`, emits revision events on `ai.voice.transcript_event`. |
| Speech generation (buffered + PCM stream output) | [`src/main/ai/voice/VoiceSessionService.ts:435-616`](src/main/ai/voice/VoiceSessionService.ts) | Handles both `SpeechOutputKind.Audio` (WAV URL via media protocol) and `SpeechOutputKind.PcmStream` (real-time `VoiceStream` relay). |
| Power-interruption handling (suspend / lock) | [`src/main/ai/voice/VoiceSessionService.ts:1417-1438`](src/main/ai/voice/VoiceSessionService.ts) | Broadcasts `'interruption'` event to all window types; interrupts recording, pauses playback. |
| Barge-in is supported natively | [`src/shared/ipc/schemas/voice.ts:105`](src/shared/ipc/schemas/voice.ts) | `VOICE_SESSION_COMMANDS` includes `'interrupt'`; `handlePowerInterruption` sends it automatically. |
| Multi-language auto-detection: **NOT present** | [`src/main/ai/voice/localAdapters.ts:109-115`](src/main/ai/voice/localAdapters.ts) | Transcription language requires explicit `TranscriptionLanguageSource.Explicit | Interface | ModelDefault`; no `'auto'` mode for voice. |
| All ASR/TTS adapters are local-first | [`src/main/ai/voice/localAdapters.ts:32-43`](src/main/ai/voice/localAdapters.ts) | 4 ASR (apple-system, windows-system, funasr, qwen3-asr) + 4 TTS (apple-system, windows-system, qwen3-tts, kokoro). Zero cloud providers registered. |
| No "live mode" boolean flag exists | — | Streaming is achieved implicitly through the `input.write` / `input.finish` PCM chunk pipeline plus revision events; there is no separate live-mode toggle in any schema. |

### 1.2 Core services — Renderer
| Finding | File | Evidence |
|---------|------|----------|
| `VoiceService` singleton wraps all IPC | [`src/renderer/services/voice/VoiceService.ts`](src/renderer/services/voice/VoiceService.ts) | ~35 public methods; uses `ipc.request()` for all calls to main. Manages reservation/tombstone pattern for session lifecycle. |
| `DictationService` — two pipelines | [`src/renderer/services/voice/DictationService.ts`](src/renderer/services/voice/DictationService.ts) | MediaRecorder path (non-streaming webm) + AudioWorklet `PcmCapture` path (streaming PCM). Error recovery via clipboard copy or target insertion. |
| `SpeechPlaybackService` — two backends | [`src/renderer/services/voice/SpeechPlaybackService.ts`](src/renderer/services/voice/SpeechPlaybackService.ts) | `FinitePlayback` (HTMLAudioElement for WAV URLs) + `PcmPlayback` (AudioWorklet with back-pressure acknowledgment for real-time streaming). |
| `AutoReadService` — message-completion trigger | [`src/renderer/services/voice/AutoReadService.ts`](src/renderer/services/voice/AutoReadService.ts) | Calls `speechPlaybackService.start()` after assistant reply finishes; respects `feature.voice.auto_read.enabled` preference. |
| `VoiceTargetManager` — inject-text-into-focus-target pattern | [`src/renderer/services/voice/VoiceTargetManager.ts`](src/renderer/services/voice/VoiceTargetManager.ts) | Pure in-memory map + listeners. Already used by NotesEditor, TranslateInputPane, chat composer. Reusable for cloud-stream text injection. |
| `PcmCapture` / `PcmPlayback` — Web Audio API | [`src/renderer/services/voice/PcmCapture.ts`](src/renderer/services/voice/PcmCapture.ts), [`src/renderer/services/voice/PcmPlayback.ts`](src/renderer/services/voice/PcmPlayback.ts) | Both use `AudioWorkletNode`; chunk size 1600 frames. Independent of model type — abstract enough to route either local or cloud PCM. |
| `VoicePlaybackHost` floating bar | [`src/renderer/components/VoicePlaybackHost.tsx`](src/renderer/components/VoicePlaybackHost.tsx) | Shows pause/resume/stop/retry during TTS sessions. Reusable for cloud playback without changes. |
| `DictationControls` inline toolbar | [`src/renderer/components/DictationControls.tsx`](src/renderer/components/DictationControls.tsx) | Mic button + progress visualizer + transcript preview. Context-aware (notes editor, translate pane, chat composer). |

### 1.3 IPC routes & shared types
| Finding | Detail |
|---------|--------|
| Total voice IPC routes | **~35 routes** defined in [`src/shared/ipc/schemas/voice.ts`](src/shared/ipc/schemas/voice.ts), all `rendererToMain` direction. |
| Key event channels | `ai.voice.session_event` (state + commands), `ai.voice.stream_event` (PCM chunks to renderer), `ai.voice.transcript_event` (ASR revisions to renderer). |
| Shared core types | [`src/shared/ai/voice.ts`](src/shared/ai/voice.ts): `SpeechStreamIdentity`, `SpeechStreamEvent`, `TranscriptRevision`, `TranscriptionStreamEvent`, `SPEECH_TEXT_STREAM_LIMIT = 5_000`. |
| Error model | `VoiceRuntimeError` (main) + `VoiceDomainError` (renderer); mapped via `reasonByCode` from `@shared/ipc/errors/voice`. 20+ reason codes (`busy`, `aborted`, `invalid_audio`, `voice_unavailable`, …). |
| Local model IDs type-safe | `LOCAL_VOICE_MODEL_IDS`, `LocalTranscriptionModelId`, `LocalSpeechModelId` — all enum'd at the shared type level. |
| Preload | No dedicated voice preload functions; voice operates entirely through the generic `window.api.ipcApi.request/on()` bridge. |

### 1.4 UI surface area
| Component | Route / Location | Role |
|-----------|------------------|------|
| `VoiceSettings` page | `src/renderer/routes/settings/voice.tsx` → `VoiceSettings.tsx` | Single settings hub: ASR model selector, language, mic device, TTS model/voice/speed, shortcuts, auto-read toggle. |
| `DictationShortcutSettings` | Same page, bottom section | Hold/toggle hotkey config (`AltLeft`, `AltLeft+CtrlLeft`). |
| `DictationControls` | Mounted in `NotesEditor`, `TranslateInputPane`, chat composers | In-context mic button + progress + transcript preview. |
| `VoicePlaybackHost` | Global fixed floating bar (bottom-center) | Playback controls during TTS. |
| `ComposerDictationButton` | Chat composer toolbar | Quick-start dictation from chat view. |
| Collaborative Studio | **None** | No voice integration found in collaborative Studio. |

### 1.6 Test coverage (updated after full scan)

| Layer | Files | Lines | Key test files |
|-------|-------|-------|----------------|
| Main process core | 10 | ~4,750 | `VoiceSessionService.test.ts` (2,367), `voiceAdmissionCoordination.test.ts` (787), `localAdapters.test.ts` (102), `playbackState.test.ts` (108), `execution.test.ts` (252), `voiceConfiguration.test.ts` (233) |
| Main process per-platform adapters | 11 | ~2,338 | `apple.test.ts` (551), `windows.test.ts` (438), `funasr.test.ts` (411), `qwen3Asr.test.ts` (96), `qwen3Tts.test.ts` (105), `kokoroTts.test.ts` (112) |
| Main IPC handlers | 1 | 299 | `src/main/ipc/handlers/__tests__/voice.test.ts` |
| Renderer services | 14 | ~6,329 | `SpeechPlaybackService.test.ts` (1,591), `DictationService.test.ts` (1,237), `VoiceService.test.ts` (972), `VoiceTargetManager.test.ts` (168), `AutoReadService.test.ts` (208) |
| Renderer UI integration | 3 | 633 | `NotesEditor.voice.test.tsx` (279), `ComposerSurface.test.tsx`, related selector tests |
| Shared contracts | 2 | 64 | `localVoice.test.ts` (21), `voice.test.ts` (schema validation, 43) |
| System-speech package | 6 | 742 | `SystemSpeechNativeClient.test.ts` (186), `speechStream.test.ts` (217), smoke tests for Windows SAPI |
| Smoke harness | 1 | 393 | `scripts/voice-runtime-smoke/run.ts` (CDP-based end-to-end over tracked Electron) |
| **Total** | **49** | **~14,550** | — |

**Test patterns:**
- Vitest unit tests with native mocks (SAPI, sherpa-onnx, Apple Speech)
- Full voice session/service chained flows with mocked IPC
- Platform-gated smoke runs: only Windows x64 in CI (`.github/workflows/system-speech-windows.yml`)
- No Mac/Apple-adapter tests run in CI (requires macOS runner absent from `ci.yml`)

**Gaps identified:**
- No standalone voice architecture README; docs are inside [`docs/references/ai/local-models.md`](docs/references/ai/local-models.md) alongside OCR/embedding material
- ROADMAP.md has zero voice-related items
- No Qwen3-TTS inference tests under `src/main/ai/localModel/runtime/__tests__/`
- No Linux/x64 adapter tests exist
- Local model download scripts (`sherpa-arm64-models.ts`) fetch weights from HuggingFace at runtime — flagged as P9 exclusion item for RoomKit path

---

## 2. Current Voice Architecture (معماری فعلی)

```
┌──────────────────────────────────────────────────────────────┐
│                        RENDERER                              │
│                                                              │
│  ┌─────────────────┐   ┌─────────────────────────────────┐  │
│  │ DictationService│   │  SpeechPlaybackService          │  │
│  │  • MediaRecorder│   │  • FinitePlayback (HTMLAudioEl) │  │
│  │  • PcmCapture   │   │  • PcmPlayback (AudioWorklet)   │  │
│  │  • VoiceTarget  │   │  • AutoReadService              │  │
│  └────────┬────────┘   └────────────┬────────────────────┘  │
│           │                         │                       │
│  ┌────────▼─────────────────────────▼─────────────────┐    │
│  │              VoiceService (singleton)               │    │
│  │  ipc.request() / ipc.on()  × ~35 routes            │    │
│  └─────────────────────┬──────────────────────────────┘    │
└────────────────────────┼────────────────────────────────────┘
                         │  IPC (IpcApi RPC)
┌────────────────────────▼────────────────────────────────────┐
│                          MAIN                               │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           VoiceSessionService (@WhenReady)             │ │
│  │  Sessions: recording | playback | install               │ │
│  │  State machine: idle→recording→recorded→recognizing…   │ │
│  └─────────────────────┬──────────────────────────────────┘ │
│                        │                                     │
│    ┌───────────────────┼───────────────────┐                │
│    ▼                   ▼                   ▼                │
│ ┌─────────┐      ┌──────────────┐     ┌─────────┐          │
│ │FunASR   │      │ Apple/Win    │     │Qwen3-   │          │
│ │Nano ASR │      │ System ASR   │     │ASR 1.7B │          │
│ └─────────┘      └──────────────┘     └─────────┘          │
│                                                              │
│ ┌─────────┐      ┌──────────────┐     ┌─────────┐          │
│ │Kokoro   │      │ Apple/Win    │     │Qwen3-   │          │
│ │v1.1 TTS │      │ System TTS   │     │TTS 0.6B │          │
│ └─────────┘      └──────────────┘     └─────────┘          │
│                                                              │
│  UtilityProcess: voiceAudioProcess (audio resampling/decode) │
└──────────────────────────────────────────────────────────────┘
```

**Key design characteristics:**
- **Fully local-first**: Every ASR/TTS adapter runs an on-device model bundle. Zero cloud endpoints.
- **State-machine driven**: `VoiceSessionService` owns a strict phase transition table; illegal transitions throw `VoiceRuntimeError`.
- **Reservation/tombstone cleanup**: Renderer sessions are tracked with `generation` tokens to survive teardown races.
- **No cloud provider abstraction**: There is no interface like `VoiceProvider` or `AsrAdapter { transcribe(input): Promise<string> }` that could accept a cloud impl. Adapters are resolved statically by `modelId` string at startup time.
- **PCM intermediary**: Both recording and streaming pass raw PCM (`Float32Array`, 1600-frame chunks) through IPC — this is the right layer to hook a cloud codec into.

---

## 3. Future RoomKit Integration Architecture (معماری پیشنهادی ادغام آینده)

The room for RoomKit is a new **"cloud voice"** path that coexists with existing local adapters. The cleanest integration point is an **adapter-level abstraction** inside the main-process voice system, plus a lightweight renderer-side switch.

### Proposed layering

```
┌────────────────────────────────────────────────────────────────┐
│                        RENDERER                                │
│                                                                │
│  VoiceService   ←── unchanged ──→   DictationService           │
│       │                                      │                 │
│       │  NEW: add roomId/modelId field to   │                 │
│       │  transcription.resolve input        │                 │
│       │                                   ┌─▼──────────────┐  │
│       │  NEW: route PCM → RoomKit SDK    │  VoiceTargetMgr │  │
│       │         OR keep using IPC for    └─────────────────┘  │
│       │         legacy local path                            │
│  ┌────▼─────────────────────────────────────────────┐        │
│  │  CloudVoiceBridge (NEW service, renderer side)   │        │
│  │  • establishes WebSocket / SDK connection         │        │
│  │  • handles server-driven VAD/barge-in             │        │
│  │  • pushes received text → VoiceTargetManager       │        │
│  │  • receives audio PCM chunks → send via SDK       │        │
│  └───────────────────────────────────────────────────┘        │
└────────────────────────────────────────────────────────────────┘
                          ↕ IPC (or direct SDK call)
┌────────────────────────────────────────────────────────────────┐
│                          MAIN                                  │
│                                                                │
│  VoiceSessionService   ←── unchanged core logic ──→            │
│       │                                                        │
│       │  NEW: registerCloudAdapter(modelId, factory)           │
│       │  NEW: cloud adapter implements same                     │
│       │         SpeechRequest/TranscriptionRequest interfaces   │
│       └──────────► CloudVoiceAdapter (NEW module)              │
│                    • accepts PCM stream or audio blob           │
│                    • forwards to RoomKit SDK                    │
│                    • emits revisions via callback               │
│                    • returns Final result on completion         │
│                                                                │
│  Existing adapters stay untouched: FunASR, Qwen3, Apple, …     │
└────────────────────────────────────────────────────────────────┘
```

### Design decisions

| Decision | Rationale |
|----------|-----------|
| **Register cloud adapter via modelId** | Keeps the `localAdapters.ts` dispatch table pattern; RoomKit gets one entry (`'roomkit-v1'`) alongside existing entries. No schema changes needed for existing paths. |
| **Reuse `VoiceInputStream` / `VoiceTextInput`** | These classes already handle async iterable PCM/text streams. Cloud adapter can wrap them identically. |
| **Renderer-side `CloudVoiceBridge` (new)** | Handles the long-lived WebSocket/SDK connection, token management, reconnection, server-driven barge-in. Separate from `VoiceService` which stays IPC-bound. |
| **Use existing `ai.voice.input.write` route for fallback** | If RoomKit SDK doesn't support streaming PCM push, fall back through the existing IPC channel (just like FunASR does). Only the inference backend changes. |
| **Add `provider: 'roomkit'|'local'` to resolve inputs** | One extra optional field on `ai.voice.transcription.resolve` and `ai.voice.speech.resolve` inputs — minimal schema change. Default remains undefined (current behavior). |
| **Re-use `VoiceTargetManager` for text injection** | Cloud ASR text can be injected through the same mechanism that local dictation uses today. No new UI plumbing. |
| **New settings panel (optional)** | A dedicated "Live Voice" section under `/settings/voice` for RoomKit token/API config, distinct from model selectors. |

### Data flow for cloud streaming (proposed)

```
User presses mic
  → DictationService.startScoped()
  → PcmCapture starts (unchanged)
  → CloudVoiceBridge intercepts (if provider === 'roomkit')
      ↳ Send PCM chunks via SDK push
      ↳ Receive ASR revision callbacks (server VAD)
      ↳ Push text → VoiceTargetManager.insertIntoCurrent()
  ELSE (local path, unchanged)
      ↳ IPC ai.voice.input.write → VoiceSessionService
      ↳ ASR model processes → ai.voice.transcript_event revisions
      ↳ Renderer receives → inserts into target
```

---

## 4. Reusable Components (اجزای قابل استفاده مجدد)

These existing pieces can be reused **without modification** for RoomKit integration:

| Component | Path | How it's reused |
|-----------|------|-----------------|
| `VoiceTargetManager` | `src/renderer/services/voice/VoiceTargetManager.ts` | Cloud ASR text injection goes through `insertIntoCurrent(text, intent)` — identical to local dictation. |
| `PcmCapture` | `src/renderer/services/voice/PcmCapture.ts` | Produces PCM `Float32Array` chunks via AudioWorklet; cloud bridge reads these instead of sending via IPC. |
| `VoiceStream` / `VoiceInputStream` | `src/main/ai/voice/VoiceStream.ts`, `VoiceInputStream.ts` | Async iterable containers; cloud adapter can consume them directly. |
| `SpeechStreamIdentity` | `src/shared/ai/voice.ts` | If RoomKit produces streamed audio back, the same identity struct identifies the stream. |
| `VoicePlaybackService` | `src/renderer/services/voice/SpeechPlaybackService.ts` | TTS output (if RoomKit provides TTS) plugs into existing `FinitePlayback` or `PcmPlayback`. |
| `playbackStateSchema` | `src/shared/ipc/schemas/voice.ts:113` | Controls UI state machine for playback bar; works identically for cloud-synthesized speech. |
| `VOICE_SESSION_COMMANDS` | `src/shared/ipc/schemas/voice.ts:105` | Barge-in (`'interrupt'`) command already in the protocol; cloud adapter just needs to honor it. |
| `DictationShortcutHost` | `src/renderer/components/DictationShortcutHost.tsx` | Hotkey registration is scope-neutral; only needs a flag to choose cloud vs. local pipeline. |
| `VoiceSettings` page | `src/renderer/pages/settings/VoiceSettings/VoiceSettings.tsx` | Add a new dropdown/radio for "Voice provider: Local / RoomKit" — rest of the form is reusable. |
| `VoiceRuntimeError` / error model | `src/main/ai/voice/VoiceRuntimeError.ts` | New `reason: 'cloud_unavailable'` etc. can be added to the existing enum; mapping layer is already in place. |
| `UtilityProcess` infrastructure | `src/main/core/utilityProcess/` | Could host the RoomKit SDK worker if it needs a separate process for GPU/audio thread isolation. |

---

## 5. Required Future Changes (تغییرات موردنیاز)

### Phase 0 — Foundation (no breaking changes)

| # | Change | Where | Priority | Effort |
|---|--------|-------|----------|--------|
| 1 | Define `CloudVoiceAdapter` interface in `src/shared/ai/cloudVoice.ts` | new file | P0 | Small |
| 2 | Register cloud adapter via `registerCloudAdapter(modelId, factory)` in `localAdapters.ts` | `src/main/ai/voice/localAdapters.ts` | P0 | Small |
| 3 | Add optional `provider?: 'roomkit' \| 'local'` to transcription/speech resolve inputs | `src/shared/ipc/schemas/voice.ts` | P0 | Small |
| 4 | Wire `provider` through `resolveTranscriptionRequest` / `resolveSpeechRequest` | `src/main/ai/voice/localAdapters.ts` | P0 | Small |

### Phase 1 — Cloud ASR path

| # | Change | Where | Priority | Effort |
|---|--------|-------|----------|--------|
| 5 | Implement `RoomKitAsrAdapter` class | `src/main/ai/voice/cloudAdapters/roomkitAsr.ts` (new dir) | P1 | Medium |
| 6 | Connect `PcmCapture` → RoomKit SDK push (bypass IPC for PCM) | `src/renderer/services/voice/CloudVoiceBridge.ts` (new) | P1 | Medium |
| 7 | Inject cloud ASR revisions into `VoiceTargetManager` | `src/renderer/services/voice/CloudVoiceBridge.ts` | P1 | Small |
| 8 | Add `"roomkit"` option to VoiceSettings model dropdown | `src/renderer/pages/settings/VoiceSettings/VoiceSettings.tsx` | P1 | Small |
| 9 | Handle barge-in (`interrupt` command) → cancel RoomKit recognition | `src/main/ai/voice/cloudAdapters/roomkitAsr.ts` | P1 | Small |

### Phase 2 — Cloud TTS path (optional, later)

| # | Change | Where | Priority | Effort |
|---|--------|-------|----------|--------|
| 10 | Implement `RoomKitTtsAdapter` | `src/main/ai/voice/cloudAdapters/roomkitTts.ts` | P2 | Medium |
| 11 | Route `ai.speech.generate` with `provider:'roomkit'` through cloud adapter | `src/main/ai/voice/VoiceSessionService.ts` | P2 | Medium |
| 12 | Handle PCM-stream TTS output → `PcmPlayback` in renderer | existing `SpeechPlaybackService` | P2 | Small |

### Phase 3 — Settings & auth

| # | Change | Where | Priority | Effort |
|---|--------|-------|----------|--------|
| 13 | Add RoomKit credential storage (encrypted, via BootConfig or separate secret store) | new or extend `BootConfig` | P2 | Medium |
| 14 | Connection status indicator in VoiceSettings | `VoiceSettings.tsx` | P2 | Small |
| 15 | Reconnection / token-refresh handling in `CloudVoiceBridge` | new `CloudVoiceBridge.ts` | P2 | Medium |

### Schema change summary
- **`voiceRequestSchemas`**: two routes gain an optional `provider` field.
- **`localVoice.ts` shared types**: may need `CloudVoiceModelId` union type, or simply reuse `LocalVoiceModelId` and register cloud model IDs in the same enum (cleaner: new `VoiceModelId = LocalVoiceModelId \| 'roomkit-*'`).
- **No changes** to `VoiceSessionState`, `VoicePlaybackState`, event shapes, or error codes (unless adding new reasons).

---

## 6. Risks & Limitations (ریسک‌ها و محدودیت‌ها)

| Risk | Severity | Mitigation |
|------|----------|------------|
| **No existing cloud-voice abstraction** | High | Phase 0 (items 1–4) creates the interface before any cloud code lands. |
| **IPC bandwidth for PCM streaming** | Medium | Renderer-to-main PCM over IPC (~48 kHz × 2 ch × 4 bytes × N chunks/sec) is heavy; cloud bridge should bypass IPC when possible and talk to RoomKit SDK directly from renderer. |
| **Latency sensitivity** | High | Cloud round-trip adds 100–500 ms vs. local <50 ms. Server-side VAD is mandatory; consider rendering provisional revisions immediately (already supported via `TranscriptionOutputKind.Revisions`). |
| **Network reliability** | Medium | Offline/loss-of-connectivity must degrade gracefully to "no voice available" rather than crashing. All errors go through existing `VoiceRuntimeError` / `VoiceDomainError` so UI already handles failure states. |
| **Authentication / token refresh** | Medium | Long-lived sessions need silent token renewal without disrupting active transcription. Use `AbortController`-based cancellation to cleanly abort and restart. |
| **Barge-in over network** | Low–Medium | RoomKit must support interrupting an in-flight cloud recognition; `VOICE_SESSION_COMMANDS.interrupt` is already in the protocol, just needs cloud-side dispatch. |
| **Multi-window race conditions** | Low | `VoiceSessionService` lease model already serializes operations per-window; cloud adapter must respect the same lease semantics. |
| **No existing tests for cloud path** | Low | Tests for local adapters exist (10+ files); mirror the same structure for cloud adapter once implemented. |
| **Shared type coupling** | Low | `LOCAL_VOICE_MODEL_IDS` enum would need expansion or a parallel `CLOUD_VOICE_MODEL_IDS`; decide early to avoid duplication. |

---

## 7. Agent's Independent Recommendations (پیشنهادهای مستقل)

Based on the full audit, here are my independent recommendations — not requested by you, but derived from what the code shows:

1. **Create the adapter interface *before* RoomKit exists.** Even though RoomKit isn't built yet, the `CloudVoiceAdapter` interface (item 1 above) takes <1 hour and prevents a refactor later when the SDK is ready. The interface should mirror `TranscriptionModelDefinition` / `SpeechModelDefinition` in `src/main/ai/voice/voiceModelTypes.ts`.

2. **Keep the renderer's `PcmCapture` intact.** It's a clean Web Audio API abstraction that produces exactly what both local AND cloud adapters need (raw PCM `Float32Array` chunks). Don't replace it; add a branching point *after* it outputs.

3. **Prefer a renderer-side cloud bridge over a main-process one.** The RoomKit SDK will likely want a persistent WebSocket. Running it in the renderer avoids IPC copy overhead for every PCM chunk. The main process should only be contacted for non-streaming operations (model listing, settings, session start/end).

4. **Extend, don't replace, `VoiceSessionService`.** Its session state machine is well-designed. Adding a `provider` field to the session object and branching `run()` at the adapter-resolution point is less invasive than creating a parallel service.

5. **Add a new `VoiceSessionSource` value `'roomkit'`** (in addition to existing `'settings'`, `'dictation'`, etc.) so the state machine and logging remain accurate without repurposing existing source values.

6. **Reuse the existing utility process infrastructure** (`voiceAudioProcess`) if RoomKit needs audio resampling/conversion before network upload — don't duplicate this logic.

7. **Consider a feature flag** (`feature.voice.provider` preference) that defaults to `'local'` and can be switched to `'roomkit'` without a reinstall. This makes gradual rollout possible.

---

## 8. Implementation Roadmap (نقشه راه مرحله‌ای)

### Phase 0 — Abstraction foundation (1–2 weeks, no user-facing change)
- [ ] Define `CloudVoiceAdapter` interface + register function
- [ ] Extend `localAdapters.ts` dispatch to look up cloud adapters
- [ ] Add optional `provider` field to resolve schemas
- [ ] Write unit tests for adapter registry (mirror existing `localAdapters.test.ts`)
- [ ] **Verify**: `pnpm check --plan` passes; no existing test breaks

### Phase 1 — Cloud ASR integration (2–3 weeks, opt-in)
- [ ] Create `src/main/ai/voice/cloudAdapters/` directory
- [ ] Implement `RoomKitAsrAdapter` (mock SDK until RoomKit ships)
- [ ] Create `CloudVoiceBridge` in renderer (WebSocket manager + PCM push)
- [ ] Wire `CloudVoiceBridge` into `DictationService` when provider = 'roomkit'
- [ ] Add RoomKit option to `VoiceSettings` dropdown
- [ ] Handle barge-in (`interrupt` → abort SDK request)
- [ ] **Verify**: End-to-end dictation via RoomKit (with mock server)

### Phase 2 — Cloud TTS + polish (2–3 weeks, optional)
- [ ] Implement `RoomKitTtsAdapter`
- [ ] Route TTS through cloud path in `VoiceSessionService`
- [ ] Handle PCM-stream TTS output in `PcmPlayback`
- [ ] Add credential storage + connection status UI
- [ ] Add offline fallback messaging
- [ ] **Verify**: Full text-to-speech loop through RoomKit

### Phase 3 — Production readiness (ongoing)
- [ ] Real RoomKit SDK integration (once available)
- [ ] Token refresh / reconnect logic
- [ ] Performance profiling (PCM throughput, latency measurements)
- [ ] Accessibility review (same as local voice)
- [ ] i18n strings for new UI elements
- [ ] **Verify**: Full `pnpm check` gate passes

### Phase −1 — Test & docs hygiene (parallel, low-priority)
- [ ] Create dedicated [`docs/references/voice/architecture.md`](docs/references/voice/architecture.md) separating voice design from local-model general docs
- [ ] Add `feature.voice.provider` preference type to BootConfig schema
- [ ] Register cloud-adapter stub test in `localAdapters.test.ts` (P0 items above)
- [ ] Add Windows CI job for cloud adapter smoke (extend `system-speech-windows.yml`)
- [ ] Note: Mac adapter tests remain platform-gated; no action needed unless testing on macOS locally
- [ ] **Verify**: `pnpm docs:check` passes for new doc; `pnpm check --plan` includes new test file

---

## 9. Approval Required (تصمیم‌هایی که به تأیید شما نیاز دارند)

Before any implementation begins, please confirm or decide on the following:

| # | Question | Options |
|---|----------|---------|
| **A** | Should cloud voice run primarily in the **renderer** (direct SDK WebSocket) or in **main process** (via IPC, like local models)? | Renderer (recommended) · Main process · Hybrid |
| **B** | Should Phase 0 (adapter interface) be implemented **now** as preparation, or deferred until RoomKit is closer to shipping? | Now (low effort, high value) · Later |
| **C** | Should existing local adapters (FunASR, Qwen3, etc.) remain selectable alongside RoomKit, or should they be hidden when cloud provider is chosen? | Coexist (dual path) · Hide locals when cloud active |
| **D** | What authentication model for RoomKit? | User-entered token in settings · OAuth flow · Embedded credential manager |
| **E** | Is server-side VAD (RoomKit decides when to stop recording) acceptable, or must client-side VAD be preserved for barge-in responsiveness? | Server VAD OK · Client VAD required · Both supported |
