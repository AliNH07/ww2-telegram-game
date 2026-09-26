import os
import logging
from datetime import datetime, timedelta

from aiohttp import web
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from dotenv import load_dotenv


# =========================================================
# تنظیمات
# =========================================================

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")

WEB_APP_URL = "https://ww2-telegram-game.onrender.com"


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)


# =========================================================
# کشورها
# =========================================================

COUNTRIES = {

    "germany": {
        "name": "آلمان",
        "flag": "🇩🇪",
        "economy": 850,
        "army": 900,
        "population": 80_000_000,
    },

    "britain": {
        "name": "بریتانیا",
        "flag": "🇬🇧",
        "economy": 800,
        "army": 700,
        "population": 47_000_000,
    },

    "ussr": {
        "name": "شوروی",
        "flag": "🇷🇺",
        "economy": 750,
        "army": 950,
        "population": 170_000_000,
    },

    "usa": {
        "name": "آمریکا",
        "flag": "🇺🇸",
        "economy": 1000,
        "army": 600,
        "population": 130_000_000,
    },

    "france": {
        "name": "فرانسه",
        "flag": "🇫🇷",
        "economy": 700,
        "army": 650,
        "population": 42_000_000,
    },

    "italy": {
        "name": "ایتالیا",
        "flag": "🇮🇹",
        "economy": 600,
        "army": 500,
        "population": 44_000_000,
    },

    "china": {
        "name": "چین",
        "flag": "🇨🇳",
        "economy": 550,
        "army": 750,
        "population": 517_000_000,
    },

    "japan": {
        "name": "ژاپن",
        "flag": "🇯🇵",
        "economy": 700,
        "army": 800,
        "population": 71_000_000,
    },
}


# =========================================================
# تنظیمات بازی (پول / زمان / فصل / نیروی انسانی)
# =========================================================

STARTING_MONEY = 10_000_000
STARTING_MANPOWER = 40_000

GAME_TOTAL_DAYS = 31
DAYS_PER_SEASON = 2

SEASONS = [
    "بهار",
    "تابستان",
    "پاییز",
    "زمستان",
]

# ضریب تبدیل «اقتصاد کشور» به «درآمد روزانه» نمایشی
INCOME_MULTIPLIER = 500


