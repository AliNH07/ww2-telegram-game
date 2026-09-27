import os
import uuid
import logging
from datetime import datetime, timedelta

from aiohttp import web
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import (
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
)
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

    "germany": {"name": "آلمان", "flag": "🇩🇪"},
    "britain": {"name": "بریتانیا", "flag": "🇬🇧"},
    "ussr": {"name": "شوروی", "flag": "🇷🇺"},
    "usa": {"name": "آمریکا", "flag": "🇺🇸"},
    "france": {"name": "فرانسه", "flag": "🇫🇷"},
    "italy": {"name": "ایتالیا", "flag": "🇮🇹"},
    "china": {"name": "چین", "flag": "🇨🇳"},
    "japan": {"name": "ژاپن", "flag": "🇯🇵"},
}


# =========================================================
# تنظیمات پایه بازی
# =========================================================

STARTING_MONEY = 10_000_000
STARTING_MANPOWER = 3_000

BASE_DAILY_INCOME = 100_000
BASE_MANPOWER_PRODUCTION = 50

GAME_TOTAL_DAYS = 31
DAYS_PER_SEASON = 2

SEASONS = [
    "بهار",
    "تابستان",
    "پاییز",
    "زمستان",
]


# =========================================================
# زیرساخت‌ها (هرکدام ۳ سطح ارتقا)
# =========================================================

INFRASTRUCTURE = {

    "power": {
        "name": "نیروگاه برق",
        "levels": [
            {"cost": 500_000, "capacity": 12},
            {"cost": 1_500_000, "capacity": 30},
            {"cost": 4_000_000, "capacity": 70},
        ],
    },

    "manpower_camp": {
        "name": "اردوگاه نیروی انسانی",
        "levels": [
            {"cost": 200_000, "production": 150},
            {"cost": 600_000, "production": 400},
            {"cost": 1_800_000, "production": 1_000},
        ],
    },

    "barracks": {
        "name": "پادگان",
        "levels": [
            {"cost": 300_000, "capacity": 5},
            {"cost": 900_000, "capacity": 12},
            {"cost": 2_500_000, "capacity": 25},
        ],
    },

    "airport": {
        "name": "فرودگاه",
        "levels": [
            {"cost": 600_000, "capacity": 3},
            {"cost": 1_800_000, "capacity": 8},
            {"cost": 5_000_000, "capacity": 18},
        ],
    },

    "port": {
        "name": "بندر",
        "levels": [
            {"cost": 500_000, "capacity": 3},
            {"cost": 1_500_000, "capacity": 8},
            {"cost": 4_000_000, "capacity": 18},
        ],
    },
}


# =========================================================
# یگان‌های نظامی
# =========================================================

ARMY_UNITS = {

    "land": {
        "name": "گردان زمینی",
        "infra": "barracks",
        "cost": 50_000,
        "manpower": 300,
        "power_required": 5,
        "army_power": 15,
    },

    "air": {
        "name": "اسکادران هوایی",
        "infra": "airport",
        "cost": 200_000,
        "manpower": 150,
        "power_required": 15,
        "army_power": 40,
    },

    "navy": {
        "name": "ناو دریایی",
        "infra": "port",
        "cost": 250_000,
        "manpower": 200,
        "power_required": 15,
        "army_power": 35,
    },
}


TREATY_TYPE_NAMES = {
    "alliance": "پیمان اتحاد",
    "non_aggression": "پیمان عدم تجاوز",
}


ATTACK_TYPE_NAMES = {
    "land": "زمینی",
    "air": "هوایی",
    "navy": "دریایی",
}


# =========================================================
# زمان بازی / فصل
# =========================================================

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

    elapsed_days_float = max(
        0,
        (now - started).total_seconds() / 86400
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
        timedelta(days=(season_index + 1) * DAYS_PER_SEASON)
    )

    game_end = started + timedelta(days=GAME_TOTAL_DAYS)

    season_end = min(season_end, game_end)

    remaining = season_end - now

    if remaining.total_seconds() < 0:
        remaining = timedelta(0)

    return {
        "day": day,
        "season": SEASONS[season_index],
        "season_days_left": remaining.days,
        "season_hours_left": remaining.seconds // 3600,
        "next_season": SEASONS[(season_index + 1) % len(SEASONS)],
    }


