# pidbir-aromatu (Telegram bot)

## What it does
- Admin/User split menus
- Admin manages sellers/admins via admins.json / users.json
- Sellers get access by sharing their phone contact (tg_id auto-attaches)
- Perfume pick chat-mode searches ONLY inside perfumes_filtered.sqlite (read-only)

## Local run
1) Put your DB here: `./data/perfumes_filtered.sqlite`
2) Create `.env` from `.env.example`
3) `npm i`
4) `npm start`

## Render run (recommended)
- Mount Disk at `/var/data`
- Upload/move:
  - `/var/data/perfumes_filtered.sqlite`
  - `/var/data/admins.json`
  - `/var/data/users.json`
- Set env:
  - DB_PATH=/var/data/perfumes_filtered.sqlite
  - ADMINS_PATH=/var/data/admins.json
  - USERS_PATH=/var/data/users.json

## Root admin
- Root admin tg_id is set in `data/admins.json` (188025222).
- Use /myid command to view tg_id for any account.
