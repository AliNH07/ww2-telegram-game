import os
import json
import hmac
import hashlib
import uuid
import logging
import random
from datetime import datetime, timezone, timedelta
from urllib.parse import parse_qsl

from aiohttp import web
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from dotenv import load_dotenv


# =========================================================
# تنظیمات
# =========================================================

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
WEB_APP_URL = os.getenv("WEB_APP_URL", "https://ww2-telegram-game.onrender.com")
ADMIN_ID = int(os.getenv("ADMIN_ID", "0"))
AUTH_REQUIRED = os.getenv("AUTH_REQUIRED", "0") == "1"   # در رندر 1 کن
DATA_DIR = os.getenv("DATA_DIR", "data")
STATE_FILE = os.path.join(DATA_DIR, "state.json")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)


# =========================================================
# داده‌های پایه
# =========================================================

COUNTRIES = {
    "germany": {"name": "آلمان", "flag": "🇩🇪"},
    "britain": {"name": "بریتانیا", "flag": "🇬🇧"},
    "ussr":    {"name": "شوروی", "flag": "☭"},
    "usa":     {"name": "آمریکا", "flag": "🇺🇸"},
    "france":  {"name": "فرانسه", "flag": "🇫🇷"},
    "italy":   {"name": "ایتالیا", "flag": "🇮🇹"},
    "china":   {"name": "چین", "flag": "🇨🇳"},
    "japan":   {"name": "ژاپن", "flag": "🇯🇵"},
}

STARTING_MONEY = 10_000_000
STARTING_MANPOWER = 50_000
BASE_DAILY_INCOME = 100_000
BASE_MANPOWER_PRODUCTION = 500

GAME_TOTAL_DAYS = 31
DAYS_PER_SEASON = 7
SEASONS = ["بهار", "تابستان", "پاییز", "زمستان"]

STARTING_RESOURCES = {
    "food": 150_000,
    "steel": 150_000,
    "uranium": 150_000,
    "oil": 150_000,
}

RESOURCE_NAMES = {
    "food": "غذا",
    "steel": "فولاد",
    "uranium": "اورانیوم",
    "oil": "نفت",
}

