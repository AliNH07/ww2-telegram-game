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

SEASONS = ["بهار", "تابستان", "پاییز", "زمستان"]


# =========================================================
# زیرساخت‌ها
# =========================================================

INFRASTRUCTURE = {

    "power_coal": {
        "name": "نیروگاه زغال‌سنگ",
        "group": "power",
        "levels": [
            {"cost": 250_000, "capacity": 10},
            {"cost": 700_000, "capacity": 25},
            {"cost": 1_800_000, "capacity": 55},
            {"cost": 4_500_000, "capacity": 100},
            {"cost": 10_000_000, "capacity": 180},
        ],
    },

    "power_gas": {
        "name": "نیروگاه گازی",
        "group": "power",
        "levels": [
            {"cost": 400_000, "capacity": 15},
            {"cost": 1_000_000, "capacity": 35},
            {"cost": 2_500_000, "capacity": 70},
            {"cost": 6_000_000, "capacity": 130},
            {"cost": 14_000_000, "capacity": 230},
        ],
    },

    "power_wind": {
        "name": "نیروگاه بادی",
        "group": "power",
        "levels": [
            {"cost": 350_000, "capacity": 9},
            {"cost": 900_000, "capacity": 22},
            {"cost": 2_200_000, "capacity": 48},
            {"cost": 5_500_000, "capacity": 95},
            {"cost": 12_000_000, "capacity": 165},
        ],
    },

    "power_solar": {
        "name": "نیروگاه خورشیدی",
        "group": "power",
        "levels": [
            {"cost": 500_000, "capacity": 12},
            {"cost": 1_300_000, "capacity": 28},
            {"cost": 3_200_000, "capacity": 62},
            {"cost": 8_000_000, "capacity": 120},
            {"cost": 18_000_000, "capacity": 210},
        ],
    },

    "power_hydro": {
        "name": "نیروگاه آبی",
        "group": "power",
        "levels": [
            {"cost": 600_000, "capacity": 18},
            {"cost": 1_500_000, "capacity": 40},
            {"cost": 3_800_000, "capacity": 85},
            {"cost": 9_000_000, "capacity": 160},
            {"cost": 20_000_000, "capacity": 280},
        ],
    },

    "power_geothermal": {
        "name": "نیروگاه زمین‌گرمایی",
        "group": "power",
        "levels": [
            {"cost": 800_000, "capacity": 22},
            {"cost": 2_000_000, "capacity": 50},
            {"cost": 5_000_000, "capacity": 105},
            {"cost": 12_000_000, "capacity": 195},
            {"cost": 26_000_000, "capacity": 340},
        ],
    },

    "power_nuclear": {
        "name": "نیروگاه هسته‌ای",
        "group": "power",
        "levels": [
            {"cost": 1_500_000, "capacity": 35},
            {"cost": 4_000_000, "capacity": 85},
            {"cost": 10_000_000, "capacity": 180},
            {"cost": 24_000_000, "capacity": 340},
            {"cost": 55_000_000, "capacity": 600},
        ],
    },

    "manpower_camp": {
        "name": "اردوگاه آموزشی",
        "group": "manpower",
        "levels": [
            {"cost": 150_000, "production": 120},
            {"cost": 400_000, "production": 300},
            {"cost": 1_000_000, "production": 700},
            {"cost": 2_500_000, "production": 1_500},
            {"cost": 6_000_000, "production": 3_000},
        ],
    },

    "manpower_barracks_training": {
        "name": "پادگان آموزشی",
        "group": "manpower",
        "levels": [
            {"cost": 250_000, "production": 180},
            {"cost": 650_000, "production": 420},
            {"cost": 1_600_000, "production": 950},
            {"cost": 4_000_000, "production": 2_000},
            {"cost": 9_500_000, "production": 4_000},
        ],
    },

    "manpower_volunteer": {
        "name": "پایگاه داوطلبان",
        "group": "manpower",
        "levels": [
            {"cost": 200_000, "production": 140},
            {"cost": 500_000, "production": 330},
            {"cost": 1_300_000, "production": 750},
            {"cost": 3_300_000, "production": 1_600},
            {"cost": 8_000_000, "production": 3_200},
        ],
    },

    "manpower_medical": {
        "name": "مرکز پزشکی",
        "group": "manpower",
        "levels": [
            {"cost": 350_000, "production": 150},
            {"cost": 900_000, "production": 360},
            {"cost": 2_200_000, "production": 800},
            {"cost": 5_500_000, "production": 1_700},
            {"cost": 13_000_000, "production": 3_400},
        ],
    },

    "manpower_mobilization": {
        "name": "مرکز بسیج",
        "group": "manpower",
        "levels": [
            {"cost": 300_000, "production": 220},
            {"cost": 800_000, "production": 520},
            {"cost": 2_000_000, "production": 1_150},
            {"cost": 5_000_000, "production": 2_400},
            {"cost": 12_000_000, "production": 4_800},
        ],
    },

    "manpower_academy": {
        "name": "آکادمی نظامی",
        "group": "manpower",
        "levels": [
            {"cost": 500_000, "production": 260},
            {"cost": 1_300_000, "production": 620},
            {"cost": 3_200_000, "production": 1_400},
            {"cost": 8_000_000, "production": 2_900},
            {"cost": 19_000_000, "production": 5_800},
        ],
    },

    "land_barracks": {
        "name": "پادگان زمینی",
        "group": "land",
        "levels": [
            {"cost": 300_000, "capacity": 5},
            {"cost": 800_000, "capacity": 12},
            {"cost": 2_000_000, "capacity": 25},
            {"cost": 5_000_000, "capacity": 45},
            {"cost": 12_000_000, "capacity": 80},
        ],
    },

    "land_hq": {
        "name": "ستاد فرماندهی",
        "group": "land",
        "levels": [
            {"cost": 400_000, "capacity": 3},
            {"cost": 1_000_000, "capacity": 8},
            {"cost": 2_500_000, "capacity": 18},
            {"cost": 6_000_000, "capacity": 35},
            {"cost": 15_000_000, "capacity": 60},
        ],
    },

    "naval_port": {
        "name": "بندر نظامی",
        "group": "naval",
        "levels": [
            {"cost": 400_000, "capacity": 3},
            {"cost": 1_000_000, "capacity": 8},
            {"cost": 2_500_000, "capacity": 18},
            {"cost": 6_000_000, "capacity": 30},
            {"cost": 15_000_000, "capacity": 55},
        ],
    },

    "naval_shipyard": {
        "name": "کشتی‌سازی",
        "group": "naval",
        "levels": [
            {"cost": 500_000, "capacity": 2},
            {"cost": 1_300_000, "capacity": 6},
            {"cost": 3_200_000, "capacity": 14},
            {"cost": 8_000_000, "capacity": 25},
            {"cost": 19_000_000, "capacity": 45},
        ],
    },

    "air_airport": {
        "name": "فرودگاه نظامی",
        "group": "air",
        "levels": [
            {"cost": 500_000, "capacity": 3},
            {"cost": 1_300_000, "capacity": 8},
            {"cost": 3_200_000, "capacity": 18},
            {"cost": 8_000_000, "capacity": 30},
            {"cost": 19_000_000, "capacity": 55},
        ],
    },

    "air_arsenal": {
        "name": "ادوات هوایی",
        "group": "air",
        "levels": [
            {"cost": 600_000, "capacity": 2},
            {"cost": 1_500_000, "capacity": 6},
            {"cost": 3_800_000, "capacity": 14},
            {"cost": 9_000_000, "capacity": 25},
            {"cost": 22_000_000, "capacity": 45},
        ],
    },
}


