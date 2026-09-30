# landing-starter

قالب شروع لندینگ‌های اسکرول‌سینمایی (دنباله فریم از ویدیوی AI که با اسکرول جلو می‌رود).
هر لندینگ یک مخزن جداست که از این قالب ساخته می‌شود و با GitHub Pages از ریشه منتشر می‌شود.

## محتوا
- `shared/`: موتور اسکرول (`js/scroll-engine.js`)، `css/base.css`، فرم واتساپ (`js/lead-form.js`)، تب‌ها، مقایسه قبل/بعد، GSAP 3.15 و Lenis 1.3 (بدون CDN)، فونت‌های OFL.
- `tools/extract-frames.sh`: ویدیو به فریم (AVIF یا WebP) و `manifest.json`. نسخه لینوکس. `extract-frames.ps1` نسخه ویندوز است.
- `tools/cover.py`: ردیابی و پوشاندن تابلو یا چهره خراب در فریم‌ها.
- `reference/hermes/` و `reference/paul/`: دو لندینگ قبلی، فقط کد، به‌عنوان مرجع سطح ظاهر. مسیرهای داخلشان `../shared/` است.
- `LESSONS.md`: روال کار و درس‌های پروژه قبلی.

## ساختار هر لندینگ
```
index.html  style.css  app.js
frames/     (خروجی extract-frames.sh؛ داخل مخزن می‌ماند)
shared/
source/     (مرجع‌ها و ویدیوهایی که کاربر آپلود می‌کند)
prompts/<slug>.md
PROGRESS.md
```