# =========================================================
# محاسبه نرخ‌ها بر اساس سطح زیرساخت‌ها
# =========================================================

def get_infra_level(player, category):

    return player.get("infra_levels", {}).get(category, 0)


def get_infra_level_info(category, level):

    if level <= 0:
        return None

    levels = INFRASTRUCTURE[category]["levels"]

    index = min(level, len(levels)) - 1

    return levels[index]


def compute_rates(player):

    power_level = get_infra_level(player, "power")
    camp_level = get_infra_level(player, "manpower_camp")

    power_info = get_infra_level_info("power", power_level)
    camp_info = get_infra_level_info("manpower_camp", camp_level)

    power_capacity = power_info["capacity"] if power_info else 0

    manpower_production = (
        BASE_MANPOWER_PRODUCTION +
        (camp_info["production"] if camp_info else 0)
    )

    return {
        "gross_income": BASE_DAILY_INCOME,
        "net_income": BASE_DAILY_INCOME,
        "power_capacity": power_capacity,
        "manpower_production": manpower_production,
    }


def accrue_player(player):

    if not player.get("started_at"):
        return

    now = datetime.utcnow()

    last_raw = player.get("last_update") or player["started_at"]

    last = datetime.fromisoformat(last_raw)

    elapsed_seconds = max(0, (now - last).total_seconds())

    rates = compute_rates(player)

    fraction_of_day = elapsed_seconds / 86400

    player["money"] = (
        player.get("money", STARTING_MONEY) +
        rates["net_income"] * fraction_of_day
    )

    player["manpower"] = (
        player.get("manpower", STARTING_MANPOWER) +
        rates["manpower_production"] * fraction_of_day
    )

    player["last_update"] = now.isoformat()

    expire_player_treaties(player)


def expire_player_treaties(player):

    country_id = player.get("country")

    if not country_id:
        return

    now = datetime.utcnow()

    global active_treaties

    active_treaties = [
        treaty for treaty in active_treaties
        if datetime.fromisoformat(treaty["expires_at"]) > now
    ]


def get_infra_status(player):

    result = {}

    for category in INFRASTRUCTURE:

        level = get_infra_level(player, category)

        current = get_infra_level_info(category, level)

        levels = INFRASTRUCTURE[category]["levels"]

        next_level = level + 1

        next_info = (
            levels[next_level - 1]
            if next_level <= len(levels)
            else None
        )

        result[category] = {
            "name": INFRASTRUCTURE[category]["name"],
            "level": level,
            "max_level": len(levels),
            "current": current,
            "next": next_info,
        }

    return result


def serialize_player(player):

    accrue_player(player)

    rates = compute_rates(player)

    data = dict(player)

    data.update(get_game_time(player))

    data["power_capacity"] = rates["power_capacity"]
    data["manpower_production"] = rates["manpower_production"]
    data["daily_income"] = rates["net_income"]
    data["infra"] = get_infra_status(player)

    return data


# =========================================================
# بازیکنان
# =========================================================

players = {}

diplomacy_proposals = {}

active_treaties = []


def create_player(user_id):

    return {
        "user_id": user_id,
        "country": None,
        "money": STARTING_MONEY,
        "army": 0,
        "manpower": STARTING_MANPOWER,
        "infra_levels": {},
        "units": {"land": 0, "air": 0, "navy": 0},
        "year": 1939,
        "started_at": None,
        "last_update": None,
    }


def get_player_by_country(country_id):

    for user_id, player in players.items():

        if player.get("country") == country_id:
            return user_id, player

    return None, None


# =========================================================
# Bot
# =========================================================

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


@dp.message(Command("start"))
async def start_command(message: types.Message):

    user_id = message.from_user.id

    logging.info(
        "USER STARTED BOT | user_id=%s | username=%s",
        user_id,
        message.from_user.username
    )

    if user_id not in players:
        players[user_id] = create_player(user_id)

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🌍 ورود به بازی",
                    web_app=WebAppInfo(url=WEB_APP_URL)
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

    await message.answer(text, reply_markup=keyboard)