GROUP_NAMES = {
    "land": "زمینی",
    "naval": "دریایی",
    "air": "هوایی",
    "power": "برق",
    "manpower": "نیروی انسانی",
    "resource": "منابع",
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
# زیرساخت‌ها
# =========================================================

INFRASTRUCTURE = {

    # ------------------ برق ------------------
    "power_coal":      {"name": "نیروگاه زغال‌سنگ", "group": "power",
        "levels": [{"cost": 250_000, "capacity": 10}, {"cost": 700_000, "capacity": 25},
                   {"cost": 1_800_000, "capacity": 55}, {"cost": 4_500_000, "capacity": 100},
                   {"cost": 10_000_000, "capacity": 180}]},
    "power_gas":       {"name": "نیروگاه گازی", "group": "power",
        "levels": [{"cost": 400_000, "capacity": 15}, {"cost": 1_000_000, "capacity": 35},
                   {"cost": 2_500_000, "capacity": 70}, {"cost": 6_000_000, "capacity": 130},
                   {"cost": 14_000_000, "capacity": 230}]},
    "power_wind":      {"name": "نیروگاه بادی", "group": "power",
        "levels": [{"cost": 350_000, "capacity": 9}, {"cost": 900_000, "capacity": 22},
                   {"cost": 2_200_000, "capacity": 48}, {"cost": 5_500_000, "capacity": 95},
                   {"cost": 12_000_000, "capacity": 165}]},
    "power_solar":     {"name": "نیروگاه خورشیدی", "group": "power",
        "levels": [{"cost": 500_000, "capacity": 12}, {"cost": 1_300_000, "capacity": 28},
                   {"cost": 3_200_000, "capacity": 62}, {"cost": 8_000_000, "capacity": 120},
                   {"cost": 18_000_000, "capacity": 210}]},
    "power_hydro":     {"name": "نیروگاه آبی", "group": "power",
        "levels": [{"cost": 600_000, "capacity": 18}, {"cost": 1_500_000, "capacity": 40},
                   {"cost": 3_800_000, "capacity": 85}, {"cost": 9_000_000, "capacity": 160},
                   {"cost": 20_000_000, "capacity": 280}]},
    "power_geothermal":{"name": "نیروگاه زمین‌گرمایی", "group": "power",
        "levels": [{"cost": 800_000, "capacity": 22}, {"cost": 2_000_000, "capacity": 50},
                   {"cost": 5_000_000, "capacity": 105}, {"cost": 12_000_000, "capacity": 195},
                   {"cost": 26_000_000, "capacity": 340}]},
    "power_nuclear":   {"name": "نیروگاه هسته‌ای", "group": "power",
        "levels": [
            {"cost": 1_500_000, "capacity": 35, "resources": {"uranium": 5_000}},
            {"cost": 4_000_000, "capacity": 85, "resources": {"uranium": 12_000}},
            {"cost": 10_000_000, "capacity": 180, "resources": {"uranium": 25_000}},
            {"cost": 24_000_000, "capacity": 340, "resources": {"uranium": 50_000}},
            {"cost": 55_000_000, "capacity": 600, "resources": {"uranium": 90_000}},
        ]},

    # ------------------ نیروی انسانی ------------------
    "manpower_camp":                {"name": "اردوگاه آموزشی", "group": "manpower",
        "levels": [{"cost": 150_000, "production": 200}, {"cost": 400_000, "production": 500},
                   {"cost": 1_000_000, "production": 1200}, {"cost": 2_500_000, "production": 2500},
                   {"cost": 6_000_000, "production": 5_000}]},
    "manpower_barracks_training":   {"name": "پادگان آموزشی", "group": "manpower",
        "levels": [{"cost": 250_000, "production": 300}, {"cost": 650_000, "production": 700},
                   {"cost": 1_600_000, "production": 1600}, {"cost": 4_000_000, "production": 3400},
                   {"cost": 9_500_000, "production": 6_800}]},
    "manpower_volunteer":           {"name": "پایگاه داوطلبان", "group": "manpower",
        "levels": [{"cost": 200_000, "production": 240}, {"cost": 500_000, "production": 560},
                   {"cost": 1_300_000, "production": 1300}, {"cost": 3_300_000, "production": 2800},
                   {"cost": 8_000_000, "production": 5_500}]},
    "manpower_medical":             {"name": "مرکز پزشکی", "group": "manpower",
        "levels": [{"cost": 350_000, "production": 260}, {"cost": 900_000, "production": 620},
                   {"cost": 2_200_000, "production": 1400}, {"cost": 5_500_000, "production": 3000},
                   {"cost": 13_000_000, "production": 6_000}]},
    "manpower_mobilization":        {"name": "مرکز بسیج", "group": "manpower",
        "levels": [{"cost": 300_000, "production": 380}, {"cost": 800_000, "production": 900},
                   {"cost": 2_000_000, "production": 2000}, {"cost": 5_000_000, "production": 4200},
                   {"cost": 12_000_000, "production": 8_500}]},
    "manpower_academy":             {"name": "آکادمی نظامی", "group": "manpower",
        "levels": [{"cost": 500_000, "production": 450}, {"cost": 1_300_000, "production": 1100},
                   {"cost": 3_200_000, "production": 2400}, {"cost": 8_000_000, "production": 5000},
                   {"cost": 19_000_000, "production": 10_000}]},

    # ------------------ نظامی: زمینی ------------------
    "land_barracks":       {"name": "پادگان زمینی", "group": "land",
        "levels": [{"cost": 300_000, "capacity": 5}, {"cost": 800_000, "capacity": 12},
                   {"cost": 2_000_000, "capacity": 25}, {"cost": 5_000_000, "capacity": 45},
                   {"cost": 12_000_000, "capacity": 80}]},
    "land_hq":             {"name": "ستاد فرماندهی", "group": "land",
        "levels": [{"cost": 400_000, "capacity": 3}, {"cost": 1_000_000, "capacity": 8},
                   {"cost": 2_500_000, "capacity": 18}, {"cost": 6_000_000, "capacity": 35},
                   {"cost": 15_000_000, "capacity": 60}]},
    "land_tank_factory":   {"name": "کارخانه تانک‌سازی", "group": "land",
        "levels": [{"cost": 450_000, "capacity": 3}, {"cost": 1_200_000, "capacity": 8},
                   {"cost": 3_000_000, "capacity": 16}, {"cost": 7_500_000, "capacity": 30},
                   {"cost": 18_000_000, "capacity": 55}]},

    # ------------------ نظامی: دریایی ------------------
    "naval_port":     {"name": "بندر نظامی", "group": "naval",
        "levels": [{"cost": 400_000, "capacity": 3}, {"cost": 1_000_000, "capacity": 8},
                   {"cost": 2_500_000, "capacity": 18}, {"cost": 6_000_000, "capacity": 30},
                   {"cost": 15_000_000, "capacity": 55}]},
    "naval_shipyard": {"name": "کشتی‌سازی", "group": "naval",
        "levels": [{"cost": 500_000, "capacity": 2}, {"cost": 1_300_000, "capacity": 6},
                   {"cost": 3_200_000, "capacity": 14}, {"cost": 8_000_000, "capacity": 25},
                   {"cost": 19_000_000, "capacity": 45}]},

    # ------------------ نظامی: هوایی ------------------
    "air_airport": {"name": "فرودگاه نظامی", "group": "air",
        "levels": [{"cost": 500_000, "capacity": 3}, {"cost": 1_300_000, "capacity": 8},
                   {"cost": 3_200_000, "capacity": 18}, {"cost": 8_000_000, "capacity": 30},
                   {"cost": 19_000_000, "capacity": 55}]},
    "air_arsenal": {"name": "ادوات هوایی", "group": "air",
        "levels": [{"cost": 600_000, "capacity": 2}, {"cost": 1_500_000, "capacity": 6},
                   {"cost": 3_800_000, "capacity": 14}, {"cost": 9_000_000, "capacity": 25},
                   {"cost": 22_000_000, "capacity": 45}]},

    # ------------------ منابع (پایه: 50k در روز در سطح ۱) ------------------
    "resource_farm":         {"name": "مجتمع کشاورزی", "group": "resource", "resource_key": "food",
        "levels": [{"cost": 200_000, "production": 50_000}, {"cost": 600_000, "production": 130_000},
                   {"cost": 1_600_000, "production": 300_000}, {"cost": 4_000_000, "production": 700_000},
                   {"cost": 10_000_000, "production": 1_500_000}]},
    "resource_oil_well":     {"name": "چاه نفت", "group": "resource", "resource_key": "oil",
        "levels": [{"cost": 500_000, "production": 50_000}, {"cost": 1_500_000, "production": 130_000},
                   {"cost": 4_000_000, "production": 300_000}, {"cost": 10_000_000, "production": 700_000},
                   {"cost": 25_000_000, "production": 1_500_000}]},
    "resource_steel_mill":   {"name": "کارخانه فولاد", "group": "resource", "resource_key": "steel",
        "levels": [{"cost": 500_000, "production": 50_000}, {"cost": 1_500_000, "production": 130_000},
                   {"cost": 4_000_000, "production": 300_000}, {"cost": 10_000_000, "production": 700_000},
                   {"cost": 25_000_000, "production": 1_500_000}]},
    "resource_uranium_mine": {"name": "معدن اورانیوم", "group": "resource", "resource_key": "uranium",
        "levels": [{"cost": 700_000, "production": 50_000}, {"cost": 2_000_000, "production": 130_000},
                   {"cost": 5_000_000, "production": 300_000}, {"cost": 12_000_000, "production": 700_000},
                   {"cost": 30_000_000, "production": 1_500_000}]},
}


# =========================================================
# اقتصاد
# =========================================================

ECONOMY = {
    "eco_agriculture": {"name": "کشاورزی و دامداری", "power_required": 5,
        "levels": [{"cost": 200_000, "income": 30_000}, {"cost": 600_000, "income": 80_000},
                   {"cost": 1_600_000, "income": 190_000}, {"cost": 4_000_000, "income": 420_000},
                   {"cost": 10_000_000, "income": 850_000}]},
    "eco_textile":     {"name": "کارخانه نساجی", "power_required": 8,
        "levels": [{"cost": 300_000, "income": 45_000}, {"cost": 900_000, "income": 115_000},
                   {"cost": 2_400_000, "income": 270_000}, {"cost": 6_000_000, "income": 600_000},
                   {"cost": 15_000_000, "income": 1_200_000}]},
    "eco_mining":      {"name": "معدن‌کاری", "power_required": 12,
        "levels": [{"cost": 500_000, "income": 70_000}, {"cost": 1_400_000, "income": 180_000},
                   {"cost": 3_600_000, "income": 420_000}, {"cost": 9_000_000, "income": 920_000},
                   {"cost": 22_000_000, "income": 1_850_000}]},
    "eco_steel":       {"name": "کارخانه فولاد", "power_required": 18,
        "levels": [{"cost": 800_000, "income": 100_000}, {"cost": 2_200_000, "income": 260_000},
                   {"cost": 5_500_000, "income": 600_000}, {"cost": 14_000_000, "income": 1_300_000},
                   {"cost": 32_000_000, "income": 2_600_000}]},
    "eco_trade":       {"name": "تجارت بین‌الملل", "power_required": 20,
        "levels": [{"cost": 1_500_000, "income": 130_000}, {"cost": 4_000_000, "income": 330_000},
                   {"cost": 10_000_000, "income": 760_000}, {"cost": 24_000_000, "income": 1_600_000},
                   {"cost": 55_000_000, "income": 3_200_000}]},
    "eco_oil":         {"name": "پالایشگاه نفت", "power_required": 25,
        "levels": [{"cost": 1_200_000, "income": 140_000}, {"cost": 3_200_000, "income": 360_000},
                   {"cost": 8_000_000, "income": 820_000}, {"cost": 20_000_000, "income": 1_750_000},
                   {"cost": 45_000_000, "income": 3_500_000}]},
    "eco_bank":        {"name": "بانک مرکزی", "power_required": 30,
        "levels": [{"cost": 2_000_000, "income": 180_000}, {"cost": 5_500_000, "income": 460_000},
                   {"cost": 14_000_000, "income": 1_050_000}, {"cost": 34_000_000, "income": 2_200_000},
                   {"cost": 75_000_000, "income": 4_400_000}]},
}


# =========================================================
# یگان‌ها
# =========================================================

ARMY_UNITS = {
    "infantry":  {"name": "پیاده‌نظام", "group": "land", "requires": "land_barracks",
                  "cost": 50_000, "manpower": 300, "resources": {"food": 100},
                  "power_required": 5, "attack": 20, "defense": 10},
    "tank":      {"name": "تانک", "group": "land", "requires": "land_tank_factory",
                  "cost": 150_000, "manpower": 250, "resources": {"steel": 300, "food": 150},
                  "power_required": 12, "attack": 50, "defense": 25},
    "ship":      {"name": "ناو دریایی", "group": "naval", "requires": "naval_port",
                  "cost": 250_000, "manpower": 200, "resources": {"oil": 250, "food": 150},
                  "power_required": 15, "attack": 50, "defense": 60},
    "submarine": {"name": "زیردریایی", "group": "naval", "requires": "naval_shipyard",
                  "cost": 200_000, "manpower": 120, "resources": {"oil": 200, "steel": 150},
                  "power_required": 15, "attack": 45, "defense": 25},
    "fighter":   {"name": "جنگنده", "group": "air", "requires": "air_airport",
                  "cost": 200_000, "manpower": 150, "resources": {"oil": 200, "steel": 100},
                  "power_required": 15, "attack": 45, "defense": 40},
    "bomber":    {"name": "بمب‌افکن", "group": "air", "requires": "air_arsenal",
                  "cost": 250_000, "manpower": 180, "resources": {"oil": 300, "steel": 150},
                  "power_required": 18, "attack": 60, "defense": 15},
}


# =========================================================
# منابع روی نقشه (سکو و معدن) — مصرف در فاز ۴
# =========================================================

MAP_RESOURCES = {
    "oil_gulf":       {"type": "oil",     "name": "سکوی نفتی خلیج فارس",   "lon": 51.5,  "lat": 27.0, "production": 5_000_000},
    "oil_caspian":    {"type": "oil",     "name": "سکوی نفتی خزر",         "lon": 51.0,  "lat": 41.5, "production": 3_000_000},
    "oil_northsea":   {"type": "oil",     "name": "سکوی نفتی دریای شمال",  "lon": 2.0,   "lat": 56.5, "production": 4_000_000},
    "oil_texas":      {"type": "oil",     "name": "میدان نفتی تگزاس",      "lon": -100.0,"lat": 31.0, "production": 4_000_000},
    "steel_ural":     {"type": "steel",   "name": "معدن فولاد اورال",       "lon": 60.0,  "lat": 58.0, "production": 3_000_000},
    "steel_ruhr":     {"type": "steel",   "name": "معدن فولاد رور",         "lon": 7.0,   "lat": 51.4, "production": 4_000_000},
    "steel_brazil":   {"type": "steel",   "name": "معدن فولاد برزیل",       "lon": -50.0, "lat": -15.0,"production": 3_500_000},
    "uranium_kazakh": {"type": "uranium", "name": "معدن اورانیوم قزاقستان","lon": 68.0,  "lat": 48.0, "production": 2_500_000},
    "uranium_canada": {"type": "uranium", "name": "معدن اورانیوم کانادا",   "lon": -105.0,"lat": 58.0, "production": 2_000_000},
    "uranium_aussie": {"type": "uranium", "name": "معدن اورانیوم استرالیا","lon": 134.0, "lat": -25.0,"production": 2_200_000},
    "food_ukraine":   {"type": "food",    "name": "دشت‌های کشاورزی اوکراین","lon": 32.0, "lat": 49.0, "production": 2_500_000},
    "food_india":     {"type": "food",    "name": "دشت‌های هند",            "lon": 78.0,  "lat": 22.0, "production": 2_500_000},
}


# =========================================================
# ابزار زمان
# =========================================================

def utcnow():
    return datetime.now(timezone.utc)


def parse_dt(s):
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def get_game_time(player):
    started_at = player.get("started_at")
    if not started_at:
        return {
            "day": 1, "season": SEASONS[0],
            "season_days_left": DAYS_PER_SEASON, "season_hours_left": 0,
            "next_season": SEASONS[1],
        }

    started = parse_dt(started_at)
    now = utcnow()
    elapsed_days = max(0, (now - started).total_seconds() / 86400)
    day = min(GAME_TOTAL_DAYS, int(elapsed_days) + 1)
    season_index = ((day - 1) // DAYS_PER_SEASON) % len(SEASONS)

    season_end = started + timedelta(days=(season_index + 1) * DAYS_PER_SEASON)
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
    """مصرف برق: اقتصاد + یگان‌های نظامی"""
    total = 0
    for item_id, item in ECONOMY.items():
        level = get_infra_level(player, item_id)
        if level > 0:
            total += item["power_required"] * level

    for unit_id, unit in ARMY_UNITS.items():
        count = player.get("units", {}).get(unit_id, 0)
        total += unit["power_required"] * count

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


def get_group_units(player, group):
    total = 0
    for unit_id, unit in ARMY_UNITS.items():
        if unit["group"] == group:
            total += player.get("units", {}).get(unit_id, 0)
    return total


def recompute_army(player):
    total = 0
    for unit_id, unit in ARMY_UNITS.items():
        count = player.get("units", {}).get(unit_id, 0)
        total += count * (unit["attack"] + unit["defense"])
    player["army"] = total


def ensure_player_fields(player):
    player.setdefault("resources", dict(STARTING_RESOURCES))
    for key in RESOURCE_NAMES:
        player["resources"].setdefault(key, 0)

    units = player.setdefault("units", {})
    for unit_id in ARMY_UNITS:
        units.setdefault(unit_id, 0)
    for stale in [k for k in units if k not in ARMY_UNITS]:
        del units[stale]

    player.setdefault("infra_levels", {})
    player.setdefault("map_holdings", {})  # سکوها/معدن‌ها/تنگه‌های گرفته‌شده


def compute_rates(player):
    power_capacity = get_power_total(player)
    power_consumption = get_power_used(player)

    manpower_production = BASE_MANPOWER_PRODUCTION
    resource_production = {key: 0 for key in RESOURCE_NAMES}
    income = BASE_DAILY_INCOME

    for item_id, item in INFRASTRUCTURE.items():
        group = item.get("group")
        level = get_infra_level(player, item_id)
        if level <= 0:
            continue
        lvl_data = item["levels"][level - 1]

        if group == "manpower":
            manpower_production += lvl_data["production"]
        elif group == "resource":
            key = item.get("resource_key")
            if key:
                resource_production[key] += lvl_data["production"]

    for item_id, item in ECONOMY.items():
        level = get_infra_level(player, item_id)
        if level > 0:
            income += item["levels"][level - 1]["income"]

    # درآمد سکوهای گرفته‌شده
    for key, owner in player.get("map_holdings", {}).items():
        if owner == player.get("country"):
            res = MAP_RESOURCES.get(key)
            if res and res["type"] == "oil":
                income += res["production"] // 10

    return {
        "gross_income": income,
        "net_income": income,
        "power_capacity": power_capacity,
        "power_consumption": power_consumption,
        "manpower_production": manpower_production,
        "resource_production": resource_production,
    }


def accrue_player(player):
    if not player.get("started_at"):
        return

    now = utcnow()
    last = parse_dt(player.get("last_update")) or parse_dt(player["started_at"])
    if not last:
        return

    elapsed_seconds = max(0, (now - last).total_seconds())
    rates = compute_rates(player)
    fraction_of_day = elapsed_seconds / 86400

    player["money"] = player.get("money", STARTING_MONEY) + rates["net_income"] * fraction_of_day
    player["manpower"] = player.get("manpower", STARTING_MANPOWER) + rates["manpower_production"] * fraction_of_day

    ensure_player_fields(player)

    for key, amount in rates["resource_production"].items():
        player["resources"][key] = player["resources"].get(key, 0) + amount * fraction_of_day

    player["last_update"] = now.isoformat()


def build_catalog_status(player, catalog):
    result = {}
    for item_id, item in catalog.items():
        level = get_infra_level(player, item_id)
        current = get_item_info(catalog, item_id, level)
        levels = item["levels"]
        next_level = level + 1
        next_info = levels[next_level - 1] if next_level <= len(levels) else None

        result[item_id] = {
            "name": item["name"],
            "group": item.get("group"),
            "resource_key": item.get("resource_key"),
            "power_required": item.get("power_required"),
            "level": level,
            "max_level": len(levels),
            "current": current,
            "next": next_info,
        }
    return result


def serialize_player(player):
    ensure_player_fields(player)
    accrue_player(player)
    recompute_army(player)
    rates = compute_rates(player)

    data = dict(player)
    data.update(get_game_time(player))
    data["resource_production"] = rates["resource_production"]
    data["power_capacity"] = rates["power_capacity"]
    data["power_consumption"] = rates["power_consumption"]
    data["manpower_production"] = rates["manpower_production"]
    data["daily_income"] = rates["net_income"]
    data["infra"] = build_catalog_status(player, INFRASTRUCTURE)
    data["economy"] = build_catalog_status(player, ECONOMY)
    return data


# =========================================================
# State + Persistence
# =========================================================

players = {}
diplomacy_proposals = {}
active_treaties = []
map_holdings = {}  # { "oil_gulf": "germany", ... }


def create_player(user_id):
    return {
        "user_id": user_id,
        "country": None,
        "money": STARTING_MONEY,
        "army": 0,
        "manpower": STARTING_MANPOWER,
        "infra_levels": {},
        "units": {uid: 0 for uid in ARMY_UNITS},
        "resources": dict(STARTING_RESOURCES),
        "map_holdings": {},
        "started_at": None,
        "last_update": None,
    }


def get_player_by_country(country_id):
    for uid, player in players.items():
        if player.get("country") == country_id:
            return uid, player
    return None, None


def save_state():
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        state = {
            "players": {str(k): v for k, v in players.items()},
            "diplomacy_proposals": diplomacy_proposals,
            "active_treaties": active_treaties,
            "map_holdings": map_holdings,
        }
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False)
        os.replace(tmp, STATE_FILE)
    except Exception as e:
        logging.error("save_state failed: %s", e)


def load_state():
    global diplomacy_proposals, active_treaties, map_holdings
    if not os.path.exists(STATE_FILE):
        logging.info("No state file found, starting fresh.")
        return
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            state = json.load(f)

        for k, v in state.get("players", {}).items():
            players[int(k)] = v
        diplomacy_proposals = state.get("diplomacy_proposals", {})
        active_treaties = state.get("active_treaties", [])
        map_holdings = state.get("map_holdings", {})
        logging.info("State loaded: %d players", len(players))
    except Exception as e:
        logging.error("load_state failed: %s", e)


async def autosave_loop():
    while True:
        await asyncio.sleep(60)
        save_state()


# =========================================================
# Telegram Auth
# =========================================================

def verify_init_data(init_data: str):
    if not init_data:
        return None
    try:
        parsed = dict(parse_qsl(init_data, keep_blank_values=True))
        received_hash = parsed.pop("hash", None)
        if not received_hash:
            return None
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
        secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        computed = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(computed, received_hash):
            return None
        user_raw = parsed.get("user")
        if user_raw:
            return json.loads(user_raw)
        return None
    except Exception as e:
        logging.error("verify_init_data error: %s", e)
        return None


def get_auth_user_id(request):
    """user_id معتبر، یا None"""
    if not AUTH_REQUIRED:
        # حالت توسعه: از query یا body
        uid = request.query.get("user_id")
        if uid:
            try:
                return int(uid)
            except (TypeError, ValueError):
                return None
        return None

    init_data = (
        request.headers.get("X-Telegram-Init-Data")
        or request.query.get("init_data")
    )
    user = verify_init_data(init_data)
    if user and user.get("id"):
        return int(user["id"])
    return None


async def read_json(request):
    try:
        return await request.json()
    except Exception:
        return {}


# =========================================================
# Bot
# =========================================================

from aiogram.client.default import DefaultBotProperties
bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=None))
dp = Dispatcher()


