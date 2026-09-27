import os
import uuid
import logging
from datetime import datetime, timedelta

from aiohttp import web
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from dotenv import load_dotenv

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
WEB_APP_URL = "https://ww2-telegram-game.onrender.com"

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

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

STARTING_MONEY = 10_000_000
STARTING_MANPOWER = 3_000
BASE_DAILY_INCOME = 100_000
BASE_MANPOWER_PRODUCTION = 50
GAME_TOTAL_DAYS = 31
DAYS_PER_SEASON = 2
SEASONS = ["بهار", "تابستان", "پاییز", "زمستان"]

# -----------------------------------------------------------------------------
# برق: 7 نوع، هرکدام 5 سطح
# capacity = تولید برق، power_use = مصرف برق هنگام ساخت
# -----------------------------------------------------------------------------
POWER_BUILDINGS = {
    "coal_plant": {
        "name": "نیروگاه زغال‌سنگ", "icon": "🏭",
        "levels": [
            {"cost": 350_000, "capacity": 18}, {"cost": 850_000, "capacity": 38},
            {"cost": 1_900_000, "capacity": 70}, {"cost": 4_200_000, "capacity": 118},
            {"cost": 8_500_000, "capacity": 185},
        ]
    },
    "hydro_plant": {
        "name": "نیروگاه آبی", "icon": "💧",
        "levels": [
            {"cost": 900_000, "capacity": 28}, {"cost": 2_000_000, "capacity": 58},
            {"cost": 4_000_000, "capacity": 98}, {"cost": 7_500_000, "capacity": 150},
            {"cost": 13_000_000, "capacity": 225},
        ]
    },
    "oil_plant": {
        "name": "نیروگاه نفتی", "icon": "🛢️",
        "levels": [
            {"cost": 600_000, "capacity": 24}, {"cost": 1_450_000, "capacity": 50},
            {"cost": 3_100_000, "capacity": 82}, {"cost": 6_300_000, "capacity": 128},
            {"cost": 11_500_000, "capacity": 190},
        ]
    },
    "gas_plant": {
        "name": "نیروگاه گازی", "icon": "🔥",
        "levels": [
            {"cost": 1_100_000, "capacity": 35}, {"cost": 2_600_000, "capacity": 68},
            {"cost": 5_000_000, "capacity": 108}, {"cost": 9_000_000, "capacity": 160},
            {"cost": 15_500_000, "capacity": 235},
        ]
    },
    "wind_farm": {
        "name": "مزرعه بادی", "icon": "🌬️",
        "levels": [
            {"cost": 1_400_000, "capacity": 22}, {"cost": 3_000_000, "capacity": 48},
            {"cost": 6_000_000, "capacity": 82}, {"cost": 10_500_000, "capacity": 125},
            {"cost": 18_000_000, "capacity": 180},
        ]
    },
    "solar_station": {
        "name": "نیروگاه خورشیدی", "icon": "☀️",
        "levels": [
            {"cost": 1_800_000, "capacity": 20}, {"cost": 4_000_000, "capacity": 45},
            {"cost": 7_500_000, "capacity": 78}, {"cost": 13_000_000, "capacity": 120},
            {"cost": 22_000_000, "capacity": 175},
        ]
    },
    "nuclear_plant": {
        "name": "مجتمع هسته‌ای", "icon": "☢️",
        "levels": [
            {"cost": 8_000_000, "capacity": 55}, {"cost": 15_000_000, "capacity": 115},
            {"cost": 28_000_000, "capacity": 190}, {"cost": 48_000_000, "capacity": 300},
            {"cost": 80_000_000, "capacity": 450},
        ]
    },
}

