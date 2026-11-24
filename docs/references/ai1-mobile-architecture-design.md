# AI1 — مستند معماری فاز ۱: طراحیmany-platform (Desktop + Android + iOS)

> **سازنده:** کلاس 설계 (Architecture Design — فاز ۱)  
> **تاریخ:** ۱۴۰۵/۰۸/۰۳ (۲۰۲۶-۱۱-۲۴)  
> **وضعیت:** پیشنهادی — در انتظار بررسی و تایید کاربر قبل از شروع اجرا  
> **مبنی بر:**報告 ممیزی فاز ۰ (READ-ONLY، bassed بر کدباس محلی در `D:\AI1` و ریموت `sina001911/cherry-studio-ai1`)  
> **مcuốn:** vainqueur릭انه

---

## ۱. خلاصه-gradeire و اهداف طراحی

AI1 فعلی یک **Workstation AI دسکتاپ (Electron)** است که شامل لایه‌های زیر است:

| لایه | المكانت | stataه |
|------|--------|--------|
| Provider Registry (`@cherrystudio/provider-registry`) | `packages/provider-registry/` | ✅ Cross-platform (export react-native وجود دارد) |
| Model Catalog (`data/*.json`) | تولید شده از `src/creators/` + `src/providers/` | ✅ قابل بسته‌بندی در موبایل |
| AI Core / AiService | `src/main/ai/AiService.ts` | ⚠️ وابسته به Electron/main process — نیاز به Layer化 |
| Collaborative Studio (Agent Team) | `packages/agent-team/` + `src/main/ai/agentTeam/` | ✅ Core types خالی از Electron؛運行 در main process دسکتاپ |
| Data layer (SQLite + Drizzle + DataApi) | `src/main/data/` | ✅ SQLite cross-platform؛ IPC/WindowManager مخصوص دسکتاپ |
| Renderer UI (React + TanStack Router + Shadcn) | `src/renderer/` | ❌ مخصوص وب/دسکتاپ — نیاز به بازساختی برای موبایل |
| Backend / Auth / Sync / Credits | وجود ندارد | ❌ باید ساخته شود |

**هدف funny المعمار فاز ۱:** تعریف قراردادها، پکیج Shared Core، مدل داده، مدل امنیتی و معماری backend که به AI1 امکان می‌دهد با **یک حساب کاربری** و **تجربه یکپارچه** بر روی دسکتاپ، Android و iOS اجرا شود، بدون اینکه دسکتاپ موجود آسیب ببیند.

**معمار پیشنهادی (Architecture D — Native + Shared Core):**

- **Shared Core (TypeScript):** قراردادهای API، مدل داده، کلاینت sync، لایه provider/model، پروتکل Collaborative Studio — مشترک بین همه پلتفرم‌ها.
- **Desktop App:** Electron موجود (تغییری نمی‌خورد) + Shared Core به‌عنوان وابستگی.
- **Android App:** React Native / Kotlin + Jetpack Compose + Shared Core.
- **iOS App:** SwiftUI + Shared Core.
- **Backend (Modular Monolith):** Auth، Device Management، Conversation Sync، Provider Gateway، Credit Ledger، Job Queue، Notification Service، Admin APIs.

---

## ۲. principه‌های طراحی (مستمد از CLAUDE.md)

1. **Simplicity First:** حداقل کد که مشکل را حل می‌کند. هیچ abstraction برای یکبار استفاده، هیچ لచگ-configurability درخواست‌نشده.
2. **Surgical Changes:** تنها آنچه وظیفه tâche است را لمس می‌کنیم. دسکتاپ موجود بدون تغییر باقی می‌ماند.
3. **Library-first:** از `@cherrystudio/provider-registry` و `@cherrystudio/ai-core` استفاده می‌کنیم؛ کد custom فقط وقتی که گزینه insuficient است.
4. **Cross-process types in `src/shared/`:** انواع مشترک بین main/renderer و یا بین پلتفرم‌ها در shared قرار می‌گیرند.
5. **No server-side fallback for v1:**مینگری chain v2 چکیده نشده؛ هیچ dual-write یا fallback برای v1 اضافه نمی‌شود.

---

## ۳. لایه Shared Core (`packages/ai-shared-core` جدید)