# =========================================================
# اقتصاد
# =========================================================

ECONOMY = {

    "eco_agriculture": {
        "name": "کشاورزی و دامداری",
        "power_required": 5,
        "levels": [
            {"cost": 200_000, "income": 30_000},
            {"cost": 600_000, "income": 80_000},
            {"cost": 1_600_000, "income": 190_000},
            {"cost": 4_000_000, "income": 420_000},
            {"cost": 10_000_000, "income": 850_000},
        ],
    },

    "eco_textile": {
        "name": "کارخانه نساجی",
        "power_required": 8,
        "levels": [
            {"cost": 300_000, "income": 45_000},
            {"cost": 900_000, "income": 115_000},
            {"cost": 2_400_000, "income": 270_000},
            {"cost": 6_000_000, "income": 600_000},
            {"cost": 15_000_000, "income": 1_200_000},
        ],
    },

    "eco_mining": {
        "name": "معدن‌کاری",
        "power_required": 12,
        "levels": [
            {"cost": 500_000, "income": 70_000},
            {"cost": 1_400_000, "income": 180_000},
            {"cost": 3_600_000, "income": 420_000},
            {"cost": 9_000_000, "income": 920_000},
            {"cost": 22_000_000, "income": 1_850_000},
        ],
    },

    "eco_steel": {
        "name": "کارخانه فولاد",
        "power_required": 18,
        "levels": [
            {"cost": 800_000, "income": 100_000},
            {"cost": 2_200_000, "income": 260_000},
            {"cost": 5_500_000, "income": 600_000},
            {"cost": 14_000_000, "income": 1_300_000},
            {"cost": 32_000_000, "income": 2_600_000},
        ],
    },

    "eco_trade": {
        "name": "تجارت بین‌الملل",
        "power_required": 20,
        "levels": [
            {"cost": 1_500_000, "income": 130_000},
            {"cost": 4_000_000, "income": 330_000},
            {"cost": 10_000_000, "income": 760_000},
            {"cost": 24_000_000, "income": 1_600_000},
            {"cost": 55_000_000, "income": 3_200_000},
        ],
    },

    "eco_oil": {
        "name": "پالایشگاه نفت",
        "power_required": 25,
        "levels": [
            {"cost": 1_200_000, "income": 140_000},
            {"cost": 3_200_000, "income": 360_000},
            {"cost": 8_000_000, "income": 820_000},
            {"cost": 20_000_000, "income": 1_750_000},
            {"cost": 45_000_000, "income": 3_500_000},
        ],
    },

    "eco_bank": {
        "name": "بانک مرکزی",
        "power_required": 30,
        "levels": [
            {"cost": 2_000_000, "income": 180_000},
            {"cost": 5_500_000, "income": 460_000},
            {"cost": 14_000_000, "income": 1_050_000},
            {"cost": 34_000_000, "income": 2_200_000},
            {"cost": 75_000_000, "income": 4_400_000},
        ],
    },
}