# -----------------------------------------------------------------------------
# نیروی انسانی: 6 نوع، 5 سطح
# production = نیروی انسانی روزانه
# -----------------------------------------------------------------------------
MANPOWER_BUILDINGS = {
    "training_center": {"name": "مرکز آموزش", "icon": "🎓", "levels": [
        {"cost": 250_000, "production": 100}, {"cost": 650_000, "production": 230},
        {"cost": 1_500_000, "production": 430}, {"cost": 3_200_000, "production": 720},
        {"cost": 6_500_000, "production": 1_150},
    ]},
    "civil_registry": {"name": "اداره نیروی کار", "icon": "📋", "levels": [
        {"cost": 180_000, "production": 70}, {"cost": 480_000, "production": 155},
        {"cost": 1_100_000, "production": 280}, {"cost": 2_400_000, "production": 470},
        {"cost": 5_000_000, "production": 760},
    ]},
    "medical_center": {"name": "مرکز درمانی", "icon": "🏥", "levels": [
        {"cost": 400_000, "production": 80}, {"cost": 1_000_000, "production": 180},
        {"cost": 2_200_000, "production": 330}, {"cost": 4_500_000, "production": 540},
        {"cost": 8_500_000, "production": 850},
    ]},
    "university": {"name": "دانشگاه فنی", "icon": "🏛️", "levels": [
        {"cost": 900_000, "production": 90}, {"cost": 2_100_000, "production": 210},
        {"cost": 4_800_000, "production": 390}, {"cost": 9_000_000, "production": 620},
        {"cost": 16_000_000, "production": 980},
    ]},
    "housing": {"name": "مجتمع مسکونی", "icon": "🏘️", "levels": [
        {"cost": 500_000, "production": 120}, {"cost": 1_200_000, "production": 260},
        {"cost": 2_800_000, "production": 460}, {"cost": 5_500_000, "production": 760},
        {"cost": 10_000_000, "production": 1_150},
    ]},
    "recruitment_office": {"name": "مرکز سربازگیری", "icon": "🪖", "levels": [
        {"cost": 300_000, "production": 140}, {"cost": 800_000, "production": 320},
        {"cost": 1_900_000, "production": 570}, {"cost": 4_000_000, "production": 900},
        {"cost": 7_500_000, "production": 1_400},
    ]},
}

# -----------------------------------------------------------------------------
# زیرساخت نظامی: 6 نوع، 5 سطح
# capacity = ظرفیت یگان مرتبط
# power_use = مصرف برق ظرفیت فعال
# -----------------------------------------------------------------------------
MILITARY_INFRA = {
    "barracks": {"name": "پادگان", "icon": "🏠", "levels": [
        {"cost": 300_000, "capacity": 5, "power_use": 2}, {"cost": 850_000, "capacity": 12, "power_use": 4},
        {"cost": 2_000_000, "capacity": 22, "power_use": 7}, {"cost": 4_500_000, "capacity": 38, "power_use": 11},
        {"cost": 8_500_000, "capacity": 60, "power_use": 16},
    ]},
    "command_hq": {"name": "ستاد فرماندهی", "icon": "🎖️", "levels": [
        {"cost": 700_000, "capacity": 1, "power_use": 3}, {"cost": 1_800_000, "capacity": 2, "power_use": 6},
        {"cost": 4_000_000, "capacity": 3, "power_use": 10}, {"cost": 8_000_000, "capacity": 5, "power_use": 15},
        {"cost": 15_000_000, "capacity": 8, "power_use": 22},
    ]},
    "port": {"name": "بندر", "icon": "⚓", "levels": [
        {"cost": 500_000, "capacity": 3, "power_use": 3}, {"cost": 1_400_000, "capacity": 8, "power_use": 6},
        {"cost": 3_300_000, "capacity": 15, "power_use": 10}, {"cost": 7_000_000, "capacity": 25, "power_use": 15},
        {"cost": 13_000_000, "capacity": 40, "power_use": 22},
    ]},
    "shipyard": {"name": "کارخانه کشتی‌سازی", "icon": "🚢", "levels": [
        {"cost": 800_000, "capacity": 2, "power_use": 5}, {"cost": 2_000_000, "capacity": 5, "power_use": 9},
        {"cost": 4_800_000, "capacity": 10, "power_use": 15}, {"cost": 10_000_000, "capacity": 18, "power_use": 23},
        {"cost": 20_000_000, "capacity": 30, "power_use": 34},
    ]},
    "airport": {"name": "فرودگاه", "icon": "✈️", "levels": [
        {"cost": 600_000, "capacity": 3, "power_use": 4}, {"cost": 1_700_000, "capacity": 8, "power_use": 8},
        {"cost": 4_000_000, "capacity": 15, "power_use": 13}, {"cost": 8_500_000, "capacity": 25, "power_use": 20},
        {"cost": 16_000_000, "capacity": 42, "power_use": 30},
    ]},
    "air_base": {"name": "پایگاه تجهیزات هوایی", "icon": "🛩️", "levels": [
        {"cost": 1_000_000, "capacity": 2, "power_use": 6}, {"cost": 2_500_000, "capacity": 5, "power_use": 11},
        {"cost": 5_500_000, "capacity": 10, "power_use": 18}, {"cost": 11_000_000, "capacity": 18, "power_use": 28},
        {"cost": 22_000_000, "capacity": 30, "power_use": 42},
    ]},
}

