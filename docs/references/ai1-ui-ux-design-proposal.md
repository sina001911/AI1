# طرح UI/UX و معماری پیشنهادی AI1 — فاز یک

> **وضعیت:** پیشنهادی برای بررسی و تأیید کاربر (فاز یک). هیچ فایلی در این مرحله تغییر نکرده است. پیاده‌سازی تنها پس از تأیید شما در فاز دو شروع می‌شود.
> **پرو젝ت:** AI1 — D:\AI1 (branch `main`)، fork Cherry Studio.
> **स्टैक:** Electron 44.9.3 + React 19.2 + TanStack Router 1.170 + Tailwind CSS 4.3.3 + i18next (۱۶ Locale) + `@cherrystudio/ui` (Shadcn UI + Tailwind).
> **محدودیت‌های فعال:** تمام قابلیت‌های فعلی حفظ شوند؛ هیچ عدد/وضعیت/مدل ساختگی در داشبورد نمایش داده نشود؛ تصویر مرجع جهت‌گیری است نه کپی؛ RTL/LTR جامع؛ فایل‌های Modified و Untracked در git دست‌نخورده باقی بمانند.

---

## ۱.’arrière-cène: حالت فعلی (خلاصه wins فاز صفر)

| لایه | état فعلی | نتیجه برای فاز یک |
|------|-----------|-------------------|
| شال برنامه | `AppShell.tsx` + `Sidebar` چپ (ناوبری پویا بر اساس `SIDEBAR_APP_DEFINITIONS` در `src/renderer/utils/sidebar.ts`) + نوار تب به عنوان هدر استریپ | شال حفظ می‌شود؛ فقط هدر یکپارچه (Topbar) اضافه می‌شود |
| مسیرها | TanStack file-based: `routes/__root.tsx`、`routes/app.tsx` (Outlet)، ۱۶ مسیر تحت `/app` + مسیرهای `/settings` | مسیرهای فعلی حفظ می‌شوند؛ مسیر `/app/home` برای داشبورد جدید اضافه می‌شود |
| کتابخانه UI | `@cherrystudio/ui`: primitives (Button, Card, Badge, Avatar, Spinner, Skeleton, CircularProgress, IndicatorLight, Table, Tabs, Select, Input, Dialog, Popover, DropdownMenu, Tooltip, Scrollbar…) و composites (EmptyState, PageHeader, PageSidePanel, DataTable, SearchInput, MenuList, ReorderableList, Sortable, TreeView, Flex, Form, ImagePreview, Markdown, CodeEditor…) | verwendete بدون تغییر؛ composite‌های داشبورد جدید (StatTile, FeatureCard, …) بر همین primitive‌ها ساخته می‌شود |
| توکن‌های طراحی | `packages/ui/src/styles/tokens/`: `colors/primitive.css`، `colors/providers.css`، `colors/a1.css` (브ند AI1: midnight/슬ایتی،電机 آبی، بنفش، سرخ)، `gradients.css`، `glass.css`، `typography.css`، `spacing.css`، `radius.css`؛ `product.css` استفاده از `--a1-surface`، `--a1-gradient-*`، `--chat-message-well` | توکن‌های AI1 وجود دارند؛ لایه semantic برای داشبورد/Topbar در `product.css` تکمیل می‌شود |
| RTL / فارسی | `dir="rtl"` فقط برای `fa-IR` در `useWindowRuntime.ts:64-68`؛ هیچ logical-properties CSS و hook هم‌جهتnessی وجود ندارد؛ `fa-ir.json` تنها ۲۰/۶۳۹۰ کلید ترجمه‌شده | برنامه جامع RTL/LTR با logical-properties و `rtl:` variantes Tailwind |
| صفحات ۱۱ بخش درخواستی | ۶ مورد وجود دارد (چت، مدل‌ها/فرایندها، استودیو همکاری، ایجنت‌ها، تصویر، ویدیو، تنظیمات); ۳ مورد غائب: داشبورد Home، Media Tools، Prompts Library | ۳ صفحه جدید + داشبورد؛ بقیه حفظ و بازبینی되지 |