# =========================================================
# یگان‌های نظامی
# =========================================================

ARMY_UNITS = {

    "land": {
        "name": "گردان زمینی",
        "group": "land",
        "cost": 50_000,
        "manpower": 300,
        "power_required": 5,
        "attack": 20,
        "defense": 10,
    },

    "air": {
        "name": "اسکادران هوایی",
        "group": "air",
        "cost": 200_000,
        "manpower": 150,
        "power_required": 15,
        "attack": 60,
        "defense": 30,
    },

    "navy": {
        "name": "ناو دریایی",
        "group": "naval",
        "cost": 250_000,
        "manpower": 200,
        "power_required": 15,
        "attack": 50,
        "defense": 60,
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
# محاسبه نرخ‌ها
# =========================================================

def get_infra_level(player, item_id):
    return player.get("infra_levels", {}).get(item_id, 0)


def get_item_info(catalog, item_id, level):

    if level <= 0:
        return None

    levels = catalog[item_id]["levels"]
    index = min(level, len(levels)) - 1

    return levels[index]


def get_power_total(player):

    total = 0

    for item_id, item in INFRASTRUCTURE.items():

        if item.get("group") != "power":
            continue

        level = get_infra_level(player, item_id)

        if level > 0:
            total += item["levels"][level - 1]["capacity"]

    return total


def get_power_used(player):

    total = 0

    for item_id, item in ECONOMY.items():

        level = get_infra_level(player, item_id)

        if level > 0:
            total += item["power_required"] * level

    return total


def get_group_capacity(player, group):

    total = 0

    for item_id, item in INFRASTRUCTURE.items():

        if item.get("group") != group:
            continue

        level = get_infra_level(player, item_id)

        if level > 0:
            total += item["levels"][level - 1]["capacity"]

    return total


def compute_base_rates(player):

    power_capacity = get_power_total(player)
    power_consumption = get_power_used(player)

    manpower_production = BASE_MANPOWER_PRODUCTION

    for item_id, item in INFRASTRUCTURE.items():

        if item.get("group") != "manpower":
            continue

        level = get_infra_level(player, item_id)

        if level > 0:
            manpower_production += (
                item["levels"][level - 1]["production"]
            )

    income = BASE_DAILY_INCOME

    for item_id, item in ECONOMY.items():

        level = get_infra_level(player, item_id)

        if level > 0:
            income += item["levels"][level - 1]["income"]

    return {
        "gross_income": income,
        "net_income": income,
        "power_capacity": power_capacity,
        "power_consumption": power_consumption,
        "manpower_production": manpower_production,
    }


def compute_rates(player):

    base = compute_base_rates(player)

    country = player.get("country")

    if not country:
        return base

    # اگر کشور تحت اشغال است، ۵۰٪ درآمد کم می‌شود
    if country in occupations:

        base["net_income"] = int(base["net_income"] * 0.5)

    # اگر اشغالگر هستیم، به عنوان مالیات اضافه می‌شود
    for occ_country, occ_data in occupations.items():

        if occ_data.get("occupier") == country:

            base["net_income"] += occ_data.get("bonus", 0)

    return base


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


def build_catalog_status(player, catalog):

    result = {}

    for item_id, item in catalog.items():

        level = get_infra_level(player, item_id)
        current = get_item_info(catalog, item_id, level)

        levels = item["levels"]
        next_level = level + 1

        next_info = (
            levels[next_level - 1]
            if next_level <= len(levels)
            else None
        )

        result[item_id] = {
            "name": item["name"],
            "group": item.get("group"),
            "power_required": item.get("power_required"),
            "level": level,
            "max_level": len(levels),
            "current": current,
            "next": next_info,
        }

    return result


# =========================================================
# بازیکنان و State
# =========================================================

players = {}
diplomacy_proposals = {}
active_treaties = []

# اعلام جنگ‌ها: [{"id", "attacker", "defender", "declared_at"}]
active_wars = []

# اشغال‌ها: {country_id: {"occupier": country_id, "bonus": int, "occupied_at": iso}}
occupations = {}


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
# رتبه‌بندی
# =========================================================

def compute_all_rankings():

    scores = {}

    for user_id, player in players.items():

        if not player.get("country"):
            continue

        rates = compute_base_rates(player)

        eco = rates["net_income"]
        mil = player.get("army", 0)

        diplo = 0
        for treaty in active_treaties:
            if (
                treaty["country_a"] == player["country"] or
                treaty["country_b"] == player["country"]
            ):
                diplo += 1

        dev = sum(player.get("infra_levels", {}).values())

        overall = (
            (eco / 100_000) * 1.0 +
            mil * 3.0 +
            diplo * 50.0 +
            dev * 20.0
        )

        scores[user_id] = {
            "economy": eco,
            "military": mil,
            "diplomacy": diplo,
            "development": dev,
            "overall": overall,
        }

    categories = [
        "economy", "military", "diplomacy",
        "development", "overall"
    ]

    total = len(scores)

    for category in categories:

        sorted_ids = sorted(
            scores.keys(),
            key=lambda uid: scores[uid][category],
            reverse=True
        )

        for rank, uid in enumerate(sorted_ids, 1):
            scores[uid][f"{category}_rank"] = rank

    for uid in scores:
        scores[uid]["total_players"] = total

    return scores


# =========================================================
# سریالایز
# =========================================================

def serialize_player(player, rankings=None):

    accrue_player(player)
    rates = compute_rates(player)

    data = dict(player)
    data.update(get_game_time(player))

    data["power_capacity"] = rates["power_capacity"]
    data["power_consumption"] = rates["power_consumption"]
    data["manpower_production"] = rates["manpower_production"]
    data["daily_income"] = rates["net_income"]

    data["infra"] = build_catalog_status(player, INFRASTRUCTURE)
    data["economy"] = build_catalog_status(player, ECONOMY)

    # اشغال
    country = player.get("country")

    if country and country in occupations:
        data["occupied_by"] = occupations[country]["occupier"]
    else:
        data["occupied_by"] = None

    # کشورهای تحت اشغال ما
    my_occupations = [
        c for c, o in occupations.items()
        if o.get("occupier") == country and country
    ]
    data["my_occupations"] = my_occupations

    # رتبه‌بندی
    if rankings is None:
        rankings = compute_all_rankings()

    uid = player.get("user_id")

    if uid in rankings:

        r = rankings[uid]
        data["rankings"] = {
            "overall": {
                "rank": r.get("overall_rank"),
                "total": r.get("total_players"),
                "score": round(r.get("overall", 0), 1),
            },
            "economy": {
                "rank": r.get("economy_rank"),
                "total": r.get("total_players"),
                "score": r.get("economy", 0),
            },
            "military": {
                "rank": r.get("military_rank"),
                "total": r.get("total_players"),
                "score": r.get("military", 0),
            },
            "diplomacy": {
                "rank": r.get("diplomacy_rank"),
                "total": r.get("total_players"),
                "score": r.get("diplomacy", 0),
            },
            "development": {
                "rank": r.get("development_rank"),
                "total": r.get("total_players"),
                "score": r.get("development", 0),
            },
        }

    else:

        data["rankings"] = None

    return data


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
# دکمه‌های تأیید/رد پیمان
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
        return web.json_response(
            {"error": "invalid_user_id"}, status=400
        )

    if user_id not in players:
        players[user_id] = create_player(user_id)

    rankings = compute_all_rankings()

    return web.json_response(
        serialize_player(players[user_id], rankings)
    )


# =========================================================
# API - Countries
# =========================================================

async def get_countries(request):

    result = []

    for country_id, country in COUNTRIES.items():

        owner_id, _ = get_player_by_country(country_id)

        entry = {
            "id": country_id,
            "name": country["name"],
            "flag": country["flag"],
            "taken": owner_id is not None,
            "occupied_by": None,
        }

        if country_id in occupations:
            entry["occupied_by"] = occupations[country_id].get("occupier")

        result.append(entry)

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

            rankings = compute_all_rankings()

            return web.json_response({
                "success": True,
                "player": serialize_player(player, rankings)
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

    rankings = compute_all_rankings()

    return web.json_response({
        "success": True,
        "player": serialize_player(player, rankings)
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

    item_id = request.query.get("category")

    if item_id not in INFRASTRUCTURE:
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

    item = INFRASTRUCTURE[item_id]
    current_level = get_infra_level(player, item_id)
    levels = item["levels"]

    if current_level >= len(levels):
        return web.json_response({
            "success": False,
            "error": "max_level",
            "message": "این زیرساخت به حداکثر سطح رسیده است."
        }, status=400)

    cost = levels[current_level]["cost"]

    if player.get("money", 0) < cost:
        return web.json_response({
            "success": False,
            "error": "not_enough_money",
            "message": "پول کافی ندارید."
        }, status=400)

    player["money"] -= cost

    player.setdefault("infra_levels", {})
    player["infra_levels"][item_id] = current_level + 1

    logging.info(
        "INFRA UPGRADED | user_id=%s | item=%s | level=%s",
        user_id, item_id, current_level + 1
    )

    rankings = compute_all_rankings()

    return web.json_response({
        "success": True,
        "player": serialize_player(player, rankings)
    })


# =========================================================
# API - ارتقای اقتصاد
# =========================================================

async def upgrade_economy(request):

    try:
        user_id = int(request.query.get("user_id"))
    except (TypeError, ValueError):
        return web.json_response(
            {"success": False, "error": "invalid_user_id"}, status=400
        )

    item_id = request.query.get("category")

    if item_id not in ECONOMY:
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

    item = ECONOMY[item_id]
    current_level = get_infra_level(player, item_id)
    levels = item["levels"]

    if current_level >= len(levels):
        return web.json_response({
            "success": False,
            "error": "max_level",
            "message": "این بخش به حداکثر سطح رسیده است."
        }, status=400)

    cost = levels[current_level]["cost"]

    if player.get("money", 0) < cost:
        return web.json_response({
            "success": False,
            "error": "not_enough_money",
            "message": "پول کافی ندارید."
        }, status=400)

    required_power = item["power_required"]
    power_used = get_power_used(player)
    power_total = get_power_total(player)

    if power_total < power_used + required_power:
        return web.json_response({
            "success": False,
            "error": "not_enough_power",
            "message": (
                f"برق کافی ندارید. نیاز به {required_power} واحد برق "
                f"دارید ولی فقط {power_total - power_used} واحد آزاد دارید."
            )
        }, status=400)

    player["money"] -= cost
    player.setdefault("infra_levels", {})
    player["infra_levels"][item_id] = current_level + 1

    logging.info(
        "ECONOMY UPGRADED | user_id=%s | item=%s | level=%s",
        user_id, item_id, current_level + 1
    )

    rankings = compute_all_rankings()

    return web.json_response({
        "success": True,
        "player": serialize_player(player, rankings)
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
    group = unit["group"]

    capacity = get_group_capacity(player, group)

    if capacity <= 0:
        group_name = {
            "land": "زمینی",
            "air": "هوایی",
            "naval": "دریایی",
        }.get(group, group)

        return web.json_response({
            "success": False,
            "error": "no_infra",
            "message": (
                f"ابتدا زیرساخت نظامی {group_name} "
                "را در بخش زیرساخت بسازید."
            )
        }, status=400)

    current_count = player.get("units", {}).get(unit_id, 0)

    if current_count >= capacity:
        return web.json_response({
            "success": False,
            "error": "capacity_full",
            "message": "ظرفیت این بخش پر است؛ زیرساخت را ارتقا دهید."
        }, status=400)

    power_total = get_power_total(player)

    if power_total < unit["power_required"]:
        return web.json_response({
            "success": False,
            "error": "not_enough_power",
            "message": (
                f"برق کافی ندارید. نیاز به {unit['power_required']} واحد."
            )
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

    player["army"] = player.get("army", 0) + 10

    logging.info(
        "UNIT TRAINED | user_id=%s | unit=%s", user_id, unit_id
    )

    rankings = compute_all_rankings()

    return web.json_response({
        "success": True,
        "player": serialize_player(player, rankings)
    })


# =========================================================
# API - اعلام جنگ
# =========================================================

async def declare_war(request):

    try:
        user_id = int(request.query.get("user_id"))
    except (TypeError, ValueError):
        return web.json_response(
            {"success": False, "error": "invalid_user_id"}, status=400
        )

    target = request.query.get("target")

    if target not in COUNTRIES:
        return web.json_response(
            {"success": False, "error": "invalid_target"}, status=400
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

    if target == from_country:
        return web.json_response({
            "success": False,
            "error": "self_war",
            "message": "نمی‌توانید به خودتان اعلام جنگ کنید."
        }, status=400)

    target_user_id, target_player = get_player_by_country(target)

    if target_user_id is None:
        return web.json_response({
            "success": False,
            "error": "no_owner",
            "message": "این کشور توسط هیچ بازیکنی کنترل نمی‌شود."
        }, status=400)

    # چک تکراری
    for w in active_wars:
        if (
            w["attacker"] == from_country and
            w["defender"] == target
        ):
            return web.json_response({
                "success": False,
                "error": "already_at_war",
                "message": "شما قبلاً به این کشور اعلام جنگ کرده‌اید."
            }, status=400)

    war_id = str(uuid.uuid4())

    active_wars.append({
        "id": war_id,
        "attacker": from_country,
        "defender": target,
        "declared_at": datetime.utcnow().isoformat(),
    })

    logging.info(
        "WAR DECLARED | %s → %s", from_country, target
    )

    return web.json_response({
        "success": True,
        "message": (
            f"⚔️ اعلام جنگ! "
            f"{COUNTRIES[from_country]['flag']} "
            f"{COUNTRIES[from_country]['name']} به "
            f"{COUNTRIES[target]['flag']} "
            f"{COUNTRIES[target]['name']} اعلام جنگ کرد."
        ),
        "war": {
            "id": war_id,
            "attacker": from_country,
            "defender": target,
        }
    })


# =========================================================
# API - حملات نظامی
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

    if attack_type not in ATTACK_TYPE_NAMES:
        return web.json_response(
            {"success": False, "error": "invalid_type"}, status=400
        )

    if user_id not in players:
        players[user_id] = create_player(user_id)

    attacker_player = players[user_id]
    attacker_country = attacker_player.get("country")

    if not attacker_country:
        return web.json_response({
            "success": False,
            "error": "no_country",
            "message": "ابتدا وارد بازی شوید."
        }, status=400)

    if target == attacker_country:
        return web.json_response({
            "success": False,
            "error": "self_attack",
            "message": "به خودتان حمله نمی‌کنید."
        }, status=400)

    # چک اعلام جنگ
    at_war = any(
        w["attacker"] == attacker_country and
        w["defender"] == target
        for w in active_wars
    )

    if not at_war:
        return web.json_response({
            "success": False,
            "error": "not_at_war",
            "message": (
                "ابتدا باید به این کشور اعلام جنگ کنید."
            )
        }, status=400)

    target_user_id, defender_player = get_player_by_country(target)

    if target_user_id is None:
        return web.json_response({
            "success": False,
            "error": "no_owner",
            "message": "این کشور توسط هیچ بازیکنی کنترل نمی‌شود."
        }, status=400)

    accrue_player(attacker_player)
    accrue_player(defender_player)

    attacker_units = attacker_player.get("units", {}).get(attack_type, 0)

    if attacker_units <= 0:
        return web.json_response({
            "success": False,
            "error": "no_units",
            "message": (
                f"شما هیچ یگان "
                f"{ATTACK_TYPE_NAMES[attack_type]}ی ندارید."
            )
        }, status=400)

    stats = ARMY_UNITS[attack_type]

    attack_power = attacker_units * stats["attack"]

    defender_units = defender_player.get("units", {})

    defense_power = 0

    for unit_type, count in defender_units.items():

        if count <= 0:
            continue

        defense_power += count * ARMY_UNITS[unit_type]["defense"]

    attacker_wins = attack_power > defense_power

    log = []

    log.append(
        f"⚔️ حمله {ATTACK_TYPE_NAMES[attack_type]} از "
        f"{COUNTRIES[attacker_country]['name']} به "
        f"{COUNTRIES[target]['name']}"
    )

    log.append(
        f"نیروی حمله: {attack_power} | "
        f"نیروی دفاع: {defense_power}"
    )

    if attacker_wins:

        # پیروزی مهاجم

        # ۳۰٪ یگان‌های مهاجم از بین می‌روند
        lost = max(1, int(attacker_units * 0.3))
        attacker_player["units"][attack_type] = max(
            0, attacker_units - lost
        )

        # همه یگان‌های مدافع از بین می‌روند
        for ut in defender_units:
            defender_player["units"][ut] = 0

        # ۴۰٪ نیروی انسانی مدافع به مهاجم
        transferred_manpower = int(defender_player.get("manpower", 0) * 0.4)

        defender_player["manpower"] = (
            defender_player.get("manpower", 0) - transferred_manpower
        )

        attacker_player["manpower"] = (
            attacker_player.get("manpower", 0) + transferred_manpower
        )

        # ۵۰٪ درآمد روزانه مدافع به مهاجم (مالیات اشغال)
        defender_rates = compute_base_rates(defender_player)
        bonus_income = int(defender_rates["net_income"] * 0.5)

        occupations[target] = {
            "occupier": attacker_country,
            "bonus": bonus_income,
            "occupied_at": datetime.utcnow().isoformat(),
        }

        log.append(
            f"🏆 {COUNTRIES[attacker_country]['name']} پیروز شد!"
        )
        log.append(
            f"💰 {transferred_manpower:,} نیروی انسانی غنیمت گرفته شد."
        )
        log.append(
            f"🏳️ {COUNTRIES[target]['name']} تحت اشغال درآمد."
        )
        log.append(
            f"📈 مالیات روزانه اضافه: ${bonus_income:,}"
        )

        # حذف از لیست جنگ‌ها
        global active_wars
        active_wars = [
            w for w in active_wars
            if not (
                w["attacker"] == attacker_country and
                w["defender"] == target
            )
        ]

    else:

        # پیروزی مدافع

        # همه یگان‌های مهاجم از بین می‌روند
        attacker_player["units"][attack_type] = 0

        # ۲۰٪ یگان‌های مدافع از بین می‌روند
        for ut in defender_units:
            if defender_units[ut] > 0:
                lost = max(1, int(defender_units[ut] * 0.2))
                defender_player["units"][ut] = max(
                    0, defender_units[ut] - lost
                )

        log.append(
            f"🛡️ {COUNTRIES[target]['name']} دفاع کرد و پیروز شد!"
        )
        log.append("یگان‌های مهاجم نابود شدند.")

    # بازیابی army power
    for p in (attacker_player, defender_player):
        total_units = sum(p.get("units", {}).values())
        p["army"] = total_units * 10

    logging.info(
        "ATTACK RESULT | %s → %s | winner=%s",
        attacker_country, target,
        attacker_country if attacker_wins else target
    )

    rankings = compute_all_rankings()

    return web.json_response({
        "success": True,
        "attacker_wins": attacker_wins,
        "log": log,
        "player": serialize_player(attacker_player, rankings),
    })


# =========================================================
# API - لیست جنگ‌های فعال
# =========================================================

async def get_wars(request):

    try:
        user_id = int(request.query.get("user_id"))
    except (TypeError, ValueError):
        return web.json_response(
            {"error": "invalid_user_id"}, status=400
        )

    if user_id not in players:
        players[user_id] = create_player(user_id)

    player = players[user_id]
    country = player.get("country")

    if not country:
        return web.json_response({
            "declared_by_me": [],
            "declared_on_me": [],
            "occupations": {},
        })

    declared_by_me = [
        w for w in active_wars if w["attacker"] == country
    ]

    declared_on_me = [
        w for w in active_wars if w["defender"] == country
    ]

    return web.json_response({
        "declared_by_me": declared_by_me,
        "declared_on_me": declared_on_me,
        "occupations": occupations,
    })


# =========================================================
# API - دیپلماسی
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
# API - رتبه‌بندی
# =========================================================

async def get_rankings(request):

    rankings = compute_all_rankings()

    result = []

    for user_id, r in rankings.items():

        player = players.get(user_id)

        if not player:
            continue

        country = player.get("country")

        if not country:
            continue

        result.append({
            "user_id": user_id,
            "country": country,
            "country_name": COUNTRIES[country]["name"],
            "country_flag": COUNTRIES[country]["flag"],
            "overall_score": round(r["overall"], 1),
            "economy": r["economy"],
            "military": r["military"],
            "diplomacy": r["diplomacy"],
            "development": r["development"],
            "overall_rank": r.get("overall_rank"),
            "economy_rank": r.get("economy_rank"),
            "military_rank": r.get("military_rank"),
            "diplomacy_rank": r.get("diplomacy_rank"),
            "development_rank": r.get("development_rank"),
        })

    result.sort(key=lambda x: x["overall_rank"] or 999)

    return web.json_response(result)


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

    app.router.add_static(
        "/images/", path="web/images", name="images"
    )

    app.router.add_get("/api/player", get_player)
    app.router.add_get("/api/countries", get_countries)
    app.router.add_get("/api/select-country", select_country)

    app.router.add_get("/api/upgrade-infra", upgrade_infra)
    app.router.add_get("/api/upgrade-economy", upgrade_economy)
    app.router.add_get("/api/train-unit", train_unit)

    app.router.add_get("/api/declare-war", declare_war)
    app.router.add_get("/api/attack", attack)
    app.router.add_get("/api/wars", get_wars)

    app.router.add_get("/api/propose-treaty", propose_treaty)
    app.router.add_get("/api/diplomacy", get_diplomacy)

    app.router.add_get("/api/rankings", get_rankings)
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