پکیج جدیدی در workspace که **بدون وابستگی به Electron** باشد و در دسکتاپ، Android، iOS و backend قابل import باشد.

### ۳.۱ محتوای پکیج

| زیرماolut |شرح | منبع쇼اهد |
|----------|-----|----------|
| `contracts/` | Zod schemas برای درخواست/پاسخ API‌های REST و WebSocket | جدید |
| `data-model/` | نوع‌های مدل داده (User, Device, Conversation, Message, CreditTransaction, …) | جدید، الگو از `src/shared/data/api/schemas/` |
| `provider-contracts/` | antype‌های Provider و Model (neteller از `packages/provider-registry/src/schemas/`) | reflex از provider-registry |
| `sync-client/` | کلاینت همگام‌سازی آفلاین-اول (offline queue, delta sync, conflict resolution) | جدید |
| `agent-protocol/` | انواع Collaborative Studio (Team, Task, Run, Artifact, Event) | reflex از `packages/agent-team/src/types.ts` |
| `api-client/` |-wrapper fetch/websocket برای ارتباط با backend | جدید |
| `auth-client/` | مدیریت توکن، refresh، device revocation | جدید |

### ۳.۲ ویژگی کلیدی:纯 domain types

رؤیت `packages/agent-team/src/types.ts` ثابت می‌کند که نوع‌های Collaborative Studio **بدون وابستگی به Electron** نوشته شده‌اند (`Specialist`, `Team`, `Task`, `ExecutionRun`, `TeamEvent`, `Artifact`, …). این types می‌توانند **همان‌طور که‌اند** در Shared Core reused شوند و فقط `SpecialistExecutor` (callback اجرا) را host (main process / mobile native) فراهم می‌کند.

---

## ۴. قراردادهای API (API Contracts)

ارتباط موبایل ↔ backend از طریق **REST + WebSocket/SSE** است (نه IPC مستقیم، چون موبایل دسترسی به main process دسکتاپ ندارد).

### ۴.۱ Endpoints پیشنهادی (REST)

| متد | مسیر | شرح | احراز هویت |
|------|------|-----|------------|
| POST | `/v1/auth/register` | ثبت‌نام کاربر | خیر |
| POST | `/v1/auth/login` | ورود و issued access+refresh token | خیر |
| POST | `/v1/auth/refresh` | تازه‌سازی refresh token | refresh token |
| POST | `/v1/auth/logout` | خروج و ان validation refresh token | access token |
| POST | `/v1/auth/devices` | ثبت دستگاه +FCM/APNs token | access token |
| DELETE | `/v1/auth/devices/:deviceId` | لغو دسترسی یک دستگاه (revocation) | access token |
| GET | `/v1/conversations` | لیست مکالمات همگام‌شده | access token |
| GET | `/v1/conversations/:id` | جزئیات مکالمه + پیام‌ها | access token |
| POST | `/v1/conversations` | ساخت مکالمه جدید | access token |
| POST | `/v1/conversations/:id/messages` | ارسال پیام و دریافت streaming پاسخ | access token |
| GET | `/v1/providers` | لیست ارائه‌دهنده‌ها و مدل‌ها | access token |
| GET | `/v1/models` | لیست مدل‌ها و قابلیت‌ها | access token |
| POST | `/v1/files/upload` | آپلود فایل/می�دیا | access token |
| GET | `/v1/credits/balance` | موجودی اعتبار کاربر | access token |
| GET | `/v1/credits/transactions` | تاریخچه تراکنش‌ها | access token |
| POST | `/v1/agent-teams` | ساخت تیم factor | access token |
| POST | `/v1/agent-teams/:teamId/runs` | اجرای یک رن Collaborative Studio | access token |
| GET | `/v1/agent-teams/:teamId/runs/:runId/events` | رویداد‌های رن (SSE/push) | access token |
| GET | `/v1/admin/…` | پنل مدیریت (فقط admin) | access token + role |

### ۴.۲ Real-time (WebSocket / SSE)

| کانال |شرح |
|-------|-----|
| `ws/v1/sync` | delta sync مکالمات و وضعیت دستگاه |
| `ws/v1/agent/:runId` | streaming رویدادهای Collaborative Studio (task progress, artifact, synthesis) |
| `ws/v1/notifications` | اعلان‌های push داخلی و پیام‌های سیستمی |