def get_game_time(player):

    started_at = player.get("started_at")

    if not started_at:

        return {
            "day": 1,
            "season": SEASONS[0],
            "season_days_left": DAYS_PER_SEASON,
            "season_hours_left": 0,
            "next_season": SEASONS[1],
        }

    started = datetime.fromisoformat(started_at)

    now = datetime.utcnow()

    elapsed = now - started

    elapsed_days_float = max(
        0,
        elapsed.total_seconds() / 86400
    )

    day = min(
        GAME_TOTAL_DAYS,
        int(elapsed_days_float) + 1
    )

    season_index = (
        ((day - 1) // DAYS_PER_SEASON) % len(SEASONS)
    )

    season_end = (
        started +
        timedelta(
            days=(season_index + 1) * DAYS_PER_SEASON
        )
    )

    game_end = (
        started +
        timedelta(days=GAME_TOTAL_DAYS)
    )

    season_end = min(season_end, game_end)

    remaining = season_end - now

    if remaining.total_seconds() < 0:
        remaining = timedelta(0)

    season_days_left = remaining.days

    season_hours_left = remaining.seconds // 3600

    next_season = (
        SEASONS[(season_index + 1) % len(SEASONS)]
    )

    return {
        "day": day,
        "season": SEASONS[season_index],
        "season_days_left": season_days_left,
        "season_hours_left": season_hours_left,
        "next_season": next_season,
    }


def get_economy(player):

    country_id = player.get("country")

    day = get_game_time(player)["day"]

    if not country_id:

        return {
            "daily_income": 0,
            "money": player.get("money", STARTING_MONEY),
        }

    daily_income = (
        COUNTRIES[country_id]["economy"] *
        INCOME_MULTIPLIER
    )

    accrued = daily_income * (day - 1)

    money = (
        player.get("money", STARTING_MONEY) +
        accrued
    )

    return {
        "daily_income": daily_income,
        "money": money,
    }


def serialize_player(player):

    data = dict(player)

    data.update(
        get_game_time(player)
    )

    data.update(
        get_economy(player)
    )

    return data


# =========================================================
# بازیکنان
# =========================================================

players = {}


def create_player(user_id):

    return {
        "user_id": user_id,
        "country": None,
        "money": STARTING_MONEY,
        "army": 0,
        "power": 0,
        "power_capacity": 0,
        "manpower": STARTING_MANPOWER,
        "year": 1939,
        "started_at": None,
    }


# =========================================================
# Bot
# =========================================================

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


# =========================================================
# /start
# =========================================================

@dp.message(Command("start"))
async def start_command(message: types.Message):

    user_id = message.from_user.id

    logging.info(
        "USER STARTED BOT | user_id=%s | username=%s",
        user_id,
        message.from_user.username
    )

    if user_id not in players:

        players[user_id] = create_player(
            user_id
        )


    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🌍 ورود به بازی",
                    web_app=WebAppInfo(
                        url=WEB_APP_URL
                    )
                )
            ]
        ]
    )


    if players[user_id]["country"]:

        text = (
            "⚔️ به جنگ جهانی دوم خوش آمدید.\n\n"
            f"کشور شما: "
            f"{COUNTRIES[players[user_id]['country']]['flag']} "
            f"{COUNTRIES[players[user_id]['country']]['name']}\n\n"
            "برای ورود به فرماندهی روی دکمه زیر بزنید."
        )

    else:

        text = (
            "⚔️ به جنگ جهانی دوم خوش آمدید.\n\n"
            "سال ۱۹۳۹ است.\n"
            "سرنوشت کشورها در دستان فرماندهان است.\n\n"
            "ابتدا وارد بازی شوید و کشور خود را انتخاب کنید."
        )


    await message.answer(
        text,
        reply_markup=keyboard
    )


# =========================================================
# API - Player
# =========================================================

async def get_player(request):

    try:

        user_id = int(
            request.query.get("user_id")
        )

    except (TypeError, ValueError):

        return web.json_response(
            {
                "error": "invalid_user_id"
            },
            status=400
        )


    if user_id not in players:

        players[user_id] = create_player(
            user_id
        )


    return web.json_response(
        serialize_player(
            players[user_id]
        )
    )


# =========================================================
# API - Countries
# =========================================================

async def get_countries(request):

    result = []


    for country_id, country in COUNTRIES.items():

        owner_id = None


        for user_id, player in players.items():

            if player.get("country") == country_id:

                owner_id = user_id
                break


        result.append(
            {
                "id": country_id,
                "name": country["name"],
                "flag": country["flag"],
                "economy": country["economy"],
                "army": country["army"],
                "population": country["population"],
                "taken": owner_id is not None,
            }
        )


    return web.json_response(
        result
    )


# =========================================================
# API - Select Country (فقط بعد از "ورود به بازی" صدا زده می‌شود)
# =========================================================