# -----------------------------------------------------------------------------
# اقتصاد: 10 نوع، 5 سطح. هزینه و درآمد عمداً یکنواخت نیست.
# power_use = برق موردنیاز سطح فعال
# -----------------------------------------------------------------------------
ECONOMIC_BUILDINGS = {
    "factory": {"name": "کارخانه صنعتی", "icon": "🏭", "levels": [
        {"cost": 450_000, "income": 22_000, "power_use": 5}, {"cost": 1_200_000, "income": 48_000, "power_use": 9},
        {"cost": 3_500_000, "income": 83_000, "power_use": 15}, {"cost": 8_000_000, "income": 135_000, "power_use": 23},
        {"cost": 17_000_000, "income": 210_000, "power_use": 34},
    ]},
    "steel_mill": {"name": "کارخانه فولاد", "icon": "🔩", "levels": [
        {"cost": 1_200_000, "income": 34_000, "power_use": 8}, {"cost": 3_000_000, "income": 70_000, "power_use": 14},
        {"cost": 7_000_000, "income": 118_000, "power_use": 22}, {"cost": 15_000_000, "income": 180_000, "power_use": 33},
        {"cost": 30_000_000, "income": 265_000, "power_use": 48},
    ]},
    "oil_refinery": {"name": "پالایشگاه نفت", "icon": "🛢️", "levels": [
        {"cost": 2_000_000, "income": 38_000, "power_use": 9}, {"cost": 5_000_000, "income": 76_000, "power_use": 16},
        {"cost": 11_000_000, "income": 126_000, "power_use": 25}, {"cost": 23_000_000, "income": 195_000, "power_use": 38},
        {"cost": 45_000_000, "income": 290_000, "power_use": 55},
    ]},
    "agriculture": {"name": "مجتمع کشاورزی", "icon": "🌾", "levels": [
        {"cost": 300_000, "income": 19_000, "power_use": 2}, {"cost": 800_000, "income": 43_000, "power_use": 4},
        {"cost": 2_000_000, "income": 72_000, "power_use": 7}, {"cost": 4_500_000, "income": 112_000, "power_use": 11},
        {"cost": 9_000_000, "income": 170_000, "power_use": 16},
    ]},
    "railway": {"name": "شبکه راه‌آهن", "icon": "🚆", "levels": [
        {"cost": 1_000_000, "income": 16_000, "power_use": 4}, {"cost": 2_700_000, "income": 38_000, "power_use": 8},
        {"cost": 6_500_000, "income": 67_000, "power_use": 14}, {"cost": 14_000_000, "income": 105_000, "power_use": 22},
        {"cost": 28_000_000, "income": 155_000, "power_use": 34},
    ]},
    "trade_hub": {"name": "مرکز تجاری", "icon": "🏦", "levels": [
        {"cost": 1_500_000, "income": 31_000, "power_use": 4}, {"cost": 3_800_000, "income": 65_000, "power_use": 7},
        {"cost": 9_000_000, "income": 108_000, "power_use": 12}, {"cost": 19_000_000, "income": 164_000, "power_use": 18},
        {"cost": 38_000_000, "income": 235_000, "power_use": 27},
    ]},
    "textile": {"name": "کارخانه نساجی", "icon": "🧵", "levels": [
        {"cost": 250_000, "income": 14_000, "power_use": 3}, {"cost": 700_000, "income": 34_000, "power_use": 6},
        {"cost": 1_800_000, "income": 58_000, "power_use": 10}, {"cost": 4_000_000, "income": 91_000, "power_use": 15},
        {"cost": 8_000_000, "income": 135_000, "power_use": 22},
    ]},
    "arms_factory": {"name": "کارخانه تسلیحات", "icon": "⚙️", "levels": [
        {"cost": 2_500_000, "income": 27_000, "power_use": 12}, {"cost": 6_000_000, "income": 55_000, "power_use": 20},
        {"cost": 13_000_000, "income": 92_000, "power_use": 31}, {"cost": 27_000_000, "income": 145_000, "power_use": 46},
        {"cost": 55_000_000, "income": 215_000, "power_use": 68},
    ]},
    "ship_trade": {"name": "پایانه بازرگانی دریایی", "icon": "⚓", "levels": [
        {"cost": 1_800_000, "income": 28_000, "power_use": 6}, {"cost": 4_500_000, "income": 58_000, "power_use": 11},
        {"cost": 10_000_000, "income": 97_000, "power_use": 18}, {"cost": 21_000_000, "income": 150_000, "power_use": 27},
        {"cost": 42_000_000, "income": 220_000, "power_use": 40},
    ]},
    "research": {"name": "مرکز پژوهش و فناوری", "icon": "🔬", "levels": [
        {"cost": 3_000_000, "income": 20_000, "power_use": 8}, {"cost": 7_000_000, "income": 43_000, "power_use": 14},
        {"cost": 15_000_000, "income": 75_000, "power_use": 23}, {"cost": 31_000_000, "income": 120_000, "power_use": 35},
        {"cost": 65_000_000, "income": 185_000, "power_use": 52},
    ]},
}