# =========================================================
# دکمه‌های تأیید/رد پیمان در تلگرام
# =========================================================

@dp.callback_query(F.data.startswith("treaty:"))
async def handle_treaty_callback(callback: types.CallbackQuery):

    _, action, proposal_id = callback.data.split(":")

    proposal = diplomacy_proposals.get(proposal_id)

    if not proposal or proposal["status"] != "pending":

        await callback.answer("این پیشنهاد دیگر معتبر نیست.")

        return

    if callback.from_user.id != proposal["to_user"]:

        await callback.answer("این پیشنهاد برای شما نیست.")

        return

    type_name = TREATY_TYPE_NAMES.get(
        proposal["treaty_type"], proposal["treaty_type"]
    )

    if action == "accept":

        proposal["status"] = "accepted"

        expires_at = (
            datetime.utcnow() +
            timedelta(days=proposal["duration_days"])
        ).isoformat()

        active_treaties.append({
            "id": str(uuid.uuid4()),
            "country_a": proposal["from_country"],
            "country_b": proposal["to_country"],
            "treaty_type": proposal["treaty_type"],
            "expires_at": expires_at,
        })

        await callback.message.edit_text(
            f"✅ {type_name} با "
            f"{COUNTRIES[proposal['to_country']]['name']} "
            f"پذیرفته شد."
        )

        from_user_id = proposal["from_user"]

        if from_user_id in players:

            try:

                await bot.send_message(
                    from_user_id,
                    f"✅ {COUNTRIES[proposal['to_country']]['name']} "
                    f"{type_name} شما را پذیرفت."
                )

            except Exception as error:

                logging.warning(
                    "Failed to notify proposer: %s", error
                )

    elif action == "reject":

        proposal["status"] = "rejected"

        await callback.message.edit_text(
            f"❌ {type_name} با "
            f"{COUNTRIES[proposal['to_country']]['name']} "
            f"رد شد."
        )

        from_user_id = proposal["from_user"]

        if from_user_id in players:

            try:

                await bot.send_message(
                    from_user_id,
                    f"❌ {COUNTRIES[proposal['to_country']]['name']} "
                    f"{type_name} شما را رد کرد."
                )

            except Exception as error:

                logging.warning(
                    "Failed to notify proposer: %s", error
                )

    await callback.answer()


# =========================================================
# API - Player
# =========================================================

async def get_player(request):

    try:
        user_id = int(request.query.get("user_id"))
    except (TypeError, ValueError):
        return web.json_response({"error": "invalid_user_id"}, status=400)

    if user_id not in players:
        players[user_id] = create_player(user_id)

    return web.json_response(
        serialize_player(players[user_id])
    )


# =========================================================
# API - Countries
# =========================================================

async def get_countries(request):

    result = []

    for country_id, country in COUNTRIES.items():

        owner_id, _ = get_player_by_country(country_id)

        result.append({
            "id": country_id,
            "name": country["name"],
            "flag": country["flag"],
            "taken": owner_id is not None,
        })

    return web.json_response(result)


# =========================================================
# API - Select Country
# =========================================================

async def select_country(request):

    try:
        user_id = int(request.query.get("user_id"))
    except (TypeError, ValueError):
        return web.json_response(
            {"success": False, "error": "invalid_user_id"}, status=400
        )

    country_id = request.query.get("country")

    if country_id not in COUNTRIES:
        return web.json_response({
            "success": False,
            "error": "invalid_country",
            "message": "کشور انتخاب شده معتبر نیست."
        }, status=400)

    if user_id not in players:
        players[user_id] = create_player(user_id)

    player = players[user_id]

    if player["country"]:

        if player["country"] == country_id:

            return web.json_response({
                "success": True,
                "player": serialize_player(player)
            })

        return web.json_response({
            "success": False,
            "error": "already_has_country",
            "message": "شما قبلاً یک کشور انتخاب کرده‌اید."
        }, status=409)

    owner_id, _ = get_player_by_country(country_id)

    if owner_id is not None and owner_id != user_id:

        return web.json_response({
            "success": False,
            "error": "country_taken",
            "message": "این کشور قبلاً توسط بازیکن دیگری انتخاب شده است."
        }, status=409)

    player["country"] = country_id

    if not player.get("started_at"):

        now = datetime.utcnow().isoformat()

        player["started_at"] = now
        player["last_update"] = now

    logging.info(
        "PLAYER ENTERED GAME | user_id=%s | country=%s",
        user_id, country_id
    )

    return web.json_response({
        "success": True,
        "player": serialize_player(player)
    })