---

## ۲. اصول shepherding طرح (مستمد از constraints شما)

1. **هویت مستقل AI1:** پالت midnight/슬ایتی +電机 آبی + بنفش + نورهای ملایم (glow)، بدون کپی‌پیست ظاهر Cherry Studio.
2. **داده واقعی:** هر کارت/ویجت داشبورد به سرویس واقعی (DataApi SQLite، provider catalog، window manager، …) متصل است؛ هیچ عدد ساختگی.
3. **حفظ تمام قابلیت‌ها:** مسیرها، سرویس‌ها، IPC route‌ها و تست‌های فعلی تغییر نمی‌کنند؛ فقط لایه UIView اضافه/تغییر می‌یابد.
4. **سurgical change:** touching فقط آنچه مورد نیاز است؛ dead code قبلی حذف نمی‌شود.
5. **RTL/LTR جامع:** فارسی (RTL) و انگلیسی (LTR) در سطح کل برنامه، نه چند عنصر.
6. **Responsive:** grid/drawer با breakpoints Tailwind، collapse-sidebar در عرض کوچک.

---

## ۳. سیستم طراحی اختصاصی AI1 و Design Tokens

### ۳.۱ لایه توکن‌ها (بر اساس موجودی واقعی در `packages/ui/src/styles/tokens/`)

| domen | متغیر | مقدار/منبع | کاربرد |
|-------|-------|-----------|---------|
| Background عمیق | `--a1-midnight` | `oklch(0.13 0.012 252)` | صفحه-γ랜드 داشبورد و canvas |
| Background نرم | `--a1-midnight-soft` | `oklch(0.17 0.014 252)` | سطح elevado |
| Brand primary | `--a1-electric-500` | `oklch(0.52 0.19 246)` | akcje primer، آيكون‌های فعال |
| Brand glow | `--a1-electric-600` | `oklch(0.44 0.18 248)` | سایه مدほو (a1-shadow-glow) |
| ثانویه (بنفش) | `--a1-violet-600` | `oklch(0.46 0.18 296)` | حالت Collaborative Studio |
| Cyan | `--a1-cyan-600` | `oklch(0.46 0.15 198)` | AI Media / عکس و ویدیو |
| ارنج accents | `--a1-orange-600` | `oklch(0.56 0.16 54)` | اخطار/وضعیت |
| Foreground | `--a1-foreground` | `oklch(0.95 0.008 248)` | متن اصلی روی تیره |
| Muted foreground | `--a1-foreground-muted` | `oklch(0.72 0.01 250)` | متادیتای کم‌رنگ |
| Border | `--a1-border` | `oklch(0.26 0.012 252)` | خط‌های باز کردن کارت |
| Border强 | `--a1-border-strong` | `oklch(0.36 0.014 252)` | خط-selected/فعال |
| Gradients | `--a1-gradient-ribbon` و … | `linear-gradient(135deg, …)` | hero، logo، ribbonهای استودیو |
| Glass | `--a1-glass-bg` / `--a1-glass-border` | oklch alpha + backdrop-filter 18px | کارت‌های شفاف داشبورد |
| Shadows | `--a1-shadow-sm/md/lg` | oklch shadow |depth کارت‌ها |
| Motion | `MOTION_DURATION` (fast/base/md/slow/xslow) | `motion.ts` در ui package | انیمیشن ظریف، honoring `prefers-reduced-motion` |

### ۳.۲ قوانین استفاده از توکن (طبق `design-token-system.md` و `variable-catalog.md`)

- از شادcn الرسمي roles (`--background`, `--card`, `--primary`, …) وقتیIntent مطابق است استفاده می‌کنیم.
- توکن‌های product AI1 ( `--a1-*` ) فقط در `product.css` یا stylesheet/page-local می‌شوند؛ هرگز hard-coded hex در JSX.
- `--color-*` (تولید Tailwind) در کد نوشته نشده؛ فقط semantic utilities (`bg-a1-surface` و غیره از طریق kontrakt).
- هر متغیر جدید نیاز به ثبت در `CHERRY_PRODUCT_VARIABLE_TOKENS` و validator `theme:check` دارد.