ARMY_UNITS = {
    "land": {"name": "گردان زمینی", "infra": "barracks", "cost": 50_000, "manpower": 300, "power_required": 5, "army_power": 15},
    "air": {"name": "اسکادران هوایی", "infra": "airport", "cost": 200_000, "manpower": 150, "power_required": 15, "army_power": 40},
    "navy": {"name": "ناو دریایی", "infra": "port", "cost": 250_000, "manpower": 200, "power_required": 15, "army_power": 35},
}

TREATY_TYPE_NAMES = {"alliance": "پیمان اتحاد", "non_aggression": "پیمان عدم تجاوز"}
ATTACK_TYPE_NAMES = {"land": "زمینی", "air": "هوایی", "navy": "دریایی"}

# سازگاری با نسخه قبلی: نام INFRASTRUCTURE همچنان برای فرانت قبلی قابل استفاده است.
INFRASTRUCTURE = {**{
    k: {"name": v["name"], "levels": v["levels"]} for k, v in POWER_BUILDINGS.items()
}, **{
    k: {"name": v["name"], "levels": v["levels"]} for k, v in MANPOWER_BUILDINGS.items()
}, **{
    k: {"name": v["name"], "levels": v["levels"]} for k, v in MILITARY_INFRA.items()
}}

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
        "economy_levels": {},
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