async def select_country(request):

    try:

        user_id = int(
            request.query.get("user_id")
        )

    except (TypeError, ValueError):

        return web.json_response(
            {
                "success": False,
                "error": "invalid_user_id"
            },
            status=400
        )


    country_id = request.query.get(
        "country"
    )


    # -----------------------------------------------------
    # بررسی کشور
    # -----------------------------------------------------

    if country_id not in COUNTRIES:

        return web.json_response(
            {
                "success": False,
                "error": "invalid_country",
                "message": "کشور انتخاب شده معتبر نیست."
            },
            status=400
        )


    # -----------------------------------------------------
    # ساخت بازیکن در صورت نبودن
    # -----------------------------------------------------

    if user_id not in players:

        players[user_id] = create_player(
            user_id
        )


    player = players[user_id]


    # -----------------------------------------------------
    # اگر بازیکن قبلاً کشور دارد
    # -----------------------------------------------------

    if player["country"]:

        if player["country"] == country_id:

            return web.json_response(
                {
                    "success": True,
                    "player": serialize_player(player)
                }
            )


        return web.json_response(
            {
                "success": False,
                "error": "already_has_country",
                "message": "شما قبلاً یک کشور انتخاب کرده‌اید."
            },
            status=409
        )


    # -----------------------------------------------------
    # بررسی مالکیت کشور
    # -----------------------------------------------------

    for other_user_id, other_player in players.items():

        if other_user_id == user_id:
            continue


        if other_player.get("country") == country_id:

            logging.warning(
                "COUNTRY ALREADY TAKEN | "
                "country=%s | owner=%s | requester=%s",
                country_id,
                other_user_id,
                user_id
            )

            return web.json_response(
                {
                    "success": False,
                    "error": "country_taken",
                    "message": (
                        "این کشور قبلاً توسط بازیکن دیگری "
                        "انتخاب شده است."
                    )
                },
                status=409
            )


    # -----------------------------------------------------
    # انتخاب کشور (نهایی، فقط اینجا برای کاربر ثبت می‌شود)
    # -----------------------------------------------------

    player["country"] = country_id

    if not player.get("started_at"):

        player["started_at"] = (
            datetime.utcnow().isoformat()
        )


    logging.info(
        "PLAYER ENTERED GAME | "
        "user_id=%s | country=%s | country_name=%s",
        user_id,
        country_id,
        COUNTRIES[country_id]["name"]
    )


    return web.json_response(
        {
            "success": True,
            "player": serialize_player(player)
        }
    )


# =========================================================
# API - News
# =========================================================

async def get_news(request):

    news = [

        {
            "title": "سال ۱۹۳۹",
            "text": (
                "اروپا در آستانه یک بحران بزرگ قرار دارد. "
                "تصمیمات فرماندهان سرنوشت جهان را تغییر خواهد داد."
            )
        },

        {
            "title": "فرماندهی آغاز شد",
            "text": (
                "کشور خود را انتخاب کنید و برای توسعه اقتصاد، "
                "ارتش و روابط خارجی آماده شوید."
            )
        }

    ]


    return web.json_response(
        news
    )


# =========================================================
# Health Check
# =========================================================

async def health(request):

    return web.json_response(
        {
            "status": "ok"
        }
    )


# =========================================================
# فایل‌های Web App
# =========================================================

async def index(request):

    path = os.path.join(
        "web",
        "index.html"
    )

    return web.FileResponse(
        path
    )


async def style(request):

    path = os.path.join(
        "web",
        "style.css"
    )

    return web.FileResponse(
        path
    )


async def app_js(request):

    path = os.path.join(
        "web",
        "app.js"
    )

    return web.FileResponse(
        path
    )


# =========================================================
# ساخت Web Server
# =========================================================

async def create_web_app():

    app = web.Application()


    # صفحات
    app.router.add_get(
        "/",
        index
    )

    app.router.add_get(
        "/style.css",
        style
    )

    app.router.add_get(
        "/app.js",
        app_js
    )


    # تصاویر کشورها
    app.router.add_static(
        "/images/",
        path="web/images",
        name="images"
    )


    # API
    app.router.add_get(
        "/api/player",
        get_player
    )

    app.router.add_get(
        "/api/countries",
        get_countries
    )

    app.router.add_get(
        "/api/select-country",
        select_country
    )

    app.router.add_get(
        "/api/news",
        get_news
    )


    # Health
    app.router.add_get(
        "/health",
        health
    )


    return app


# =========================================================
# اجرای سرور
# =========================================================

async def start_web_server():

    app = await create_web_app()

    runner = web.AppRunner(
        app
    )

    await runner.setup()


    port = int(
        os.getenv(
            "PORT",
            "10000"
        )
    )


    site = web.TCPSite(
        runner,
        "0.0.0.0",
        port
    )


    await site.start()


    logging.info(
        "WEB SERVER STARTED | port=%s",
        port
    )


# =========================================================
# Main
# =========================================================

async def main():

    logging.info(
        "WW2 TELEGRAM GAME STARTING..."
    )


    await start_web_server()


    logging.info(
        "BOT POLLING STARTED"
    )


    await dp.start_polling(
        bot
    )


if __name__ == "__main__":

    import asyncio

    asyncio.run(
        main()
    )