استراتژی: **SSE برای رویدادهای یک‌طرفه سرور→موتور** (راحت‌تر روی موبایل، يعمل با HTTP عادی) و **WebSocket برای دوطرفه چت streaming**.

### ۴.۳ فرمت پاسخ (Envelope)

```json
{
  "ok": true,
  "data": { … },
  "error": null,
  "meta": { "requestId": "…", "timestamp": 1732435200000 }
}
```

در صورت خطا: `ok: false`, `data: null`, `error: { code, message, details }`.

---

## ۵. مدل داده (Data Model)

جداول کلی backend (SQLite/Postgres از طریق Drizzle یا ORM معادل):

| جدول | فیلدهای کلی | توضیحات |
|-------|------------|---------|
| `users` | id, email, password_hash, created_at, updated_at, is_active | حساب کاربری |
| `devices` | id, user_id, device_id, platform (android/ios/desktop), name, last_seen_at, revoked_at | مدیریت دستگاه‌ها |
| `sessions` | id, user_id, device_id, access_token_jti, refresh_token_hash, expires_at, created_at | نشست‌ها |
| `conversations` | id, user_id, title, created_at, updated_at, deleted_at | مکالمات |
| `messages` | id, conversation_id, role (user/assistant/tool), content, model_id, provider_id, token_count, created_at | پیام‌ها |
| `provider_configs` | id, user_id, provider_id, api_key_encrypted, endpoint, is_active, created_at | BYOK و تنظیمات ارائه‌دهنده |
| `credit_ledger` | id, user_id, type (purchase/daily_free/usage/refund/adjustment), amount, balance_after, reference_id, created_at | یک‌قلم حسابрии |
| `credit_transactions` | id, user_id, model_id, provider_id, conversation_id, message_id, tokens_used, cost, created_at | تراکنش‌های مصرف |
| `subscriptions` | id, user_id, plan, status, starts_at, ends_at, auto_renew | اشتراک‌ها |
| `agent_teams` | id, user_id, name, strategy, max_concurrency, created_at, updated_at | تیم‌های Collaborative Studio |
| `agent_runs` | id, team_id, objective, status, result, started_at, completed_at | رن‌ها |
| `agent_tasks` | id, run_id, title, status, gate, input, output, retry_count, created_at | وظایف رن |
| `agent_artifacts` | id, run_id, task_id, type, content_type, ref, size_bytes, status | entsteht |
| `sync_checkpoints` | id, user_id, device_id, conversation_id, last_message_id, checksum, updated_at | نقاطড়ک sync |

**قوانین مدل داده:**
- هر کاربر می‌تواند چندین دستگاه داشته باشد؛ هر دستگاه یک `device_id` منحصر به فرد.
- اعتبار (credits) فقط در `credit_ledger` backend قابل تغییر است؛ کلاینت فقط خواننده است.
- حذف مکالمه = soft-delete (`deleted_at`) + tombstone برای sync.

---

## ۶. مدل امنیتی (Security Model)

### ۶.۱ احراز هویت و نشست
- **OAuth2 / JWT:** access token (کوتاه‌مدت، ۱۵ دقیقه) + refresh token (بزرگ‌مدت، ۷–۳۰ روز).
- **Device binding:** هر refresh token به یک دستگاه خاص مرتبط است؛ سایر دستگاه‌ها نمی‌توانند از آن استفاده کنند.
- **Revocation:** کاربر می‌تواند هر دستگاه را از پنل حساب یا کلاینت‌ها لغو کند (حذف refresh token + sessions).

### ۶.۲ ذخیره‌سازی کلیدها (Credential Storage)
| نوع کلید | مکان ذخیره | روش |
|---------|-----------|-----|
| API Key کاربر (BYOK) | Backend Credential Vault (encrypted at rest) | رمزنگاری AES-256-GCM، کلید мастер در KMS/HSM |
| Access/Refresh Token (موتور) | Android: EncryptedSharedPreferences + Keystore<br>iOS: Keychain | Symbolic، فقط خواندهnable توسط اپ |
| API Key در APK/IPA | **ممنوع** | هیچ کلید محرمانه داخل بسته播出 نمی‌شود |