@dp.message(Command("start"))
async def start_command(message: types.Message):
    user_id = message.from_user.id
    if user_id not in players:
        players[user_id] = create_player(user_id)
        save_state()

    keyboard = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🌍 ورود به بازی", web_app=WebAppInfo(url=WEB_APP_URL))
    ]])

    if players[user_id]["country"]:
        c = COUNTRIES[players[user_id]["country"]]
        text = (f"⚔️ به جنگ جهانی دوم خوش آمدید.\n\n"
                f"کشور شما: {c['flag']} {c['name']}\n\n"
                f"برای ورود روی دکمه زیر بزنید.")
    else:
        text = ("⚔️ به جنگ جهانی دوم خوش آمدید.\n\n"
                "سال ۱۹۳۹ است.\n"
                "ابتدا وارد بازی شوید و کشور خود را انتخاب کنید.")

    await message.answer(text, reply_markup=keyboard)


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

    type_name = TREATY_TYPE_NAMES.get(proposal["treaty_type"], proposal["treaty_type"])

    if action == "accept":
        proposal["status"] = "accepted"
        active_treaties.append({
            "id": str(uuid.uuid4()),
            "country_a": proposal["from_country"],
            "country_b": proposal["to_country"],
            "treaty_type": proposal["treaty_type"],
            "expires_at": (utcnow() + timedelta(days=proposal["duration_days"])).isoformat(),
        })
        await callback.message.edit_text(
            f"✅ {type_name} با {COUNTRIES[proposal['to_country']]['name']} پذیرفته شد."
        )
    elif action == "reject":
        proposal["status"] = "rejected"
        await callback.message.edit_text(
            f"❌ {type_name} با {COUNTRIES[proposal['to_country']]['name']} رد شد."
        )

    save_state()
    await callback.answer()