### ۳.۳ Compositeهای داشبورد (ساخت بر پایه `@cherrystudio/ui`)

| Composite | محتوای بر پایهٔ primitive | جایگاه استفاده |
|-----------|---------------------------|-----------------|
| `StatTile` | Card + Badge + IndicatorLight + Text | System Status (All Systems Online, Connected Models, Active Agents, Uptime) |
| `FeatureCard` | Card + Avatar/Icon + Title + Subtitle + Arrow | ۵ کارت اصلی داشبورد (AI Chat, Collaborative Studio, AI Media, AI Agents, Build & Innovate) |
| `RecentConversationList` | VirtualList + Item + Avatar + Timestamp | Recent Conversations (موضوعات واقعی از DataApi) |
| `ModelChip` | Badge + Avatar + Text | Popular Models (مدل‌های واقعی از provider catalog) |
| `EmptyState` | EmptyState composite | صفحه‌های بدون محتوا |

---

## ۴. معماری Topbar و Layout

### ۴.۱ لایه‌بندی Layout (بدون تغییر شال)

```
<AppShell> (تغییر نشده)
  ├── <Sidebar> (تغییر نشده؛ استراتژی دیتا-درایو حفظ می‌شود)
  │     └── ورودی‌های ناوبری: Home Dashboard, AI Chat, … (بخش ۵)
  └── <contentColumn>
        ├── <AppShellTabBar> → جایگزین می‌شود با <UnifiedTopbar>
        │     ├── جستجوی سراسری (Ctrl+K) → GlobalSearchPopup (تغییر نشده)
        │     ├── نوتیفیکیشنベル (جدید؛ پیام‌های 실시간 از window manager)
        │     ├── آواتار + منوی کاربری (UserAccountPanel — موجود در SidebarFooter، به Topbar منتقل می‌شود)
        │     ├── تم-toggle (AppearanceMenu — موجود، به Topbar منتقل می‌شود)
        │     └── کنترل پنجره (min/max/close — از WindowControls)
        └── <main data-ui="app.content"> (page routes — تغییر نمی‌شود)
```

### ۴.۲ مكونات Topbar

| رده | مقصد | پیاده‌سازی |
|-----|-------|------------|
| Left |Logo A1 + نام برنامه + breadcrumb/path | `AppLogo` (موجود در `components/brand/AppLogo.tsx`) + breadcrumb mới |
| Center | جستجوی سراسری (Ctrl+K) | دکمه موجود `GlobalSearchPopup.show()` با `CommandTooltip` |
| Right | نوتیفیکیشن، آواتار، تم، کنترل پنجره | `NotificationBell` (جدید)، `UserAvatar` + `Popover` → `UserAccountPanel`، `AppearanceMenu`، `WindowControls` |

**نکته:** `Navbar.tsx` در حالت فعلی `() => null` رندر می‌کند و فقط容器ها DOM دارند. Topbar جدید اینContainerها را پر می‌کند و `Navbar` اصلی_null_ می‌ماند (بدون اشکال).

### ۴.۳ صفحه محتوای هر مسیر

هر مسیر تحت `/app` داخل `<TabRouter>` + `<Activity>` (keep-alive) رندر می‌شود — این مکانیزم حفظ می‌شود. فقط صفحه `/app/home` جدید اضافه می‌شود و مسیرهای قبلی (`/app/chat`, `/app/studio`, …) تغییری نمی‌کنند.

---

## ۵. ساختار نهایی Sidebar و Navigation

منبع پایان: `src/renderer/utils/sidebar.ts` (`SIDEBAR_APP_DEFINITIONS` + `SIDEBAR_FAVORITE_ORDER` + آیکون‌ها در `components/app/sidebarIcons.tsx`). این فایل تغییر نمی‌کند؛ فقطordered لیست ورودی‌ها درPreferences (`ui.sidebar_shortcut`) erweit می‌شود.

### ۵.۱ فهرست نهایی ورودی‌های Sidebar (مرتب)

