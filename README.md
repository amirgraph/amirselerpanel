# 🛡️ XUI Reseller Panel

پنل نمایندگی حرفه‌ای برای 3X-UI با رابط کاربری تاریک و شیشه‌ای

---

## ✨ قابلیت‌ها

### پنل ادمین
- مدیریت نمایندگان (ساخت، ویرایش، حذف)
- تنظیم حجم ترافیک و تعداد کاربر برای هر نماینده
- شارژ کیف پول نمایندگان
- مشاهده همه کاربران
- همگام‌سازی اینباندها از 3X-UI
- آمار و گزارش کامل

### پنل نماینده
- ساخت کاربر با انتخاب اینباند مشخص
- محدودیت ترافیک، IP، و تاریخ انقضا
- قطع و وصل کاربر لحظه‌ای
- حذف کاربر با برگشت حجم باقی‌مانده
- لینک سابسکریپشن اختصاصی
- آمار مصرف لحظه‌ای
- **White-Label**: تنظیم نام، لوگو، و رنگ برند

### فنی
- همگام‌سازی مصرف هر ۵ دقیقه
- بررسی انقضا هر ساعت
- بدون باگ کم‌شدن حجم بعد از حذف
- رابط کاربری ریسپانسیو (موبایل + دسکتاپ)

---

## 🚀 نصب سریع

```bash
git clone https://github.com/YOUR_USERNAME/xui-reseller.git
cd xui-reseller
chmod +x install.sh
sudo bash install.sh
```

---

## ⚙️ تنظیمات دستی

```bash
cp .env.example .env
nano .env
```

```env
PORT=3000
JWT_SECRET=random_string_min_32_chars
XUI_URL=https://YOUR_SERVER_IP:PORT
XUI_PATH=/YOUR_SECRET_PATH
XUI_USERNAME=admin
XUI_PASSWORD=your_password
TELEGRAM_BOT_TOKEN=your_bot_token
ADMIN_TELEGRAM_ID=your_telegram_id
SUB_BASE_URL=http://YOUR_SERVER_IP:3000/sub
```

---

## 📂 ساختار فایل‌ها

```
xui-reseller/
├── src/
│   ├── server.js          # سرور اصلی
│   ├── models/
│   │   └── database.js    # پایگاه داده SQLite
│   ├── routes/
│   │   ├── auth.js        # احراز هویت
│   │   ├── admin.js       # روت‌های ادمین
│   │   ├── reseller.js    # روت‌های نماینده
│   │   └── sub.js         # سابسکریپشن
│   ├── services/
│   │   ├── xuiService.js  # اتصال به 3X-UI API
│   │   └── syncService.js # همگام‌سازی ترافیک
│   └── middleware/
│       └── auth.js        # JWT middleware
├── public/
│   ├── admin/index.html   # پنل ادمین
│   └── reseller/index.html # پنل نماینده
├── data/                  # دیتابیس SQLite
├── .env.example
├── install.sh
└── package.json
```

---

## 🔗 آدرس‌ها

| مسیر | توضیح |
|------|-------|
| `/admin` | پنل ادمین |
| `/panel` | پنل نماینده |
| `/sub/:uuid` | لینک سابسکریپشن کاربر |

---

## 📱 ربات تلگرام

ربات در فاز بعدی اضافه میشه.

---

## 🔧 مدیریت سرویس

```bash
pm2 status                    # وضعیت
pm2 logs xui-reseller         # لاگ‌ها
pm2 restart xui-reseller      # ری‌استارت
pm2 stop xui-reseller         # توقف
```

---

## ⚠️ نکات مهم

1. بعد از نصب **حتماً** پسورد ادمین رو عوض کن
2. اول از پنل ادمین، اینباندها رو همگام‌سازی کن
3. برای هر نماینده اینباندهای مجاز رو تنظیم کن
4. پورت `3000` رو در فایروال باز کن
