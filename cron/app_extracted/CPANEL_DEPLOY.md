# cPanel Deployment Guide

## Folder Structure on cPanel

Upload karne ke baad server pe structure aisa hoga:

```
/home/username/
├── public_html/          ← sirf public/ ka content yahan aayega
│   ├── index.php         ← modified (neeche dekho)
│   ├── .htaccess
│   └── ...
└── cron_app/             ← baaki saari files yahan (public_html ke bahar)
    ├── app/
    ├── bootstrap/
    ├── config/
    ├── database/
    ├── resources/
    ├── routes/
    ├── storage/
    ├── vendor/
    ├── .env
    └── ...
```

---

## Step-by-Step Upload

### 1. Files Upload karo

**Option A — File Manager se:**
- `public/` folder ka content → `public_html/` mein upload karo
- Baaki sab (app, bootstrap, config, database, resources, routes, storage, vendor, .env etc.) → `public_html` ke bahar ek folder mein (e.g. `cron_app/`)

**Option B — Full project ek jagah upload karo:**
- Poora project `public_html/cron_app/` mein upload karo
- `public_html/` mein sirf `index.php` aur `.htaccess` rakho (modified)

---

### 2. `public_html/index.php` modify karo

Paths apne server structure ke hisaab se change karo:

```php
<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

if (file_exists($maintenance = __DIR__.'/../cron_app/storage/framework/maintenance.php')) {
    require $maintenance;
}

require __DIR__.'/../cron_app/vendor/autoload.php';

$app = require_once __DIR__.'/../cron_app/bootstrap/app.php';

$app->handleRequest(Request::capture());
```

---

### 3. `.env` file banao

- `.env.cpanel` file ko copy karke `.env` naam do
- cPanel ke MySQL credentials fill karo:

```
DB_HOST=localhost
DB_DATABASE=yourusername_dbname
DB_USERNAME=yourusername_dbuser
DB_PASSWORD=yourpassword
APP_URL=https://yourdomain.com
APP_ENV=production
APP_DEBUG=false
```

---

### 4. cPanel MySQL Database banao

cPanel → MySQL Databases:
1. New database create karo (e.g. `myuser_cron`)
2. New user create karo (e.g. `myuser_cronuser`)
3. User ko database pe **All Privileges** do

---

### 5. Terminal / SSH se commands chalaao

```bash
cd ~/cron_app

# App key generate karo
php artisan key:generate

# Migrations run karo
php artisan migrate --force

# Admin user seed karo
php artisan db:seed --force

# Cache clear karo
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Storage link
php artisan storage:link
```

---

### 6. Storage permissions fix karo

```bash
chmod -R 775 ~/cron_app/storage
chmod -R 775 ~/cron_app/bootstrap/cache
```

---

### 7. Cron Job cPanel mein lagao

cPanel → **Cron Jobs** section:

```
* * * * * /usr/local/bin/php /home/username/cron_app/artisan schedule:run >> /dev/null 2>&1
```

> `username` apna cPanel username se replace karo
> PHP path check karne ke liye terminal mein `which php` run karo

---

### 8. `.htaccess` check karo `public_html/` mein

```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteRule ^(.*)$ public/$1 [L]
</IfModule>
```

Ya agar `public/` content directly `public_html/` mein hai to default `.htaccess` kaam karega.

---

## Common Errors & Fixes

| Error | Fix |
|-------|-----|
| 500 Error | `APP_DEBUG=true` karo temporarily, error dekho |
| Class not found | `composer dump-autoload` run karo |
| Permission denied | `chmod -R 775 storage bootstrap/cache` |
| DB Connection failed | `.env` mein DB credentials check karo |
| White screen | `storage/logs/laravel.log` check karo |