| ترتیب | شناسه | برچسب (i18n) | مسیر | آیکون (lucide) |Notes |
|------|-------|--------------|------|----------------|------|
| 1 | `home_dashboard` | داشبورد اصلی | `/app/home` | LayoutGrid (جدید) | صفحه داشبورد جدید |
| 2 | `assistants` | چت هوش مصنوعی | `/app/chat` | MessageSquare | همان HomePage فعلی |
| 3 | `models_providers` | مدل‌ها و ارائه‌دهندگان | `/settings/provider` | Database (جدید) | تنظیمات vorhand |
| 4 | `studio` | استودیو همکاری | `/app/studio` | Users | Collaborative Studio (حفظ کامل) |
| 5 | `agents` | ایجنت‌های هوش مصنوعی | `/app/agents` | MousePointerClick | AI Agents (حفظ کامل) |
| 6 | `paintings` | تولید تصویر | `/app/paintings` | Palette | Image Generation (حفظ کامل) |
| 7 | `creative_lab` | تولید ویدیو | `/app/creative-lab` | Sparkles | Video Generation (حفظ کامل) |
| 8 | `media_tools` | ابزار رسانه‌ای | `/app/media-tools` | FileText (جدید) | Media Tools (جدید) |
| 9 | `prompts_library` | کتابخانه پرامپت | `/app/prompts` | FileSearch (جدید) | Prompts Library (جدید) |
| 10 | `history` | تاریخچه گفتگو | `/app/chat?history` (یا `/app/history`) | Clock (جدید) | Conversation History |
| 11 | `personalization` | تنظیمات و شخصی‌سازی | `/settings` (و `/app/personalization`) | Settings | Settings & Personalization |
| 12+ | `translate`, `files`, `notes`, `workflows`, `code_tools`, `knowledge`, `mini_app`, `explore` | بقیه برنامه‌ها | مسیرهای فعلی | آیکون‌های فعلی | بدون تغییر |

**تغییرات نسبت به قبل:**
- افزودن ۴ ورودی جدید: `home_dashboard`، `models_providers`، `media_tools`، `prompts_library`، `history` (در واقع `history` به عنوان نمایشگر جدید، اما مسیر چت حفظ می‌شود؛ می‌توان یک نمایش تاریخچه داخل چت یا مسیر/table جدید ایجاد کرد).
- `personalization` از حالت unwired خارج می‌شود و مسیر `/app/personalization` به Route Tree اضافه می‌شود (مطابق constraint «تنظیمات و شخصی‌سازی»).

**فعال‌سازی (Active state):** `resolveSidebarActiveItem(url)` در همان فایل `sidebar.ts` preserve می‌شود؛ Prefix matching برای مسیرهای جدید اضافه می‌شود (`/app/home`, `/app/media-tools`, `/app/prompts`).

---

## ۶. طراحی داشبورد Home

داشبورد در مسیر `/app/home` رندر می‌شود (صفحه جداگانه، نه همان `HomePage` چت). ترکیبی از:

### ۶.۱ بخش‌های داشبورد

| بخش |окомпонент | منبع داده واقعی |veb |
|-----|-----------|-----------------|----|
| Hero (برند A1) | `--a1-gradient-cosmos` backdrop +-gradient-text | ثابت (برند) | نوآوری،ไม่ عدد |
| Popular Models | ModelChip grid | Provider catalog (service موجود) | مدل‌های واقعی با ارائه‌دهنده |
| Recent Conversations | RecentConversationList | DataApi / topic source (موضوعات چت موجود) | موضوعات واقعی، Timestamp |
| System Status | StatTile × 4 | Window manager + services health (ب넓اً) | All Systems Online, Connected Models, Active Agents, Uptime |
| Quick Actions | FeatureCard grid | مسیرهای اصلی (چت، استودیو، ایجنت، تصویر، ویدیو) | ناوبری سریع |

### ۶.۲ قوانین داده واقعی (constraint 3)