# =========================================================
# API — Player
# =========================================================

async def get_player(request):
    user_id = get_auth_user_id(request)
    if not user_id:
        return web.json_response({"error": "unauthorized"}, status=401)

    if user_id not in players:
        players[user_id] = create_player(user_id)
        save_state()

    return web.json_response(serialize_player(players[user_id]))


async def get_countries(request):
    result = []
    for cid, c in COUNTRIES.items():
        owner_id, _ = get_player_by_country(cid)
        result.append({"id": cid, "name": c["name"], "flag": c["flag"], "taken": owner_id is not None})
    return web.json_response(result)


async def select_country(request):
    user_id = get_auth_user_id(request)
    if not user_id:
        return web.json_response({"success": False, "error": "unauthorized"}, status=401)

    data = await read_json(request)
    country_id = data.get("country")

    if country_id not in COUNTRIES:
        return web.json_response({"success": False, "error": "invalid_country",
                                  "message": "کشور انتخاب شده معتبر نیست."}, status=400)

    if user_id not in players:
        players[user_id] = create_player(user_id)

    player = players[user_id]

    if player["country"]:
        if player["country"] == country_id:
            return web.json_response({"success": True, "player": serialize_player(player)})
        return web.json_response({"success": False, "error": "already_has_country",
                                  "message": "شما قبلاً یک کشور انتخاب کرده‌اید."}, status=409)

    owner_id, _ = get_player_by_country(country_id)
    if owner_id is not None and owner_id != user_id:
        return web.json_response({"success": False, "error": "country_taken",
                                  "message": "این کشور قبلاً توسط بازیکن دیگری انتخاب شده است."}, status=409)

    player["country"] = country_id
    if not player.get("started_at"):
        now = utcnow().isoformat()
        player["started_at"] = now
        player["last_update"] = now

    save_state()
    return web.json_response({"success": True, "player": serialize_player(player)})