def get_game_time(player):
    started_at = player.get("started_at")
    if not started_at:
        return {"day": 1, "season": SEASONS[0], "season_days_left": DAYS_PER_SEASON, "season_hours_left": 0, "next_season": SEASONS[1]}
    started = datetime.fromisoformat(started_at)
    now = datetime.utcnow()
    elapsed_days_float = max(0, (now - started).total_seconds() / 86400)
    day = min(GAME_TOTAL_DAYS, int(elapsed_days_float) + 1)
    season_index = ((day - 1) // DAYS_PER_SEASON) % len(SEASONS)
    season_end = min(started + timedelta(days=(season_index + 1) * DAYS_PER_SEASON), started + timedelta(days=GAME_TOTAL_DAYS))
    remaining = max(timedelta(0), season_end - now)
    return {"day": day, "season": SEASONS[season_index], "season_days_left": remaining.days, "season_hours_left": remaining.seconds // 3600, "next_season": SEASONS[(season_index + 1) % len(SEASONS)]}


def level_info(table, key, level):
    if level <= 0 or key not in table:
        return None
    levels = table[key]["levels"]
    return levels[min(level, len(levels)) - 1]


def get_infra_level(player, category):
    return int(player.get("infra_levels", {}).get(category, 0))


def total_power_capacity(player):
    total = 0
    for key in POWER_BUILDINGS:
        info = level_info(POWER_BUILDINGS, key, get_infra_level(player, key))
        if info:
            total += info["capacity"]
    return total


def total_power_used(player):
    used = 0
    for table in (ECONOMIC_BUILDINGS, MILITARY_INFRA):
        for key, data in table.items():
            level = int((player.get("economy_levels") if table is ECONOMIC_BUILDINGS else player.get("infra_levels", {})).get(key, 0))
            info = level_info(table, key, level)
            if info:
                used += info.get("power_use", 0)
    return used


def total_economy_income(player):
    total = BASE_DAILY_INCOME
    for key in ECONOMIC_BUILDINGS:
        info = level_info(ECONOMIC_BUILDINGS, key, player.get("economy_levels", {}).get(key, 0))
        if info:
            total += info.get("income", 0)
    return total


def total_manpower_production(player):
    total = BASE_MANPOWER_PRODUCTION
    for key in MANPOWER_BUILDINGS:
        info = level_info(MANPOWER_BUILDINGS, key, get_infra_level(player, key))
        if info:
            total += info.get("production", 0)
    return total


def compute_rates(player):
    capacity = total_power_capacity(player)
    used = total_power_used(player)
    return {
        "gross_income": total_economy_income(player),
        "net_income": total_economy_income(player),
        "power_capacity": capacity,
        "power_used": used,
        "power_available": max(0, capacity - used),
        "manpower_production": total_manpower_production(player),
    }


def expire_player_treaties(player):
    global active_treaties
    now = datetime.utcnow()
    active_treaties = [t for t in active_treaties if datetime.fromisoformat(t["expires_at"]) > now]


def accrue_player(player):
    if not player.get("started_at"):
        return
    now = datetime.utcnow()
    last = datetime.fromisoformat(player.get("last_update") or player["started_at"])
    elapsed_seconds = max(0, (now - last).total_seconds())
    rates = compute_rates(player)
    fraction = elapsed_seconds / 86400
    player["money"] = player.get("money", STARTING_MONEY) + rates["net_income"] * fraction
    player["manpower"] = player.get("manpower", STARTING_MANPOWER) + rates["manpower_production"] * fraction
    player["last_update"] = now.isoformat()
    expire_player_treaties(player)


def serialize_table(table, levels):
    result = {}
    for key, data in table.items():
        level = int(levels.get(key, 0))
        next_level = level + 1
        result[key] = {
            "id": key,
            "name": data["name"],
            "icon": data.get("icon", "🏗️"),
            "level": level,
            "max_level": len(data["levels"]),
            "current": level_info(table, key, level),
            "next": level_info(table, key, next_level),
        }
    return result


def get_infra_status(player):
    power = serialize_table(POWER_BUILDINGS, player.get("infra_levels", {}))
    manpower = serialize_table(MANPOWER_BUILDINGS, player.get("infra_levels", {}))
    military = serialize_table(MILITARY_INFRA, player.get("infra_levels", {}))
    # سازگاری با app.js قبلی
    legacy = {}
    for key, data in {**POWER_BUILDINGS, **MANPOWER_BUILDINGS, **MILITARY_INFRA}.items():
        level = get_infra_level(player, key)
        legacy[key] = {"name": data["name"], "level": level, "max_level": len(data["levels"]), "current": level_info({key:data}, key, level), "next": level_info({key:data}, key, level + 1)}
    legacy["power"] = {"name": "برق", "level": max([get_infra_level(player,k) for k in POWER_BUILDINGS], default=0), "max_level": 5, "current": {"capacity": total_power_capacity(player)} if total_power_capacity(player) else None, "next": None}
    legacy["manpower_camp"] = {"name": "نیروی انسانی", "level": max([get_infra_level(player,k) for k in MANPOWER_BUILDINGS], default=0), "max_level": 5, "current": {"production": total_manpower_production(player) - BASE_MANPOWER_PRODUCTION}, "next": None}
    return {"power": power, "manpower": manpower, "military": military, **legacy}


def serialize_player(player):
    accrue_player(player)
    rates = compute_rates(player)
    data = dict(player)
    data.update(get_game_time(player))
    data["money"] = round(data["money"], 2)
    data["manpower"] = round(data["manpower"], 2)
    data["power_capacity"] = rates["power_capacity"]
    data["power_used"] = rates["power_used"]
    data["power_available"] = rates["power_available"]
    data["manpower_production"] = rates["manpower_production"]
    data["daily_income"] = rates["net_income"]
    data["infra"] = get_infra_status(player)
    data["economy"] = serialize_table(ECONOMIC_BUILDINGS, player.get("economy_levels", {}))
    return data


bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

@dp.message(Command("start"))
async def start_command(message: types.Message):
    user_id = message.from_user.id
    logging.info("USER STARTED BOT | user_id=%s | username=%s", user_id, message.from_user.username)
    players.setdefault(user_id, create_player(user_id))
    keyboard = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="🌍 ورود به بازی", web_app=WebAppInfo(url=WEB_APP_URL))]])
    p = players[user_id]
    if p["country"]:
        c = COUNTRIES[p["country"]]
        text = f"⚔️ به جنگ جهانی دوم خوش آمدید.\n\nکشور شما: {c['flag']} {c['name']}\n\nبرای ورود به فرماندهی روی دکمه زیر بزنید."
    else:
        text = "⚔️ به جنگ جهانی دوم خوش آمدید.\n\nسال ۱۹۳۹ است.\nسرنوشت کشورها در دستان فرماندهان است.\n\nابتدا وارد بازی شوید و کشور خود را انتخاب کنید."
    await message.answer(text, reply_markup=keyboard)