- **Popular Models:** لیست مدل‌ها از `useModels()` / provider registry می‌آید (همان هک که CreativeLabPage و DataAnalystPage از آن استفاده می‌کنند).
- **Recent Conversations:** موضوعات از `useAssistantTopicsSource()` / DataApi می‌آیند (همان منابع `Topics.tsx` در چت).
- **System Status:** 
  - `All Systems Online`: وضعیت سرویس‌های cycle از lifecycle container (`application.get('…')`) — هر کدام که started باشند.
  - `Connected Models`: تعداد مدل‌های فعال از provider catalog.
  - `Active Agents`: تعداد ایجنت‌های فعال از agent service.
  - `Uptime`: زمان اجرایpplication (process uptime از Node / IPC).
- هر مورد که منبع واقعی ندارد، **نمایش داده نمی‌شود** (EmptyState یا ناپدید، نه عدد placedholder).

---

## ۷. صفحات جدید (Media Tools و Prompts Library)

### ۷.۱ Media Tools — `/app/media-tools`

قبل از طراحی، امکانات موجود بررسی می‌شود (مطابق constraint 4):

| قابلیت مورد نیاز | وجود در کدBase | Entscheidung |
|------------------|----------------|-------------|
| پیش‌نمایش فایل تصویر/ویدیو | `pages/filePreview/` + `FilePreviewPage` | tái استفاده |
| تبدیل/ترکیب رسانه | بررسی در فاز دو (ffmpeg/وградание) | اگر وجود ندارد → فقط نمایش لیست فایل‌های رسانه‌ای |
| نمایش galery تصاویر تولید شده | `pages/paintings/` + `PaintingStrip` | tái استفاده |

**طرح:** صفحه‌ای با دو标籤 (تصاویر تولید‌شده / ویدیوها)، هر کدام لیست واقعی از `Paintings` / Video generation outputs با preview، فیلتر و acquire action. هیچ number ساختگی نیست.

### ۷.۲ Prompts Library — `/app/prompts`

| قابلیت مورد نیاز | وجود در کدBase | Entscheidung |
|------------------|----------------|-------------|
| ذخیره پرامپت | `pages/knowledge/` (RAG knowledge bases) —near است، نه پرامپت خالص | بررسی در فاز دو؛ اگر دیتابیس پرامپت وجود ندارد، DataApi/table جدید (جدا از UI) |
| جستجوی پرامپت | `GlobalSearch` | reused |
| درج پرامپت در چت | `chat.composer` | reused |

**طرح:** کتابخانه پرامپت با دسته‌بندی، جستجو، و دکمه «استفاده در چت» که محتوای پرامپت را به composer چت می‌فرستد. اتصال به دیتابیس پرامپت در فاز دو تایید می‌شود.

---

## ۸. Collaborative Studio (נקודת تمایز — حفظ کامل)

مسیر `/app/studio` و تمام زیرکامپوننت‌های آن (`StudioPage.tsx`, `ApprovalQueue`, `InterAgentFeed`, `RunWorkspace`, `TeamFormDialog`, …) **بدون تغییر** می‌مunden. در طرح جدید فقط:
- ویجت استودیو در داشبورد به مسیر `/app/studio` ارجاع می‌دهد (لینک، نه بازنویسی).
- وضعیت ایجنت‌ها در System Status از همان سرویس ایجنت llega (عدد واقعی).
- هیچリオструктурированиз لایه Collaboration نمی‌شود.

---

## ۹. برنامه جامع RTL/LTR

### ۹.۱ لایه جهت (Direction)

| مقصد | پیاده‌سازی | فایل |
|-------|------------|------|
| شناخت زبان RTL | `language === 'fa-IR'` → `dir="rtl"` بر روی `<html>` | `useWindowRuntime.ts:64-68` ( حفظ می‌شود، generalized می‌شود) |
| پشتیبانی LTR | بقیه زبان‌ها `dir="ltr"` | همان فایل |
| هم‌جهتness CSS | logical-properties (`margin-inline`, `padding-inline`, `text-align: start/end`, `border-inline-start`, …) به جای left/right | درstylesheet‌های جدید و مقتضی |
| Tailwind mirroring | `rtl:` variantes (مثلاً `rtl:rotate-180` که فعلاً وجود دارد) حيث لازم است | Tailwind v4 |
| منوهای شناور (dropdown/popover) | placement mirror خودکار در RTL ( popover `side`flip ) | `@cherrystudio/ui` popover/dropdown-menu |
| نوار کناری | در RTL سمت راست، mirroredentries | `Sidebar` با `dir` ارث بری |

