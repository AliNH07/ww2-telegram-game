import asyncio
import logging
import os

from aiohttp import web

from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart
from aiogram.types import (
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
)

from config import BOT_TOKEN


# ---------------------------------------
# Logging
# ---------------------------------------

logging.basicConfig(level=logging.INFO)


# ---------------------------------------
# Telegram Bot
# ---------------------------------------

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


# ---------------------------------------
# اطلاعات موقت بازیکنان
# ---------------------------------------

players = {}


# ---------------------------------------
# کشورهای بازی
# ---------------------------------------

COUNTRIES = {
    "germany": {
        "name": "🇩🇪 آلمان",
        "economy": 850,
        "army": 900,
        "population": 80000000,
    },

    "britain": {
        "name": "🇬🇧 بریتانیا",
        "economy": 800,
        "army": 700,
        "population": 47000000,
    },

    "ussr": {
        "name": "🇷🇺 شوروی",
        "economy": 750,
        "army": 950,
        "population": 170000000,
    },

    "usa": {
        "name": "🇺🇸 آمریکا",
        "economy": 1000,
        "army": 600,
        "population": 130000000,
    },

    "france": {
        "name": "🇫🇷 فرانسه",
        "economy": 700,
        "army": 650,
        "population": 42000000,
    },

    "italy": {
        "name": "🇮🇹 ایتالیا",
        "economy": 600,
        "army": 500,
        "population": 44000000,
    },
}


# ---------------------------------------
# اخبار اولیه
# ---------------------------------------

NEWS = [
    {
        "country": "🌍 جهان",
        "title": "آغاز دوره جدید تنش در اروپا",
        "text": "کشورهای اروپایی در حال افزایش آمادگی نظامی خود هستند.",
    },

    {
        "country": "🇩🇪 آلمان",
        "title": "افزایش تولید نظامی",
        "text": "کارخانه‌های نظامی آلمان فعالیت خود را افزایش داده‌اند.",
    },

    {
        "country": "🇬🇧 بریتانیا",
        "title": "افزایش آمادگی دفاعی",
        "text": "بریتانیا نیروهای خود را در وضعیت آماده‌باش قرار داده است.",
    },

    {
        "country": "🇷🇺 شوروی",
        "title": "گسترش نیروهای ارتش",
        "text": "واحدهای جدید ارتش شوروی در حال سازماندهی هستند.",
    },

    {
        "country": "🇺🇸 آمریکا",
        "title": "رشد تولید صنعتی",
        "text": "ظرفیت صنعتی آمریکا در حال افزایش است.",
    },
]


# ---------------------------------------
# صفحه اصلی Bot
# ---------------------------------------

@dp.message(CommandStart())
async def start(message: types.Message):

    user_id = message.from_user.id

    if user_id not in players:

        players[user_id] = {
            "country": None,
            "money": 1000,
            "army": 500,
            "year": 1939,
        }

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🎮 ورود به بازی",
                    web_app=WebAppInfo(
                        url="https://ww2-telegram-game.onrender.com"
                    ),
                )
            ]
        ]
    )

    await message.answer(
        "🌍 <b>WORLD WAR II</b>\n\n"
        "به بازی استراتژیک جنگ جهانی دوم خوش آمدید.\n\n"
        "کشور خود را انتخاب کنید، اقتصاد بسازید، ارتش تشکیل دهید "
        "و در آینده وارد جنگ شوید.\n\n"
        "برای شروع روی دکمه زیر بزنید 👇",
        reply_markup=keyboard,
        parse_mode="HTML",
    )


# ---------------------------------------
# API بازیکن
# ---------------------------------------

async def player_api(request):

    user_id = request.query.get("user_id")

    if not user_id:
        return web.json_response(
            {"error": "user_id missing"},
            status=400,
        )

    try:
        user_id = int(user_id)

    except ValueError:

        return web.json_response(
            {"error": "invalid user_id"},
            status=400,
        )

    if user_id not in players:

        players[user_id] = {
            "country": None,
            "money": 1000,
            "army": 500,
            "year": 1939,
        }

    return web.json_response(players[user_id])


# ---------------------------------------
# API کشورها
# ---------------------------------------

async def countries_api(request):

    return web.json_response(COUNTRIES)


# ---------------------------------------
# API اخبار
# ---------------------------------------

async def news_api(request):

    return web.json_response(NEWS)


# ---------------------------------------
# API انتخاب کشور
# ---------------------------------------

async def select_country(request):

    user_id = request.query.get("user_id")
    country_id = request.query.get("country")

    if not user_id or not country_id:

        return web.json_response(
            {"error": "missing data"},
            status=400,
        )

    try:
        user_id = int(user_id)

    except ValueError:

        return web.json_response(
            {"error": "invalid user"},
            status=400,
        )

    if country_id not in COUNTRIES:

        return web.json_response(
            {"error": "country not found"},
            status=404,
        )

    if user_id not in players:

        players[user_id] = {
            "country": None,
            "money": 1000,
            "army": 500,
            "year": 1939,
        }

    players[user_id]["country"] = country_id
    players[user_id]["money"] = COUNTRIES[country_id]["economy"]
    players[user_id]["army"] = COUNTRIES[country_id]["army"]

    return web.json_response(
        {
            "success": True,
            "player": players[user_id],
        }
    )


# ---------------------------------------
# Health Check برای Render
# ---------------------------------------

async def health(request):

    return web.Response(
        text="WW2 Game is running!"
    )


# ---------------------------------------
# Web Server
# ---------------------------------------

async def start_web_server():

    app = web.Application()

    # صفحه اصلی بازی
    app.router.add_get(
        "/",
        lambda request: web.FileResponse(
            "web/index.html"
        ),
    )

    # CSS
    app.router.add_get(
        "/style.css",
        lambda request: web.FileResponse(
            "web/style.css"
        ),
    )

    # JavaScript
    app.router.add_get(
        "/app.js",
        lambda request: web.FileResponse(
            "web/app.js"
        ),
    )

    # APIها
    app.router.add_get(
        "/api/player",
        player_api,
    )

    app.router.add_get(
        "/api/countries",
        countries_api,
    )

    app.router.add_get(
        "/api/news",
        news_api,
    )

    app.router.add_get(
        "/api/select-country",
        select_country,
    )

    # Health check
    app.router.add_get(
        "/health",
        health,
    )

    runner = web.AppRunner(app)

    await runner.setup()

    # Render پورت را از متغیر PORT می‌دهد
    port = int(
        os.environ.get(
            "PORT",
            8080,
        )
    )

    site = web.TCPSite(
        runner,
        "0.0.0.0",
        port,
    )

    await site.start()

    print(
        f"Web server started on port {port}"
    )


# ---------------------------------------
# اجرای برنامه
# ---------------------------------------

async def main():

    await start_web_server()

    print("Bot is running...")

    await dp.start_polling(bot)


# ---------------------------------------
# Start
# ---------------------------------------

if __name__ == "__main__":

    asyncio.run(main())