# =========================================================
# API - ارتقای زیرساخت
# =========================================================

async def upgrade_infra(request):

    try:
        user_id = int(request.query.get("user_id"))
    except (TypeError, ValueError):
        return web.json_response(
            {"success": False, "error": "invalid_user_id"}, status=400
        )

    category = request.query.get("category")

    if category not in INFRASTRUCTURE:
        return web.json_response(
            {"success": False, "error": "invalid_category"}, status=400
        )

    if user_id not in players:
        players[user_id] = create_player(user_id)

    player = players[user_id]

    if not player.get("country"):
        return web.json_response({
            "success": False,
            "error": "no_country",
            "message": "ابتدا وارد بازی شوید."
        }, status=400)

    accrue_player(player)

    current_level = get_infra_level(player, category)

    levels = INFRASTRUCTURE[category]["levels"]

    if current_level >= len(levels):

        return web.json_response({
            "success": False,
            "error": "max_level",
            "message": "این زیرساخت به حداکثر سطح رسیده است."
        }, status=400)

    next_level_info = levels[current_level]

    cost = next_level_info["cost"]

    if player.get("money", 0) < cost:

        return web.json_response({
            "success": False,
            "error": "not_enough_money",
            "message": "پول کافی ندارید."
        }, status=400)

    player["money"] -= cost

    player.setdefault("infra_levels", {})

    player["infra_levels"][category] = current_level + 1

    logging.info(
        "INFRA UPGRADED | user_id=%s | category=%s | level=%s",
        user_id, category, current_level + 1
    )

    return web.json_response({
        "success": True,
        "player": serialize_player(player)
    })


# =========================================================
# API - آموزش یگان نظامی
# =========================================================

async def train_unit(request):

    try:
        user_id = int(request.query.get("user_id"))
    except (TypeError, ValueError):
        return web.json_response(
            {"success": False, "error": "invalid_user_id"}, status=400
        )

    unit_id = request.query.get("unit_id")

    if unit_id not in ARMY_UNITS:
        return web.json_response(
            {"success": False, "error": "invalid_unit"}, status=400
        )

    if user_id not in players:
        players[user_id] = create_player(user_id)

    player = players[user_id]

    if not player.get("country"):
        return web.json_response({
            "success": False,
            "error": "no_country",
            "message": "ابتدا وارد بازی شوید."
        }, status=400)

    accrue_player(player)

    unit = ARMY_UNITS[unit_id]

    infra_category = unit["infra"]

    infra_level = get_infra_level(player, infra_category)

    if infra_level <= 0:

        return web.json_response({
            "success": False,
            "error": "no_infra",
            "message": (
                f"ابتدا {INFRASTRUCTURE[infra_category]['name']} "
                "را در زیرساخت بسازید."
            )
        }, status=400)

    infra_info = get_infra_level_info(infra_category, infra_level)

    capacity = infra_info["capacity"]

    current_count = player.get("units", {}).get(unit_id, 0)

    if current_count >= capacity:

        return web.json_response({
            "success": False,
            "error": "capacity_full",
            "message": "ظرفیت این زیرساخت پر است؛ سطح آن را ارتقا دهید."
        }, status=400)

    rates = compute_rates(player)

    if rates["power_capacity"] < unit["power_required"]:

        return web.json_response({
            "success": False,
            "error": "not_enough_power",
            "message": "ظرفیت برق شما کافی نیست."
        }, status=400)

    if player.get("money", 0) < unit["cost"]:

        return web.json_response({
            "success": False,
            "error": "not_enough_money",
            "message": "پول کافی ندارید."
        }, status=400)

    if player.get("manpower", 0) < unit["manpower"]:

        return web.json_response({
            "success": False,
            "error": "not_enough_manpower",
            "message": "نیروی انسانی کافی ندارید."
        }, status=400)

    player["money"] -= unit["cost"]
    player["manpower"] -= unit["manpower"]

    player.setdefault("units", {"land": 0, "air": 0, "navy": 0})

    player["units"][unit_id] = current_count + 1

    player["army"] = player.get("army", 0) + unit["army_power"]

    logging.info(
        "UNIT TRAINED | user_id=%s | unit=%s", user_id, unit_id
    )

    return web.json_response({
        "success": True,
        "player": serialize_player(player)
    })