@dp.callback_query(F.data.startswith("treaty:"))
async def handle_treaty_callback(callback: types.CallbackQuery):
    _, action, proposal_id = callback.data.split(":")
    proposal = diplomacy_proposals.get(proposal_id)
    if not proposal or proposal["status"] != "pending":
        await callback.answer("این پیشنهاد دیگر معتبر نیست."); return
    if callback.from_user.id != proposal["to_user"]:
        await callback.answer("این پیشنهاد برای شما نیست."); return
    type_name = TREATY_TYPE_NAMES.get(proposal["treaty_type"], proposal["treaty_type"])
    if action == "accept":
        proposal["status"] = "accepted"
        active_treaties.append({"id": str(uuid.uuid4()), "country_a": proposal["from_country"], "country_b": proposal["to_country"], "treaty_type": proposal["treaty_type"], "expires_at": (datetime.utcnow() + timedelta(days=proposal["duration_days"])).isoformat()})
        await callback.message.edit_text(f"✅ {type_name} پذیرفته شد.")
        try:
            await bot.send_message(proposal["from_user"], f"✅ {COUNTRIES[proposal['to_country']]['name']} {type_name} شما را پذیرفت.")
        except Exception as error: logging.warning("Failed to notify proposer: %s", error)
    else:
        proposal["status"] = "rejected"
        await callback.message.edit_text(f"❌ {type_name} رد شد.")
        try:
            await bot.send_message(proposal["from_user"], f"❌ {COUNTRIES[proposal['to_country']]['name']} {type_name} شما را رد کرد.")
        except Exception as error: logging.warning("Failed to notify proposer: %s", error)
    await callback.answer()

async def get_player(request):
    try: user_id = int(request.query.get("user_id"))
    except (TypeError, ValueError): return web.json_response({"error":"invalid_user_id"}, status=400)
    players.setdefault(user_id, create_player(user_id))
    return web.json_response(serialize_player(players[user_id]))

async def get_countries(request):
    result=[]
    for country_id, country in COUNTRIES.items():
        owner_id,_=get_player_by_country(country_id)
        result.append({"id":country_id,"name":country["name"],"flag":country["flag"],"taken":owner_id is not None})
    return web.json_response(result)

async def select_country(request):
    try: user_id=int(request.query.get("user_id"))
    except (TypeError,ValueError): return web.json_response({"success":False,"error":"invalid_user_id"},status=400)
    country_id=request.query.get("country")
    if country_id not in COUNTRIES: return web.json_response({"success":False,"error":"invalid_country","message":"کشور انتخاب شده معتبر نیست."},status=400)
    players.setdefault(user_id,create_player(user_id)); player=players[user_id]
    if player["country"]:
        if player["country"]==country_id: return web.json_response({"success":True,"player":serialize_player(player)})
        return web.json_response({"success":False,"error":"already_has_country","message":"شما قبلاً یک کشور انتخاب کرده‌اید."},status=409)
    owner_id,_=get_player_by_country(country_id)
    if owner_id is not None and owner_id!=user_id: return web.json_response({"success":False,"error":"country_taken","message":"این کشور قبلاً توسط بازیکن دیگری انتخاب شده است."},status=409)
    player["country"]=country_id
    now=datetime.utcnow().isoformat(); player["started_at"]=now; player["last_update"]=now
    logging.info("PLAYER ENTERED GAME | user_id=%s | country=%s",user_id,country_id)
    return web.json_response({"success":True,"player":serialize_player(player)})

async def upgrade_infra(request):
    try: user_id=int(request.query.get("user_id"))
    except (TypeError,ValueError): return web.json_response({"success":False,"error":"invalid_user_id"},status=400)
    category=request.query.get("category")
    if category in POWER_BUILDINGS: table=POWER_BUILDINGS
    elif category in MANPOWER_BUILDINGS: table=MANPOWER_BUILDINGS
    elif category in MILITARY_INFRA: table=MILITARY_INFRA
    else: return web.json_response({"success":False,"error":"invalid_category"},status=400)
    players.setdefault(user_id,create_player(user_id)); player=players[user_id]
    if not player.get("country"): return web.json_response({"success":False,"error":"no_country","message":"ابتدا وارد بازی شوید."},status=400)
    accrue_player(player); level=int(player.get("infra_levels",{}).get(category,0)); levels=table[category]["levels"]
    if level>=len(levels): return web.json_response({"success":False,"error":"max_level","message":"این بخش به حداکثر سطح رسیده است."},status=400)
    nxt=levels[level]; cost=nxt["cost"]
    if player["money"]<cost: return web.json_response({"success":False,"error":"not_enough_money","message":"پول کافی ندارید."},status=400)
    if nxt.get("power_use",0)>0 and category not in POWER_BUILDINGS:
        if total_power_capacity(player)-total_power_used(player)<nxt["power_use"]:
            return web.json_response({"success":False,"error":"not_enough_power","message":"ظرفیت برق کافی نیست. ابتدا تولید برق را افزایش دهید."},status=400)
    player["money"]-=cost; player.setdefault("infra_levels",{})[category]=level+1
    return web.json_response({"success":True,"player":serialize_player(player)})