# =========================================================
# API — ارتقا زیرساخت
# =========================================================

async def upgrade_infra(request):
    user_id = get_auth_user_id(request)
    if not user_id:
        return web.json_response({"success": False, "error": "unauthorized"}, status=401)

    data = await read_json(request)
    item_id = data.get("category")

    if item_id not in INFRASTRUCTURE:
        return web.json_response({"success": False, "error": "invalid_category"}, status=400)

    if user_id not in players:
        players[user_id] = create_player(user_id)

    player = players[user_id]

    if not player.get("country"):
        return web.json_response({"success": False, "error": "no_country",
                                  "message": "ابتدا وارد بازی شوید."}, status=400)

    accrue_player(player)

    item = INFRASTRUCTURE[item_id]
    current_level = get_infra_level(player, item_id)
    levels = item["levels"]

    if current_level >= len(levels):
        return web.json_response({"success": False, "error": "max_level",
                                  "message": "این زیرساخت به حداکثر سطح رسیده است."}, status=400)

    cost = levels[current_level]["cost"]
    resource_cost = levels[current_level].get("resources", {})

    if player.get("money", 0) < cost:
        return web.json_response({"success": False, "error": "not_enough_money",
                                  "message": "پول کافی ندارید."}, status=400)

    ensure_player_fields(player)
    for key, amount in resource_cost.items():
        if player["resources"].get(key, 0) < amount:
            return web.json_response({"success": False, "error": "not_enough_resource",
                                      "message": f"{RESOURCE_NAMES[key]} کافی ندارید."}, status=400)

    player["money"] -= cost
    for key, amount in resource_cost.items():
        player["resources"][key] -= amount

    player["infra_levels"][item_id] = current_level + 1
    save_state()

    return web.json_response({"success": True, "player": serialize_player(player)})