# =========================================================
# API - حمله
# =========================================================

async def attack(request):

    try:
        user_id = int(request.query.get("user_id"))
    except (TypeError, ValueError):
        return web.json_response(
            {"success": False, "error": "invalid_user_id"}, status=400
        )

    target = request.query.get("target")
    attack_type = request.query.get("type", "land")

    if target not in COUNTRIES:
        return web.json_response(
            {"success": False, "error": "invalid_target"}, status=400
        )

    if user_id not in players:
        players[user_id] = create_player(user_id)

    player = players[user_id]

    if not player.get("country"):
        return web.json_response({
            "success": False,
            "error": "no_country",
            "message": "ابتدا وارد بازی شوید."
        }, status=400)

    if target == player.get("country"):
        return web.json_response(
            {"success": False, "error": "self_attack"}, status=400
        )

    logging.info(
        "ATTACK LAUNCHED | user_id=%s | from=%s | to=%s | type=%s",
        user_id, player.get("country"), target, attack_type
    )

    type_name = ATTACK_TYPE_NAMES.get(attack_type, attack_type)
    target_name = COUNTRIES[target]["name"]

    return web.json_response({
        "success": True,
        "message": f"عملیات {type_name} علیه {target_name} آغاز شد."
    })


# =========================================================
# API - دیپلماسی: ارسال پیشنهاد پیمان
# =========================================================

async def propose_treaty(request):

    try:
        user_id = int(request.query.get("user_id"))
    except (TypeError, ValueError):
        return web.json_response(
            {"success": False, "error": "invalid_user_id"}, status=400
        )

    target_country = request.query.get("target")
    treaty_type = request.query.get("type")

    try:
        duration_days = int(request.query.get("duration_days", "10"))
    except (TypeError, ValueError):
        duration_days = 10

    duration_days = max(1, min(duration_days, 30))

    if target_country not in COUNTRIES:
        return web.json_response(
            {"success": False, "error": "invalid_target"}, status=400
        )

    if treaty_type not in TREATY_TYPE_NAMES:
        return web.json_response(
            {"success": False, "error": "invalid_type"}, status=400
        )

    if user_id not in players:
        players[user_id] = create_player(user_id)

    player = players[user_id]

    from_country = player.get("country")

    if not from_country:
        return web.json_response({
            "success": False,
            "error": "no_country",
            "message": "ابتدا وارد بازی شوید."
        }, status=400)

    if target_country == from_country:
        return web.json_response(
            {"success": False, "error": "self_proposal"}, status=400
        )

    target_user_id, target_player = get_player_by_country(target_country)

    if target_user_id is None:
        return web.json_response({
            "success": False,
            "error": "country_unowned",
            "message": "این کشور هنوز توسط هیچ بازیکنی انتخاب نشده است."
        }, status=400)

    proposal_id = str(uuid.uuid4())

    diplomacy_proposals[proposal_id] = {
        "id": proposal_id,
        "from_user": user_id,
        "from_country": from_country,
        "to_user": target_user_id,
        "to_country": target_country,
        "treaty_type": treaty_type,
        "duration_days": duration_days,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
    }

    type_name = TREATY_TYPE_NAMES[treaty_type]
    from_name = COUNTRIES[from_country]["name"]

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ قبول",
                    callback_data=f"treaty:accept:{proposal_id}"
                ),
                InlineKeyboardButton(
                    text="❌ رد",
                    callback_data=f"treaty:reject:{proposal_id}"
                ),
            ]
        ]
    )

    try:

        await bot.send_message(
            target_user_id,
            f"📜 پیشنهاد {type_name}\n\n"
            f"کشور {from_name} به شما پیشنهاد {type_name} "
            f"به مدت {duration_days} روز داده است.",
            reply_markup=keyboard
        )

    except Exception as error:

        logging.warning(
            "Failed to send treaty proposal: %s", error
        )

        return web.json_response({
            "success": False,
            "error": "message_failed",
            "message": (
                "ارسال پیام به بازیکن مقابل ممکن نشد "
                "(باید قبلاً ربات را استارت کرده باشد)."
            )
        }, status=400)

    return web.json_response({
        "success": True,
        "message": "پیشنهاد ارسال شد و منتظر تأیید طرف مقابل است."
    })