### ۶.۳ رمزنگاری
- **در ترانزیت:** TLS 1.2+ برای همه ارتباطات؛ pinning certificate اختیاری برای امنیت بیشتر.
- **در entdeckation:** حساس‌ترین داده‌ها (API key، پیام‌ها) در دیتابیس backend رمزنگاری شده‌اند.
- **Log/Crash:** کلیدها و توکن‌ها در log، crash report (Sentry) و analytics ظاهر نمی‌شوند.

### ۶.۴ مجوزهای агент
- هر ابزار (tool) که یک specialist می‌فراخوانی به سهسطح مجاز است: `allow` / `prompt` (تایید کاربر) / `deny`.
- در موبایل، تایید کاربر از طریق dialogue-native انجام می‌شود (نیاز به UI مخصوص).

---

## ۷. طراحی برنامه‌های موبایل

### ۷.۱ Android
| Komponente | انتخاب |
|------------|-------|
| UI Framework | Jetpack Compose (Material 3) |
| Language | Kotlin |
| Network | Ktor / Retrofit + WebSocket |
| Storage | Room (SQLite) برای نسخه آفلاین، EncryptedSharedPreferences برای 토کن |
| Push | Firebase Cloud Messaging (FCM) |
| Biometric | BiometricPrompt (فingerprint/face) |
| Background Work | WorkManager (برای sync و tải/بارگذاری) |
| Camera/Microphone | CameraX + MediaRecorder / permissions زمان اجرا |
| RTL & Persian | Compose RTL پشتیبانیExistant؛ فونت فارسی (Vazirmatn / IranSans) |

### ۷.۲ iOS
| Komponente | انتخاب |
|------------|-------|
| UI Framework | SwiftUI |
| Language | Swift |
| Network | URLSession + WebSocket (Starscream یا native) |
| Storage | Core Data / SQLite + Keychain |
| Push | Apple Push Notification service (APNs) |
| Biometric | LocalAuthentication (Face ID / Touch ID) |
| Background Tasks | BGAppRefreshTask + BGProcessingTask (محدود — آwerkenاند perpetual agent) |
| Camera/Microphone | AVFoundation + permissions Info.plist |
| RTL & Persian | SwiftUI RTLSupport؛ فونت فارسی (Vazirmatn / IranSans) |

### ۷.۳ محدودیت‌های iOS (مهم)
- **اجرا دائمی agent در background مجاز نیست.** Apple تنها Background Fetch و Remote Notification محدود و tareas کوتاه‌مدت مجاز می‌دهد.
- Collaborative Studio در موبایل فقط وقتی برنامه در foreground است اجرا می‌شود؛ برای رن‌های بلندمدت، سرور-side backend اجرا می‌کند و نتیجه را از طریق push به موبایل می‌فرستد.

---

## ۸. معماری Backend (Modular Monolith)

backend یک **Modular Monolith** است (نه microservices غیرضروری). ماژول‌ها در یک کدباس}}/مخزن و در runtime جداگنده اجرا می‌شوند، اما منطقاً تفکیک شده‌اند.

| ماژول | وظیفه | وضعیت در AI1 فعلی |
|-------|--------|------------------|
| Auth | ثبت‌نام، ورود، refresh، device management | ❌ غیاب |
| User & Account | پروفایل، تنظیمات، حذف حساب | ❌ غیاب |
| Device | ثبت، فهرست، revocation دستگاه‌ها | ❌ غیاب |
| Session | conversations, messages sync | ❌ غیاب |
| AI Orchestrator | روتینگ درخواست به provider، مدیریت streaming | ⚠️ جزئی (محلی در دسکتاپ) |
| Provider Gateway | پروكسي امن به ارائه‌دهنده‌های خارجی | ❌ غیاب |
| Model Registry | فهرست مدل‌ها و قابلیت‌ها | ⚠️ موجود (provider-registry) |
| Credential Vault | ذخیره encrypt شده API keyها | ❌ غیاب |
| Credit Ledger | حساب況ти اعتبار، تراکنش‌ها | ❌ غیاب |
| Subscription | پلان‌ها، تمدید، پرداخت | ❌ غیاب |
| File Storage | آپلود فایل/میyدیا (S3-compatible) | ⚠️ جزئی (local FileStorage) |
| Collaborative Studio Orchestrator | اجرای agent 팀‌ها روی سرور | ❌ غیاب |
| Task Queue | صف کارهای طولانی (job) | ⚠️ جزئی (scheduler محلی) |
| Notification | push و اعلان‌های instantaneous | ❌ غیاب |
| Admin APIs | مدیریت کاربران، مدل‌ها، تعرفه‌ها،يزة‌ها | ❌ غیاب |
| Audit Logs | ثبت عملیات حساس | ❌ غیاب |
| Monitoring | متریک، health check، tracing | ❌ غیاب |

