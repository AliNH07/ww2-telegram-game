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
# تنظیمات
# ---------------------------------------

logging.basicConfig(level=logging.INFO)

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


# ---------------------------------------
# بازیکنان
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
# ساخت بازیکن
# ---------------------------------------

def create_player():

    return {
        "country": None,
        "money": 1000,
        "army": 500,
        "year": 1939,
    }


# ---------------------------------------
# صفحه اصلی Bot
# ---------------------------------------

@dp.message(CommandStart())
async def start(message: types.Message):

    user_id = message.from_user.id

    if user_id not in players:

        players[user_id] = create_player()

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

        "ابتدا باید کشور خود را انتخاب کنید.\n"
        "هر کشور فقط می‌تواند توسط یک بازیکن انتخاب شود.\n\n"

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

        players[user_id] = create_player()

    return web.json_response(
        players[user_id]
    )


# ---------------------------------------
# API کشورها
# ---------------------------------------

async def countries_api(request):

    # کشورهایی که قبلاً انتخاب شده‌اند
    taken_countries = {}

    for user_id, player in players.items():

        country = player.get("country")

        if country:

            taken_countries[country] = user_id

    result = {}

    for country_id, country_data in COUNTRIES.items():

        result[country_id] = {
            **country_data,
            "taken": country_id in taken_countries,
        }

    return web.json_response(result)


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
            {
                "success": False,
                "error": "missing data",
            },
            status=400,
        )

    try:

        user_id = int(user_id)

    except ValueError:

        return web.json_response(
            {
                "success": False,
                "error": "invalid user",
            },
            status=400,
        )

    # بررسی کشور
    if country_id not in COUNTRIES:

        return web.json_response(
            {
                "success": False,
                "error": "country not found",
            },
            status=404,
        )

    # ساخت بازیکن در صورت نیاز
    if user_id not in players:

        players[user_id] = create_player()

    # -----------------------------------
    # بررسی اینکه کشور قبلاً گرفته شده
    # -----------------------------------

    for other_user_id, other_player in players.items():

        if (
            other_user_id != user_id
            and other_player.get("country") == country_id
        ):

            return web.json_response(
                {
                    "success": False,
                    "error": "country_taken",
                    "message": "این کشور قبلاً توسط بازیکن دیگری انتخاب شده است.",
                },
                status=409,
            )

    # -----------------------------------
    # اگر بازیکن قبلاً کشور داشته
    # -----------------------------------

    current_country = players[user_id].get("country")

    if current_country:

        return web.json_response(
            {
                "success": False,
                "error": "already_has_country",
                "message": "شما قبلاً یک کشور انتخاب کرده‌اید.",
                "player": players[user_id],
            },
            status=409,
        )

    # -----------------------------------
    # انتخاب کشور
    # -----------------------------------

    players[user_id]["country"] = country_id

    players[user_id]["money"] = COUNTRIES[country_id]["economy"]

    players[user_id]["army"] = COUNTRIES[country_id]["army"]

    print(
        f"PLAYER {user_id} SELECTED COUNTRY: {country_id}"
    )

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

    # صفحه اصلی
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

    # API بازیکن
    app.router.add_get(
        "/api/player",
        player_api,
    )

    # API کشورها
    app.router.add_get(
        "/api/countries",
        countries_api,
    )

    # API اخبار
    app.router.add_get(
        "/api/news",
        news_api,
    )

    # API انتخاب کشور
    app.router.add_get(
        "/api/select-country",
        select_country,
    )

    # Health
    app.router.add_get(
        "/health",
        health,
    )

    runner = web.AppRunner(app)

    await runner.setup()

    # پورت Render
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