# =========================================================
# API - وضعیت دیپلماسی
# =========================================================

async def get_diplomacy(request):

    try:
        user_id = int(request.query.get("user_id"))
    except (TypeError, ValueError):
        return web.json_response({"error": "invalid_user_id"}, status=400)

    if user_id not in players:
        players[user_id] = create_player(user_id)

    player = players[user_id]

    accrue_player(player)

    country_id = player.get("country")

    sent = [
        p for p in diplomacy_proposals.values()
        if p["from_user"] == user_id and p["status"] == "pending"
    ]

    received = [
        p for p in diplomacy_proposals.values()
        if p["to_user"] == user_id and p["status"] == "pending"
    ]

    treaties = [
        t for t in active_treaties
        if country_id and (
            t["country_a"] == country_id or
            t["country_b"] == country_id
        )
    ]

    return web.json_response({
        "sent": sent,
        "received": received,
        "treaties": treaties,
    })


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

    return web.json_response(news)


# =========================================================
# Health Check
# =========================================================

async def health(request):
    return web.json_response({"status": "ok"})


# =========================================================
# فایل‌های Web App
# =========================================================

async def index(request):
    return web.FileResponse(os.path.join("web", "index.html"))


async def style(request):
    return web.FileResponse(os.path.join("web", "style.css"))


async def app_js(request):
    return web.FileResponse(os.path.join("web", "app.js"))


# =========================================================
# ساخت Web Server
# =========================================================

async def create_web_app():

    app = web.Application()

    app.router.add_get("/", index)
    app.router.add_get("/style.css", style)
    app.router.add_get("/app.js", app_js)

    app.router.add_static("/images/", path="web/images", name="images")

    app.router.add_get("/api/player", get_player)
    app.router.add_get("/api/countries", get_countries)
    app.router.add_get("/api/select-country", select_country)

    app.router.add_get("/api/upgrade-infra", upgrade_infra)
    app.router.add_get("/api/train-unit", train_unit)
    app.router.add_get("/api/attack", attack)

    app.router.add_get("/api/propose-treaty", propose_treaty)
    app.router.add_get("/api/diplomacy", get_diplomacy)

    app.router.add_get("/api/news", get_news)

    app.router.add_get("/health", health)

    return app


# =========================================================
# اجرای سرور
# =========================================================

async def start_web_server():

    app = await create_web_app()

    runner = web.AppRunner(app)

    await runner.setup()

    port = int(os.getenv("PORT", "10000"))

    site = web.TCPSite(runner, "0.0.0.0", port)

    await site.start()

    logging.info("WEB SERVER STARTED | port=%s", port)


# =========================================================
# Main
# =========================================================

async def main():

    logging.info("WW2 TELEGRAM GAME STARTING...")

    await start_web_server()

    logging.info("BOT POLLING STARTED")

    await dp.start_polling(bot)


if __name__ == "__main__":

    import asyncio

    asyncio.run(main())