### ۹.۲ rispose فونت و копи

- فونت بدنه برای فارسی: Family readable (در `typography.css` فعلی Inter است؛ برای فارسی fallback مناسب در `font.css` تعریف می‌شود).
-方向 إيعاز: `document.documentElement.lang` از `language` preference (فعلاً در `ThemeProvider.tsx:62`) — حفظ می‌شود.

### ۹.۳ unavoidable hard-coded dir

- `dir="auto"` روی composer textarea (`ComposerSurface.tsx:343`) و `dir="ltr"` روی history dialog (`BrowserHistoryDialog.tsx:229`) **حفظ می‌شوند** (معنایی دارند، نمی‌توانند generalized شوند).

### ۹.۴ checklist پذیرش RTL
- [ ] `<html dir="rtl">` در fa-IR و `dir="ltr"` در en-us
- [ ] sidebar در راستی راست باز می‌شود (mirror)
- [ ] منوها و popover در راستی قرار می‌گیرند
- [ ] عدد و تاریخ در فارسی صحیح نمایش داده می‌شود (dayjs locale sync از `useWindowRuntime`)
- [ ] هیچ شکست Layout در LTR ⇄ RTL تغییر زبان

---

## ۱۰. نقشه اتصال هر کامپوننت به داده‌ها و قابلیت‌های واقعی

| لایه UIView | Destination داده | مکانیزم واقعی |
|-------------|----------------|---------------|
| StatTile System Status | `application.get('…')` services + IPC `system.*` | lifecycle container + ipcApi |
| Popular Models | provider catalog | `useModels()` / `@renderer/hooks/useModel` |
| Recent Conversations | topic source | `useAssistantTopicsSource()` / DataApi SQLite |
| FeatureCardها | مسیرهای اصلی | TanStack `navigate` (مسیرهای موجود) |
| Media Tools | فایل‌های رسانه‌ای | `FilePreview` + painting/video outputs |
| Prompts Library | دیتابیس پرامپت (فاز دو) | DataApi endpoint (تایید در فاز دو) |
| Collaborative Studio | ایجنت/اجازduled tasks | سرویس‌های فعلی (بدون تغییر) |

س구의ه: هیچ کامپوننت داشبورد با داده synthetic/place-holder ساخته نمی‌شود.

---

## ۱۱. نقشه مهاجرت از UI فعلی به UI جدید (بدون حذف قابلیت)

مرحله‌ای و reversible:

1. **مرحله الف — توکن‌ها (فاز دو.۱):** اضافه کردن semantic product tokens برای داشبورد/Topbar در `product.css` (تنظیم `--a1-*` فعلی حفظ می‌شود؛ فقط complementary اضافه می‌شود). هیچ competing color حذف نمی‌شود.
2. **مرحله ب — Topbar (فاز دو.۲):** UnifiedTopbar در `AppShell` جایگزین `AppShellTabBar`/خالی Navbar می‌شود. مسیرهای `/app/*` تغییری نمی‌کنند.
3. **مرحله ج — داشبورد Home (فاز دو.۳):** مسیر `/app/home` + routed. Sidebar ورودی `home_dashboard` اضافه می‌شود.
4. **مرحله د — صفحات جدید (فاز دو.۴):** `/app/media-tools` و `/app/prompts`؛ ورودی‌های Sidebar.
5. **مرحله ه — تاریخچه گفتگو (فاز دو.۵):** نمایش/table تاریخچه؛ مسیر `/app/history` یا View در چت.
6. **مرحله و — RTL/LTR بهینه‌سازی (فاز دو.۶):** logical-properties، dir generalize، فونت فارسی.
7. **مرحله ز — تست و پذیرش (فاز سه):** immigration از constraint.