async def upgrade_economy(request):
    try: user_id=int(request.query.get("user_id"))
    except (TypeError,ValueError): return web.json_response({"success":False,"error":"invalid_user_id"},status=400)
    category=request.query.get("category")
    if category not in ECONOMIC_BUILDINGS: return web.json_response({"success":False,"error":"invalid_category","message":"ساختمان اقتصادی معتبر نیست."},status=400)
    players.setdefault(user_id,create_player(user_id)); player=players[user_id]
    if not player.get("country"): return web.json_response({"success":False,"error":"no_country","message":"ابتدا وارد بازی شوید."},status=400)
    accrue_player(player); level=int(player.get("economy_levels",{}).get(category,0)); levels=ECONOMIC_BUILDINGS[category]["levels"]
    if level>=len(levels): return web.json_response({"success":False,"error":"max_level","message":"این ساختمان به حداکثر سطح رسیده است."},status=400)
    nxt=levels[level]; cost=nxt["cost"]
    if player["money"]<cost: return web.json_response({"success":False,"error":"not_enough_money","message":"پول کافی ندارید."},status=400)
    if total_power_capacity(player)-total_power_used(player)<nxt.get("power_use",0): return web.json_response({"success":False,"error":"not_enough_power","message":"برق کافی ندارید. ابتدا زیرساخت برق را توسعه دهید."},status=400)
    player["money"]-=cost; player.setdefault("economy_levels",{})[category]=level+1
    return web.json_response({"success":True,"player":serialize_player(player)})

async def train_unit(request):
    try: user_id=int(request.query.get("user_id"))
    except (TypeError,ValueError): return web.json_response({"success":False,"error":"invalid_user_id"},status=400)
    unit_id=request.query.get("unit_id")
    if unit_id not in ARMY_UNITS: return web.json_response({"success":False,"error":"invalid_unit"},status=400)
    players.setdefault(user_id,create_player(user_id)); player=players[user_id]
    if not player.get("country"): return web.json_response({"success":False,"error":"no_country","message":"ابتدا وارد بازی شوید."},status=400)
    accrue_player(player); unit=ARMY_UNITS[unit_id]; infra=unit["infra"]; level=get_infra_level(player,infra)
    if level<=0: return web.json_response({"success":False,"error":"no_infra","message":f"ابتدا {MILITARY_INFRA[infra]['name']} را بسازید."},status=400)
    info=level_info(MILITARY_INFRA,infra,level); capacity=info["capacity"]; count=player.get("units",{}).get(unit_id,0)
    if count>=capacity: return web.json_response({"success":False,"error":"capacity_full","message":"ظرفیت این بخش پر است."},status=400)
    if compute_rates(player)["power_available"]<unit["power_required"]: return web.json_response({"success":False,"error":"not_enough_power","message":"ظرفیت برق کافی نیست."},status=400)
    if player["money"]<unit["cost"]: return web.json_response({"success":False,"error":"not_enough_money","message":"پول کافی ندارید."},status=400)
    if player["manpower"]<unit["manpower"]: return web.json_response({"success":False,"error":"not_enough_manpower","message":"نیروی انسانی کافی ندارید."},status=400)
    player["money"]-=unit["cost"]; player["manpower"]-=unit["manpower"]; player.setdefault("units",{"land":0,"air":0,"navy":0}); player["units"][unit_id]=count+1; player["army"]=player.get("army",0)+unit["army_power"]
    return web.json_response({"success":True,"player":serialize_player(player)})

async def attack(request):
    try: user_id=int(request.query.get("user_id"))
    except (TypeError,ValueError): return web.json_response({"success":False,"error":"invalid_user_id"},status=400)
    target=request.query.get("target"); attack_type=request.query.get("type","land")
    if target not in COUNTRIES: return web.json_response({"success":False,"error":"invalid_target"},status=400)
    players.setdefault(user_id,create_player(user_id)); player=players[user_id]
    if not player.get("country"): return web.json_response({"success":False,"error":"no_country","message":"ابتدا وارد بازی شوید."},status=400)
    if target==player["country"]: return web.json_response({"success":False,"error":"self_attack"},status=400)
    return web.json_response({"success":True,"message":f"عملیات {ATTACK_TYPE_NAMES.get(attack_type,attack_type)} علیه {COUNTRIES[target]['name']} آغاز شد."})