# =========================================================
# API — ارتقا اقتصاد
# =========================================================

async def upgrade_economy(request):
    user_id = get_auth_user_id(request)
    if not user_id:
        return web.json_response({"success": False, "error": "unauthorized"}, status=401)

    data = await read_json(request)
    item_id = data.get("category")

    if item_id not in ECONOMY:
        return web.json_response({"success": False, "error": "invalid_category"}, status=400)

    if user_id not in players:
        players[user_id] = create_player(user_id)

    player = players[user_id]

    if not player.get("country"):
        return web.json_response({"success": False, "error": "no_country",
                                  "message": "ابتدا وارد بازی شوید."}, status=400)

    accrue_player(player)

    item = ECONOMY[item_id]
    current_level = get_infra_level(player, item_id)
    levels = item["levels"]

    if current_level >= len(levels):
        return web.json_response({"success": False, "error": "max_level",
                                  "message": "به حداکثر سطح رسیده است."}, status=400)

    cost = levels[current_level]["cost"]

    if player.get("money", 0) < cost:
        return web.json_response({"success": False, "error": "not_enough_money",
                                  "message": "پول کافی ندارید."}, status=400)

    required_power = item["power_required"]
    power_used = get_power_used(player)
    power_total = get_power_total(player)

    if power_total < power_used + required_power:
        return web.json_response({"success": False, "error": "not_enough_power",
                                  "message": "برق کافی برای راه‌اندازی این بخش ندارید. ابتدا نیروگاه بسازید."}, status=400)

    player["money"] -= cost
    player["infra_levels"][item_id] = current_level + 1
    save_state()

    return web.json_response({"success": True, "player": serialize_player(player)})


# =========================================================
# API — آموزش یگان (با اصلاح باگ برق)
# =========================================================