هر مرحله مستقیماً به مسیر/view فعلی ارجاع می‌دهد؛ هیچ Route یا IPC حذف نمی‌شود.

---

## ۱۲. برنامه تست و معیارهای پذیرش (فاز سه)

| نوع تست | cmd (scoped، طبق CLAUDE.md) | مقصد |
|--------|---------------------------|-------|
| typecheck | `pnpm typecheck` | هیچ خطای نوع جدید |
| lint | `pnpm exec oxlint --fix <changed files>` + eslint | لا هشدار جدید |
| i18n check | `pnpm i18n:check` (برای فایل‌های Locale تغییر کرده) | هیچ placeholder خالی/فاصله‌ัง |
| تست رندرر | `pnpm test:renderer <test-file>` برای فایل‌های تغییر کرده + تست‌های مربوط به داشبورد/ستون‌ها/Topbar | پرفورمنس و‌ regression |
| RTL visual | باز شدن app در `fa-IR` و `en-us` + screenshot/inspect |dir، mirrored layout، فونت |
| Responsive | resize window به ابعاد مختلف (mobile/tablet/desktop) | grid collapse، sidebar drawer |
| داده واقعی | باز کردن داشبورد و مقایسه اعداد با منبع واقعی (services health، provider catalog) | لا عدد ساختگی |
| Regression موجود | تست‌های فعلی agents/studio/paintings و غیره (بدون تغییر) | حفظ تمام قابلیت‌ها |

**معیار پذیرش نهایی:**
- داشبورد Home فقط اعداد/وضعیت real نشان می‌دهد.
- تمام ۱۱ بخش درخواستی قابل دسترس است (۶ مورد موجود + ۵ مورد جدید/تکمیل‌شده).
- RTL در fa-IR و LTR در en-us در تمام صفحات کار می‌کند.
- هیچ فایل Modified/Untracked در git دست‌نخورده باقی نمی‌ماند بدون تأیید جداگانه.
- هویت بصری AI1 (midnight +電机 + بنفش + glow) در داشبورد و Topbar مشخص است.

---

## ۱۳. فایل‌های کلی که در فاز دو toucher می‌شوند (پیش‌بینی)

- `src/renderer/components/layout/AppShell.tsx` — اضافه کردن UnifiedTopbar
- `src/renderer/components/layout/UnifiedTopbar.tsx` (جدید)
- `src/renderer/components/layout/AppShellTabBar.tsx` (تغییر جزئی یا جایگزینی)
- `src/renderer/utils/sidebar.ts` — افزودن routePrefixهای جدید (`home_dashboard`, `media_tools`, `prompts_library`, `history`)
- `src/renderer/components/app/sidebarIcons.tsx` — آیکون‌های جدید
- `src/renderer/pages/home/HomeDashboardPage.tsx` (جدید)
- `src/renderer/pages/media-tools/` (جدید)
- `src/renderer/pages/prompts/` (جدید)
- `src/renderer/routes/app/home.tsx` (جدید)
- `src/renderer/routes/app/media-tools.tsx` (جدید)
- `src/renderer/routes/app/prompts.tsx` (جدید)
- `src/renderer/i18n/locales/fa-ir.json` + `en-us.json` — کلیدهای جدید (فقط کلید، ترجمه در i18n:sync)
- `packages/ui/src/styles/product.css` — product tokens داشبورد/Topbar

**هیچ‌یک از این فایل‌ها در این مرحله تغییر نمی‌کنند.**

---

**مرحله بعدی:** پس از تأیید شما، وارد فاز دو (پیاده‌سازی مرحله‌ای) می‌شویم؛ هر تغییر کد با conventional commit + DCO sign-off و تست scoped انجام می‌شود.

---

**آیا این طرح فاز یک را تأیید می‌کنید تا وارد فاز دو (پیاده‌سازی) شوم؟**  
[تأیید — شروع فاز دو] [نظر/تغییر در مورد طرح]