---

## ۹. همگام‌سازی چند دستگاه (Multi-Device Sync)

استراتژی **offline-first + delta sync:**

1. هر کلاینت (دسکتاپ/موبایل) یک نسخه-local از مکالمات و وضعیت دارد (SQLite).
2. هنگام تغییر، کلاینت یک **delta** (create/update/delete با timestamp) به backend می‌فرستد.
3. backend delta را به سایر دستگاه‌های آن کاربر توزیع می‌کند (WebSocket/SSE).
4. دستگاه‌های آفلاین در اولین اتصال، deltaهای From `last_checkpoint` را دریافت می‌کنند.
5. **Conflict resolution:** Last-Write-Wins برای پیام‌ها؛ برای Collaborative Studio، 충돌ها توسط Leader یا کاربر حل می‌شوند (`OutputConflict`).

سنانه‌های پیاده‌سازی‌شده (از فاز ۰):
-delta_batch IPC در دسکتاپ وجود دارد (commit `43c1d692b`) — الگو برای delta sync روی cloud.
- нет有一 Backend sync فعلاً — باید ساخته شود.

---

## ۱۰. Collaborative Studio روی موبایل و سرور

| المкурс | دسکتاپ (فعلی) | موبایل (پیشنهاد) | سرور (پیشنهاد) |
|---------|---------------|-------------------|-----------------|
| Leader decomposition | ✅ محلی | ✅ کلاینت یا سرور | ✅ سرور برای رن‌های بلند |
| Specialist execution | ✅ محلی | ⚠️ کوتاه‌مدت foreground | ✅ سرور (راه اصلی) |
| Tool permission gating | ✅卒 | ✅ native dialog | ✅ سرور (Approval API) |
| Shared context | ✅ lokal | ✅ Shared Core | ✅ persistent |
| Inter-agent messaging | ✅ lokal | ✅ WebSocket | ✅ persistent |
| Persistence | ✅ SQLite lokal | ✅ SQLite lokal + sync | ✅ دیتابیس backend |
| Streaming | ✅ IPC | ✅ WebSocket/SSE | ✅ SSE به کلاینت‌ها |

**نتیجه:** Collaborative Studio **به جزء اجرا-lengthی رن‌ها، نیاز به server-side ندارد** اما برای session continuity (ادامه رن از دستگاه دیگر) و job‌های طولانی، **server-side orchestrator** لازم است.

---

## ۱۱. اعتبار، پرداخت و اشتراک (Credits & Payments)

سيستم مالی **فقط سمت سرور** (مطابق دستور کار فاز ۰):

- `credit_ledger` یک‌قلم حسابрии — کلاینت فقط خواننده است.
- Daily free credits، purchased credits، subscription، usage tracking، model pricing، provider cost.
- **پرداخت:** Google Play Billing (Android)، Apple In-App Purchase (iOS)، پرداخت وب (برای المستقبل). پرداخت ریالی در بازار ایران نیاز به بررسی قوانین و gateway محلی دارد (UNKNOWN در فاز ۰؛ در فاز ۱ طراحی می‌شود).
- Idempotency برای تراکنش‌ها؛ fraud prevention در سطح backend.

---

## ۱۲. ساختار پیشنهادی مخزن (Repository Structure)

```text
AI1/
├── apps/
│   ├── desktop/          # Electron (موجود، بدون تغییر)
│   ├── android/          # React Native / Kotlin (جدید)
│   ├── ios/              # SwiftUI (جدید)
│   └── web/              # آینده
├── packages/
│   ├── ai-shared-core/   # جدید: kontrakتها، مدل داده، کلاینت sync، agent-protocol
│   ├── provider-registry/ # موجود (cross-platform)
│   ├── ai-core/          # موجود
│   ├── agent-team/       # موجود (pure types)
│   └── ui/               # موجود (@cherrystudio/ui — فقط دسکتاپ/وب)
├── backend/              # جدید: Modular Monolith
│   ├── api/              # REST + WebSocket
│   ├── auth/             # OAuth2/JWT
│   ├── orchestration/    # Agent runtime server-side
│   ├── providers/        # Provider gateway
│   ├── credits/          # Credit ledger
│   ├── sync/             # Conversation/device sync
│   └── admin/            # Admin APIs
├── infrastructure/       # جدید: Docker, CI/CD, monitoring
├── docs/
└── tests/
```