async def train_unit(request):
    user_id = get_auth_user_id(request)
    if not user_id:
        return web.json_response({"success": False, "error": "unauthorized"}, status=401)

    data = await read_json(request)
    unit_id = data.get("unit_id")
    try:
        count = int(data.get("count", 1))
    except (TypeError, ValueError):
        count = 1
    count = max(1, min(count, 50))

    if unit_id not in ARMY_UNITS:
        return web.json_response({"success": False, "error": "invalid_unit"}, status=400)

    if user_id not in players:
        players[user_id] = create_player(user_id)

    player = players[user_id]

    if not player.get("country"):
        return web.json_response({"success": False, "error": "no_country",
                                  "message": "ابتدا وارد بازی شوید."}, status=400)

    ensure_player_fields(player)
    accrue_player(player)

    unit = ARMY_UNITS[unit_id]
    group = unit["group"]
    requires = unit["requires"]

    if get_infra_level(player, requires) <= 0:
        return web.json_response({"success": False, "error": "no_infra",
                                  "message": f"برای ساخت {unit['name']} ابتدا «{INFRASTRUCTURE[requires]['name']}» را بسازید."}, status=400)

    capacity = get_group_capacity(player, group)
    used = get_group_units(player, group)

    if used >= capacity:
        return web.json_response({"success": False, "error": "capacity_full",
                                  "message": f"ظرفیت نیروی {GROUP_NAMES[group]} پر است؛ زیرساخت را ارتقا دهید."}, status=400)

    count = min(count, capacity - used)

    # ==== اصلاح باگ برق: مصرف فعلی + مصرف جدید باید <= ظرفیت باشد ====
    power_capacity = get_power_total(player)
    power_used = get_power_used(player)
    new_power = unit["power_required"] * count

    if power_used + new_power > power_capacity:
        available = max(0, power_capacity - power_used)
        return web.json_response({"success": False, "error": "not_enough_power",
                                  "message": f"برق کافی ندارید. برق آزاد: {available}، نیاز: {new_power}."}, status=400)

    total_cost = unit["cost"] * count
    total_manpower = unit["manpower"] * count

    if player.get("money", 0) < total_cost:
        return web.json_response({"success": False, "error": "not_enough_money",
                                  "message": "پول کافی ندارید."}, status=400)

    if player.get("manpower", 0) < total_manpower:
        return web.json_response({"success": False, "error": "not_enough_manpower",
                                  "message": "نیروی انسانی کافی ندارید."}, status=400)

    for key, amount in unit["resources"].items():
        if player["resources"].get(key, 0) < amount * count:
            return web.json_response({"success": False, "error": "not_enough_resource",
                                      "message": f"{RESOURCE_NAMES[key]} کافی ندارید."}, status=400)

    player["money"] -= total_cost
    player["manpower"] -= total_manpower
    for key, amount in unit["resources"].items():
        player["resources"][key] -= amount * count
    player["units"][unit_id] = player["units"].get(unit_id, 0) + count

    recompute_army(player)
    save_state()

    return web.json_response({"success": True, "player": serialize_player(player)})


async def get_army_units(request):
    return web.json_response({
        "units": ARMY_UNITS,
        "resources": RESOURCE_NAMES,
        "groups": GROUP_NAMES,
    })


async def get_map_resources(request):
    """لیست منابع روی نقشه + مالکیت فعلی"""
    result = []
    for key, info in MAP_RESOURCES.items():
        result.append({
            **info,
            "id": key,
            "owner": map_holdings.get(key),
        })
    return web.json_response(result)


# =========================================================
# API — حمله (فعلاً stub — فاز ۳ کامل می‌شود)
# =========================================================

async def attack(request):
    user_id = get_auth_user_id(request)
    if not user_id:
        return web.json_response({"success": False, "error": "unauthorized"}, status=401)

    data = await read_json(request)
    target = data.get("target")
    attack_type = data.get("type", "land")

    if target not in COUNTRIES:
        return web.json_response({"success": False, "error": "invalid_target"}, status=400)

    if user_id not in players:
        players[user_id] = create_player(user_id)

    player = players[user_id]

    if not player.get("country"):
        return web.json_response({"success": False, "error": "no_country",
                                  "message": "ابتدا وارد بازی شوید."}, status=400)

    if target == player.get("country"):
        return web.json_response({"success": False, "error": "self_attack"}, status=400)

    type_name = ATTACK_TYPE_NAMES.get(attack_type, attack_type)
    target_name = COUNTRIES[target]["name"]

    return web.json_response({"success": True,
                              "message": f"عملیات {type_name} علیه {target_name} آغاز شد. (منطق جنگ در فاز بعدی)"})


# =========================================================
# API — دیپلماسی
# =========================================================