async def propose_treaty(request):
    try: user_id=int(request.query.get("user_id"))
    except (TypeError,ValueError): return web.json_response({"success":False,"error":"invalid_user_id"},status=400)
    target=request.query.get("target"); treaty_type=request.query.get("type")
    try: duration=max(1,min(int(request.query.get("duration_days","10")),30))
    except (TypeError,ValueError): duration=10
    if target not in COUNTRIES or treaty_type not in TREATY_TYPE_NAMES: return web.json_response({"success":False,"error":"invalid_request"},status=400)
    players.setdefault(user_id,create_player(user_id)); player=players[user_id]; from_country=player.get("country")
    if not from_country: return web.json_response({"success":False,"error":"no_country","message":"ابتدا وارد بازی شوید."},status=400)
    if target==from_country: return web.json_response({"success":False,"error":"self_proposal"},status=400)
    target_user,_=get_player_by_country(target)
    if target_user is None: return web.json_response({"success":False,"error":"country_unowned","message":"این کشور هنوز بازیکن ندارد."},status=400)
    proposal_id=str(uuid.uuid4()); diplomacy_proposals[proposal_id]={"id":proposal_id,"from_user":user_id,"from_country":from_country,"to_user":target_user,"to_country":target,"treaty_type":treaty_type,"duration_days":duration,"status":"pending","created_at":datetime.utcnow().isoformat()}
    keyboard=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="✅ قبول",callback_data=f"treaty:accept:{proposal_id}"),InlineKeyboardButton(text="❌ رد",callback_data=f"treaty:reject:{proposal_id}")]])
    try:
        await bot.send_message(target_user,f"📜 پیشنهاد {TREATY_TYPE_NAMES[treaty_type]}\n\nکشور {COUNTRIES[from_country]['name']} به شما پیشنهاد {TREATY_TYPE_NAMES[treaty_type]} به مدت {duration} روز داده است.",reply_markup=keyboard)
    except Exception:
        return web.json_response({"success":False,"error":"message_failed","message":"ارسال پیام به بازیکن مقابل ممکن نشد."},status=400)
    return web.json_response({"success":True,"message":"پیشنهاد ارسال شد و منتظر تأیید طرف مقابل است."})

async def get_diplomacy(request):
    try: user_id=int(request.query.get("user_id"))
    except (TypeError,ValueError): return web.json_response({"error":"invalid_user_id"},status=400)
    players.setdefault(user_id,create_player(user_id)); player=players[user_id]; accrue_player(player); country=player.get("country")
    return web.json_response({"sent":[p for p in diplomacy_proposals.values() if p["from_user"]==user_id and p["status"]=="pending"],"received":[p for p in diplomacy_proposals.values() if p["to_user"]==user_id and p["status"]=="pending"],"treaties":[t for t in active_treaties if country and (t["country_a"]==country or t["country_b"]==country)]})

async def get_news(request):
    return web.json_response([
        {"title":"سال ۱۹۳۹","text":"اروپا در آستانه یک بحران بزرگ قرار دارد. تصمیمات فرماندهان سرنوشت جهان را تغییر خواهد داد."},
        {"title":"فرماندهی آغاز شد","text":"کشور خود را انتخاب کنید و برای توسعه اقتصاد، ارتش و روابط خارجی آماده شوید."},
    ])

async def health(request): return web.json_response({"status":"ok"})
async def index(request): return web.FileResponse(os.path.join("web","index.html"))
async def style(request): return web.FileResponse(os.path.join("web","style.css"))
async def app_js(request): return web.FileResponse(os.path.join("web","app.js"))

async def create_web_app():
    app=web.Application()
    app.router.add_get("/",index); app.router.add_get("/style.css",style); app.router.add_get("/app.js",app_js)
    app.router.add_static("/images/",path="web/images",name="images")
    app.router.add_get("/api/player",get_player); app.router.add_get("/api/countries",get_countries); app.router.add_get("/api/select-country",select_country)
    app.router.add_get("/api/upgrade-infra",upgrade_infra); app.router.add_get("/api/upgrade-economy",upgrade_economy); app.router.add_get("/api/train-unit",train_unit); app.router.add_get("/api/attack",attack)
    app.router.add_get("/api/propose-treaty",propose_treaty); app.router.add_get("/api/diplomacy",get_diplomacy); app.router.add_get("/api/news",get_news); app.router.add_get("/health",health)
    return app

async def start_web_server():
    app=await create_web_app(); runner=web.AppRunner(app); await runner.setup(); port=int(os.getenv("PORT","10000")); site=web.TCPSite(runner,"0.0.0.0",port); await site.start(); logging.info("WEB SERVER STARTED | port=%s",port)

async def main():
    logging.info("WW2 TELEGRAM GAME STARTING..."); await start_web_server(); logging.info("BOT POLLING STARTED"); await dp.start_polling(bot)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