**دلیل حفظ ساختار فعلی:** جابه‌جایی فایل‌های دسکتاپ موجود هزینه بالا و ریسک دارد؛ فقط پکیج و اپلیکیشن‌های جدید اضافه می‌شوند.

---

## ۱۳. نقشه راه اجرایی (فاز ۱ تا ۳)

| فاز | هدف | خروجی قابل اندازه‌گیری |
|-----|-----|---------------------|
| **۱ — Architecture Design** | این مستند + kontrakتهای API + مدل امنیتی + مدل داده |ADR تایید شده، Swagger/OpenAPI schéma |
| **۲ — Backend Foundation** | Auth، Device، Conversation Sync، Credit Ledger، Provider Gateway | Backend MVP در staging، API 문서 |
| **۳ — Android Foundation** | پروژه موبایل، Design System، Auth، Chat، Model Selection | APK debug روی دستگاه |
| **۴ — iOS Foundation** | پروژه iOS، UI بومی، Auth، Chat، Model Selection | IPA روی simulateur |
| **۵ — AI Features** | Provider integration، streaming، file upload، voice | Feature complete |
| **۶ — Collaborative Studio** | Agent sessions، task monitoring، remote execution | Studio روی موبایل |
| **۷ — Credits & Payments** | Ledger، subscription، payment integration | Billing live |
| **۸ — Testing & Release** | Security، performance، device testing، beta، production | Release |

---

## ۱۴. ریسک‌ها و موانر (Risks & Blockers)

### ۱۴.۱ ریسک‌های فنی
1. **عدم وجود backend:** auth، sync، credit ledger وجود ندارند؛ باید از صفر ساخته شوند. (BLOCKER برای فاز ۲)
2. **اعتبarăی iOS background:** اجرای perpetual agent در background iOS امکان‌پذیر نیست. (باید در طراحیUUIDBA c為ผู้รับ clarify شود)
3. **مهاجرت native modules:** better-sqlite3، onnxruntime-node، mlx، tesseract، systeminformation فقط دسکتاپ هستند؛ نیاز به جایگزین موبایل یا cloud-side processing. (BLOCKER برای exported AI core محلی)
4. **Credential storage در موبایل:** نیاز به Keystore/Keychain correct implementation. (نیازمند تست امنیتی)

### ۱۴.۲ موانر حقوقی/تجاری
- Apple In-App Purchase و Google Play Billing شرایط و comission‌های خاص دارند.
- پرداخت ریالی در بازار ایران نیاز به gateway قانونی دارد.
- AGPL / licenses وابستگی‌ها نیاز به بررسی قانونی دارند (نکته ۲۵ فاز ۰).

---

## ۱۵.ověření: آیا Phase ۱ آماده اجرا است؟

| مورد | وضعیت | gesch floor |
|------|-------|-------------|
| گزارش فاز ۰ (READ-ONLY) | ✅ تکمیل شده | — |
| طراحی معماری (این مستند) | ✅ پیشنهادی | در انتظار تایید کاربر |
| контракт‌های API (Zod/OpenAPI) | ⏳ باید نوشته شود | در فاز ۱.۱ |
| مدل داده و migrations | ⏳ باید نوشته شود | در فاز ۱.۱ |
| مدل امنیتی و credential vault | ⏳ باید طراحی شود | در فاز ۱.۱ |

**اقدام بعدی پس از تایید:** ایجاد پکیج `packages/ai-shared-core/`, نوشتن Zod contracts، و تعریف مدل داده + migrations برای backend MVP.

---

> **نکته:** این مستند فقط **طراحی** است. هیچ فایل کد production تغییری نمی‌کند تا کاربر تایید صریح بدهد. هر تغییر در فاز ۱ باید از طریق **Pull Request** و **Agent Note** مطابق CLAUDE.md ثبت شود.