async def propose_treaty(request):
    user_id = get_auth_user_id(request)
    if not user_id:
        return web.json_response({"success": False, "error": "unauthorized"}, status=401)

    data = await read_json(request)
    target_country = data.get("target")
    treaty_type = data.get("type")
    try:
        duration_days = int(data.get("duration_days", 10))
    except (TypeError, ValueError):
        duration_days = 10
    duration_days = max(1, min(duration_days, 30))

    if target_country not in COUNTRIES:
        return web.json_response({"success": False, "error": "invalid_target"}, status=400)
    if treaty_type not in TREATY_TYPE_NAMES:
        return web.json_response({"success": False, "error": "invalid_type"}, status=400)

    if user_id not in players:
        players[user_id] = create_player(user_id)

    player = players[user_id]
    from_country = player.get("country")

    if not from_country:
        return web.json_response({"success": False, "error": "no_country",
                                  "message": "ابتدا وارد بازی شوید."}, status=400)
    if target_country == from_country:
        return web.json_response({"success": False, "error": "self_proposal"}, status=400)

    target_user_id, _ = get_player_by_country(target_country)
    if target_user_id is None:
        return web.json_response({"success": False, "error": "country_unowned",
                                  "message": "این کشور هنوز انتخاب نشده است."}, status=400)

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
        "created_at": utcnow().isoformat(),
    }

    type_name = TREATY_TYPE_NAMES[treaty_type]
    from_name = COUNTRIES[from_country]["name"]

    keyboard = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ قبول", callback_data=f"treaty:accept:{proposal_id}"),
        InlineKeyboardButton(text="❌ رد", callback_data=f"treaty:reject:{proposal_id}"),
    ]])

    sent = False
    try:
        await bot.send_message(
            target_user_id,
            f"📜 پیشنهاد {type_name}\n\nکشور {from_name} به شما پیشنهاد {type_name} به مدت {duration_days} روز داده است.",
            reply_markup=keyboard
        )
        sent = True
    except Exception as e:
        logging.warning("Failed to send treaty proposal: %s", e)

    save_state()

    if not sent:
        return web.json_response({"success": True,
                                  "message": "پیشنهاد داخل بازی ثبت شد (کاربر پیام تلگرام را دریافت نکرد)."})
    return web.json_response({"success": True,
                              "message": "پیشنهاد ارسال شد و منتظر تأیید طرف مقابل است."})


async def get_diplomacy(request):
    user_id = get_auth_user_id(request)
    if not user_id:
        return web.json_response({"error": "unauthorized"}, status=401)

    if user_id not in players:
        players[user_id] = create_player(user_id)
    player = players[user_id]
    accrue_player(player)

    country_id = player.get("country")

    sent = [p for p in diplomacy_proposals.values()
            if p["from_user"] == user_id and p["status"] == "pending"]
    received = [p for p in diplomacy_proposals.values()
                if p["to_user"] == user_id and p["status"] == "pending"]
    treaties = [t for t in active_treaties
                if country_id and (t["country_a"] == country_id or t["country_b"] == country_id)]

    return web.json_response({"sent": sent, "received": received, "treaties": treaties})


async def respond_treaty(request):
    """پاسخ به پیشنهاد داخل بازی (به‌جای دکمه تلگرام)"""
    user_id = get_auth_user_id(request)
    if not user_id:
        return web.json_response({"success": False, "error": "unauthorized"}, status=401)

    data = await read_json(request)
    proposal_id = data.get("proposal_id")
    accept = bool(data.get("accept"))

    proposal = diplomacy_proposals.get(proposal_id)
    if not proposal or proposal["status"] != "pending":
        return web.json_response({"success": False, "error": "invalid_proposal"}, status=400)
    if proposal["to_user"] != user_id:
        return web.json_response({"success": False, "error": "not_yours"}, status=403)

    if accept:
        proposal["status"] = "accepted"
        active_treaties.append({
            "id": str(uuid.uuid4()),
            "country_a": proposal["from_country"],
            "country_b": proposal["to_country"],
            "treaty_type": proposal["treaty_type"],
            "expires_at": (utcnow() + timedelta(days=proposal["duration_days"])).isoformat(),
        })
    else:
        proposal["status"] = "rejected"

    save_state()
    return web.json_response({"success": True})


# =========================================================
# API — News
# =========================================================

async def get_news(request):
    news = [
        {"title": "سال ۱۹۳۹", "text": "اروپا در آستانه یک بحران بزرگ قرار دارد. تصمیمات فرماندهان سرنوشت جهان را تغییر خواهد داد."},
        {"title": "فرماندهی آغاز شد", "text": "کشور خود را انتخاب کنید و برای توسعه اقتصاد، ارتش و روابط خارجی آماده شوید."},
    ]
    return web.json_response(news)


async def health(request):
    return web.json_response({"status": "ok", "players": len(players)})


# =========================================================
# فایل‌های Web App
# =========================================================

WEB_DIR = os.path.join("web")

async def index(request):
    return web.FileResponse(os.path.join(WEB_DIR, "index.html"))

async def style(request):
    return web.FileResponse(os.path.join(WEB_DIR, "style.css"))

async def app_js(request):
    return web.FileResponse(os.path.join(WEB_DIR, "app.js"))


# =========================================================
# ساخت Web Server
# =========================================================

async def create_web_app():
    app = web.Application()
    app.router.add_get("/", index)
    app.router.add_get("/style.css", style)
    app.router.add_get("/app.js", app_js)
    app.router.add_static("/images/", path=os.path.join(WEB_DIR, "images"), name="images")

    # GET endpoints (خواندنی)
    app.router.add_get("/api/player", get_player)
    app.router.add_get("/api/countries", get_countries)
    app.router.add_get("/api/army-units", get_army_units)
    app.router.add_get("/api/diplomacy", get_diplomacy)
    app.router.add_get("/api/news", get_news)
    app.router.add_get("/api/map-resources", get_map_resources)
    app.router.add_get("/health", health)

    # POST endpoints (نوشتنی)
    app.router.add_post("/api/select-country", select_country)
    app.router.add_post("/api/upgrade-infra", upgrade_infra)
    app.router.add_post("/api/upgrade-economy", upgrade_economy)
    app.router.add_post("/api/train-unit", train_unit)
    app.router.add_post("/api/attack", attack)
    app.router.add_post("/api/propose-treaty", propose_treaty)
    app.router.add_post("/api/respond-treaty", respond_treaty)

    return app


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

    load_state()
    asyncio.create_task(autosave_loop())

    await start_web_server()
    logging.info("BOT POLLING STARTED")
    await dp.start_polling(bot)


if __name__ == "__main__":
    import asyncio
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        save_state()
        logging.info("State saved on shutdown.")
