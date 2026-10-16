import threading, os, json, hmac, hashlib, uuid, logging, asyncio, random, math, copy, time, contextlib, contextvars, re
from datetime import datetime, timezone, timedelta
from urllib.parse import parse_qsl

from aiohttp import web
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, MenuButtonWebApp
from aiogram.client.session.middlewares.base import BaseRequestMiddleware
from aiogram.methods import SendMessage
from aiogram.client.default import DefaultBotProperties
from dotenv import load_dotenv

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
WEB_APP_URL = os.getenv("WEB_APP_URL", "https://ww2-telegram-game.onrender.com")
ADMIN_ID = 8290076602  # مدیر اصلی پنل مدیریت؛ شناسهٔ تأییدشدهٔ تلگرام
AUTH_REQUIRED = os.getenv("AUTH_REQUIRED", "0") == "1"
DEV_AUTH = os.getenv("DEV_AUTH", "0") == "1"  # فقط برای توسعهٔ محلی بدون تلگرام؛ در تولید خاموش بماند
DATA_DIR = os.getenv("DATA_DIR", "data")
STATE_FILE = os.path.join(DATA_DIR, "state.json")

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

COUNTRIES = {
    "germany": {"name": "آلمان", "flag": "🇩🇪"}, "britain": {"name": "بریتانیا", "flag": "🇬🇧"},
    "ussr": {"name": "شوروی", "flag": "☭"}, "usa": {"name": "آمریکا", "flag": "🇺🇸"},
    "france": {"name": "فرانسه", "flag": "🇫🇷"}, "italy": {"name": "ایتالیا", "flag": "🇮🇹"},
    "china": {"name": "چین", "flag": "🇨🇳"}, "japan": {"name": "ژاپن", "flag": "🇯🇵"},
    "saudi": {"name": "عربستان", "flag": "🇸🇦"}, "iran": {"name": "ایران", "flag": "🇮🇷"},
    "turkey": {"name": "ترکیه", "flag": "🇹🇷"}, "venezuela": {"name": "ونزوئلا", "flag": "🇻🇪"},
    "egypt": {"name": "مصر", "flag": "🇪🇬"},
}

STARTING_MONEY = 10_000_000
STARTING_MANPOWER = 5_000
BASE_DAILY_INCOME = 500_000
BASE_MANPOWER_PRODUCTION = 1_000
# تقویم هر دنیا از لحظهٔ شروع مدیر آغاز می‌شود؛ هر فصل ۲ روز است و فصل‌ها چرخه‌ای تکرار می‌شوند (کل بازی ۳۱ روز).
SEASON_LENGTH_DAYS = {"بهار": 2, "تابستان": 2, "پاییز": 2, "زمستان": 2}
SEASON_CYCLE_DAYS = sum(SEASON_LENGTH_DAYS.values())
GAME_TOTAL_DAYS = 31

# ---- وام ----
LOAN_INTEREST_STEP_HOURS = 12      # به ازای هر ۱۲ ساعت کامل
LOAN_INTEREST_PER_STEP = 0.10      # ۱۰٪ مبلغ
LOAN_MAX_HOURS = 72                # حداکثر مهلت (=۶۰٪)
LOAN_FEE = 0.05                    # کارمزد ۵٪ از هر دریافت
LOAN_CAP_FRACTION = 0.50           # سقف هر وام: ۵۰٪ درآمد روزانهٔ وام‌دهنده
LOAN_END_MARGIN_SECONDS = 60       # سررسید همه وام‌ها ۱ دقیقه پیش از جنگ جهانی (پایان بازی)
LOAN_PENDING_TTL_HOURS = 24        # پیشنهادهای بی‌پاسخ منقضی می‌شوند
SEASONS = ["بهار", "تابستان", "پاییز", "زمستان"]

# درصدهای اثر فصل‌ها. اعداد منفی، کاهش درآمد/تولید و اعداد مثبت، افزایش مصرف هستند.
SEASON_EFFECTS = {
    "بهار":   {"income_pct": 0,   "food_consumption_pct": 0,   "oil_consumption_pct": 0,   "food_oil_consumption_pct": 0,   "resource_production_pct": 0, "manpower_production_pct": 0},
    "تابستان": {"income_pct": -5,  "food_consumption_pct": 50,  "oil_consumption_pct": 60,  "food_oil_consumption_pct": 0,   "resource_production_pct": 0, "manpower_production_pct": 0},
    "پاییز":  {"income_pct": -10, "food_consumption_pct": 100, "oil_consumption_pct": 160, "food_oil_consumption_pct": 0,   "resource_production_pct": 0, "manpower_production_pct": 0},
    "زمستان": {"income_pct": -23, "food_consumption_pct": 200, "oil_consumption_pct": 200, "food_oil_consumption_pct": 0,   "resource_production_pct": 0, "manpower_production_pct": 0},
}
SEASON_HINTS = {
    "بهار": "🌱 بهار: بدون اثر.",
    "تابستان": "☀️ تابستان: مصرف غذا ۵۰٪ و نفت ۶۰٪ بیشتر؛ درآمد روزانه ۵٪ کمتر.",
    "پاییز": "🍂 پاییز: مصرف غذا ۱۰۰٪ و نفت ۱۶۰٪ بیشتر؛ درآمد روزانه ۱۰٪ کمتر.",
    "زمستان": "❄️ زمستان: مصرف غذا ۲۰۰٪ و نفت ۲۰۰٪ بیشتر؛ درآمد روزانه ۲۳٪ کمتر.",
}

STARTING_RESOURCES = {"food": 5_000, "steel": 5_000, "uranium": 0, "oil": 5_000}
RESOURCE_NAMES = {"food": "غذا", "steel": "آهن", "uranium": "اورانیوم", "oil": "نفت"}
GROUP_NAMES = {"land": "زمینی", "naval": "دریایی", "air": "هوایی",
               "power": "برق", "manpower": "نیروی انسانی", "resource": "منابع", "missile": "موشکی"}
ANN_COSTS = {1: 0, 2: 0, 3: 10_000, 4: 400_000}
ANNOUNCEMENT_TZ = timezone(timedelta(hours=4))  # ریست سهمیه در نیمه‌شب باکو
ANNOUNCEMENT_INTERVAL_SECONDS = 3600


def _announcement_day(now=None):
    now = now or utcnow()
    return now.astimezone(ANNOUNCEMENT_TZ).strftime("%Y-%m-%d")


def _announcement_reset_seconds(now=None):
    now = now or utcnow()
    local_now = now.astimezone(ANNOUNCEMENT_TZ)
    next_midnight = local_now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    return max(0, int((next_midnight - local_now).total_seconds()))


def _announcement_cooldown_seconds(today_list, now=None):
    now = now or utcnow()
    if not today_list:
        return 0
    last = parse_dt(today_list[-1])
    if not last:
        return 0
    elapsed = max(0, (now - last).total_seconds())
    return max(0, int(ANNOUNCEMENT_INTERVAL_SECONDS - elapsed + 0.999))
WAR_PENALTY_ALLIANCE = 2_000_000
TREATY_TYPE_NAMES = {"alliance": "پیمان اتحاد", "non_aggression": "پیمان عدم تجاوز"}
NEGOTIATION_HOURS = 24  # سازگاری با داده‌های قدیمی
DEFAULT_COST = 150_000
DEFAULT_TIME = 0

def L(**kw):
    kw.setdefault("cost", DEFAULT_COST)
    kw.setdefault("time", DEFAULT_TIME)
    return kw

INFRASTRUCTURE = {
    # ==================== برق ====================
    # با هر ارتقا قیمت و زمان ساخت بیشتر می‌شوند؛ زمان نهایی همهٔ سطح‌ها در _apply_auto_times (۲۰ دقیقه تا ۲ ساعت) تنظیم می‌شود.
    "power_coal": {
        "name": "نیروگاه زغال‌سنگ", "group": "power", "icon": "⚡",
        "desc": "ارزان و در دسترس، اما برق کمی تولید می‌کند. هر ارتقا برق بیشتری می‌دهد ولی گران‌تر و زمان‌برتر است.",
        "levels": [L(cost=900_000, capacity=20, time=22 * 60), L(cost=1_400_000, capacity=44, time=33 * 60), L(cost=2_000_000, capacity=72, time=46 * 60)],
    },
    "power_wind": {
        "name": "نیروگاه بادی", "group": "power", "icon": "💨",
        "desc": "برق متوسط با هزینهٔ نگهداری کم. هر ارتقا برق بیشتری می‌دهد ولی گران‌تر و زمان‌برتر است.",
        "levels": [L(cost=1_300_000, capacity=34, time=32 * 60), L(cost=2_300_000, capacity=70, time=48 * 60), L(cost=3_400_000, capacity=110, time=67 * 60)],
    },
    "power_solar": {
        "name": "نیروگاه خورشیدی", "group": "power", "icon": "☀️",
        "desc": "برقی بیشتر از نیروگاه بادی با ساخت گران‌تر. هر ارتقا برق بیشتری می‌دهد ولی گران‌تر و زمان‌برتر است.",
        "levels": [L(cost=2_400_000, capacity=72, time=41 * 60), L(cost=3_600_000, capacity=120, time=62 * 60), L(cost=5_000_000, capacity=172, time=86 * 60)],
    },
    "power_nuclear": {
        "name": "نیروگاه هسته‌ای", "group": "power", "icon": "☢️",
        "desc": "پربازده‌ترین نیروگاه. برق زیادی تولید می‌کند اما اورانیوم مصرف می‌کند. هر ارتقا برق بیشتری می‌دهد ولی گران‌تر و زمان‌برتر است.",
        "levels": [
            L(cost=6_400_000, capacity=164, time=81 * 60, resources={"uranium": 5_000}),
            L(cost=9_500_000, capacity=290, time=122 * 60, resources={"uranium": 12_000}),
            L(cost=14_000_000, capacity=440, time=170 * 60, resources={"uranium": 25_000}),
        ],
    },

    # ==================== نیروی انسانی ====================
    "manpower_camp": {
        "power_required": 2,
        "name": "اردوگاه آموزشی", "group": "manpower", "icon": "👥",
        "desc": "پایگاه آموزش نیرو. هر سطح نیروی بیشتری تربیت می‌کند.",
        "levels": [L(cost=220_000, production=20000), L(cost=480_000, production=50000), L(cost=1_050_000, production=120000), L(cost=2_000_000, production=250000), L(cost=3_600_000, production=500000)],
    },
    "manpower_barracks_training": {
        "power_required": 3,
        "name": "پادگان آموزشی", "group": "manpower", "icon": "👥",
        "desc": "پادگان تخصصی آموزش سرباز.",
        "levels": [L(cost=300_000, production=30000), L(cost=650_000, production=70000), L(cost=1_400_000, production=160000), L(cost=2_700_000, production=340000), L(cost=4_900_000, production=680000)],
    },
    "manpower_volunteer": {
        "power_required": 2,
        "name": "پایگاه داوطلبان", "group": "manpower", "icon": "👥",
        "desc": "داوطلبان داوطلبانه ثبت‌نام می‌کنند.",
        "levels": [L(cost=180_000, production=24000), L(cost=430_000, production=56000), L(cost=1_050_000, production=130000), L(cost=2_300_000, production=280000), L(cost=4_600_000, production=550000)],
    },
    "manpower_medical": {
        "power_required": 3,
        "name": "مرکز پزشکی", "group": "manpower", "icon": "👥",
        "desc": "سلامت سربازان را تأمین می‌کند و تولید نیرو را بالا می‌برد.",
        "levels": [L(cost=260_000, production=26000), L(cost=560_000, production=62000), L(cost=1_250_000, production=140000), L(cost=2_500_000, production=300000), L(cost=4_700_000, production=600000)],
    },
    "manpower_mobilization": {
        "power_required": 4,
        "name": "مرکز بسیج", "group": "manpower", "icon": "👥",
        "desc": "در زمان جنگ نیروهای بیشتری جذب می‌کند.",
        "levels": [L(cost=340_000, production=38000), L(cost=720_000, production=90000), L(cost=1_500_000, production=200000), L(cost=2_900_000, production=420000), L(cost=5_300_000, production=850000)],
    },
    "manpower_academy": {
        "power_required": 5,
        "name": "آکادمی نظامی", "group": "manpower", "icon": "👥",
        "desc": "افسران کارآزموده پرورش می‌دهد.",
        "levels": [L(cost=430_000, production=45000), L(cost=900_000, production=110000), L(cost=1_800_000, production=240000), L(cost=3_400_000, production=500000), L(cost=6_000_000, production=1000000)],
    },

    # ==================== غذا (۳ آیتم) ====================
    "resource_farm": {
        "power_required": 2,
        "name": "مجتمع کشاورزی", "group": "resource", "resource_key": "food", "icon": "🌾",
        "desc": "غذای زیادی تولید می‌کند. برای فصل‌هایی که مصرف بالاست مناسب است.",
        "levels": [L(cost=240_000, production=200_000), L(cost=480_000, production=300_000), L(cost=840_000, production=440_000)],
    },
    "resource_greenhouse": {
        "power_required": 5,
        "name": "گلخانه صنعتی", "group": "resource", "resource_key": "food", "icon": "🌱",
        "desc": "غذا در همه فصل‌ها با بازده بالا تولید می‌کند.",
        "levels": [L(cost=3_000_000, production=1_000_000), L(cost=6_000_000, production=1_500_000), L(cost=10_500_000, production=2_200_000)],
    },
    "resource_livestock": {
        "power_required": 4,
        "name": "دامداری", "group": "resource", "resource_key": "food", "icon": "🐄",
        "desc": "گوشت و لبنیات فراوان تولید می‌کند؛ گران است ولی در تابستان، پاییز و زمستان به کار می‌آید.",
        "levels": [L(cost=8_000_000, production=4_000_000), L(cost=16_000_000, production=6_000_000), L(cost=28_000_000, production=8_800_000)],
    },

    # ==================== منابع ====================
    "resource_oil_well": {
        "power_required": 4,
        "name": "چاه نفت", "group": "resource", "resource_key": "oil", "icon": "🛢️",
        "desc": "نفت خام استخراج می‌کند. برای پالایشگاه و ارتش ضروری است.",
        "levels": [L(cost=800_000, production=50_000), L(cost=1_820_000, production=130_000), L(cost=4_000_000, production=300_000), L(cost=8_000_000, production=700_000), L(cost=15_270_000, production=1_500_000)],
    },
    "resource_steel_mill": {
        "power_required": 5,
        "name": "کارخانه آهن", "group": "resource", "resource_key": "steel", "icon": "⚙️",
        "desc": "آهن تولید می‌کند. پایهٔ صنعت و ساخت تانک است.",
        "levels": [L(cost=1_200_000, production=50_000), L(cost=2_700_000, production=130_000), L(cost=6_000_000, production=300_000), L(cost=12_000_000, production=700_000), L(cost=22_500_000, production=1_500_000)],
    },
    "resource_uranium_mine": {
        "power_required": 6,
        "name": "معدن اورانیوم", "group": "resource", "resource_key": "uranium", "icon": "☢️",
        "desc": "اورانیوم استخراج می‌کند. تنها نیروگاه هسته‌ای مصرفش می‌کند.",
        "levels": [L(cost=2_000_000, production=50_000), L(cost=4_470_000, production=130_000), L(cost=10_000_000, production=300_000), L(cost=19_470_000, production=700_000), L(cost=36_840_000, production=1_500_000)],
    },

    # ==================== نظامی ====================
    "land_barracks": {
        "power_required": 2,
        "name": "پادگان", "group": "land", "icon": "🪖",
        "desc": "تانک‌ها و نیروهای ارتش داخل پادگان می‌مانند. بعد از ساخت می‌شود آن را ارتقا داد و ظرفیتش را بیشتر کرد.",
        "levels": [L(cost=250_000, capacity=1000), L(cost=560_000, capacity=2000), L(cost=1_190_000, capacity=3000), L(cost=2_250_000, capacity=4000), L(cost=4_000_000, capacity=5000)],
    },
    "land_hq": {
        "power_required": 3,
        "name": "ستاد فرماندهی", "group": "land", "icon": "🎖️",
        "desc": "فرماندهی کل نیروی زمینی. ساخت آن شرط تولید یگان‌های زمینی است. از سطح ۲ به بعد هر ارتقا ۱۰٪ به دفاع یگان‌های زمینی اضافه می‌کند.",
        "bonus": {"defense": 0.10},
        "levels": [L(cost=500_000), L(cost=1_100_000), L(cost=2_300_000), L(cost=4_300_000), L(cost=7_500_000)],
    },
    "land_tank_factory": {
        "power_required": 5,
        "name": "کارخانه تانک‌سازی", "group": "land", "icon": "🛡️",
        "desc": "تانک تولید می‌کند. از سطح ۲ به بعد هر ارتقا ۵٪ به دفاع یگان‌های زمینی اضافه می‌کند.",
        "bonus": {"defense": 0.05},
        "levels": [L(cost=600_000), L(cost=1_300_000), L(cost=2_800_000), L(cost=5_200_000), L(cost=9_000_000)],
    },
    "naval_port": {
        "power_required": 4,
        "name": "بندر", "group": "naval", "icon": "⚓",
        "desc": "محل پهلو گرفتن ناوگان. هر سطح ظرفیت بندر را بیشتر می‌کند.",
        "levels": [L(cost=500_000, capacity=2000), L(cost=1_090_000, capacity=4000), L(cost=2_360_000, capacity=6000), L(cost=4_360_000, capacity=8000), L(cost=7_730_000, capacity=10000)],
    },
    "naval_shipyard": {
        "power_required": 8,
        "name": "کشتی‌سازی", "group": "naval", "icon": "🚢",
        "desc": "زیردریایی، ناو، ناو ترابری و ناو هواپیمابر تولید می‌کند. از سطح ۲ به بعد هر ارتقا ۵٪ به دفاع یگان‌های دریایی اضافه می‌کند.",
        "bonus": {"defense": 0.05},
        "levels": [L(cost=750_000), L(cost=1_580_000), L(cost=3_330_000), L(cost=6_080_000), L(cost=10_420_000)],
    },
    "air_airport": {
        "power_required": 5,
        "name": "فرودگاه", "group": "air", "icon": "🛫",
        "desc": "محل استقرار جنگنده، بمب‌افکن و بالگرد. هر سطح ظرفیت فرودگاه را بیشتر می‌کند.",
        "levels": [L(cost=550_000, capacity=2500), L(cost=1_180_000, capacity=5000), L(cost=2_450_000, capacity=7500), L(cost=4_570_000, capacity=10000), L(cost=7_870_000, capacity=12500)],
    },
    "air_arsenal": {
        "power_required": 7,
        "name": "ادوات هوایی", "group": "air", "icon": "✈️",
        "desc": "جنگنده، بمب‌افکن و بالگرد تولید می‌کند. از سطح ۲ به بعد هر ارتقا ۵٪ به دفاع یگان‌های هوایی اضافه می‌کند.",
        "bonus": {"defense": 0.05},
        "levels": [L(cost=800_000), L(cost=1_680_000), L(cost=3_540_000), L(cost=6_400_000), L(cost=10_950_000)],
    },
    "missile_depot": {
        "power_required": 8,
        "name": "انبار موشک", "group": "missile", "icon": "🚀",
        "desc": "محل نگهداری موشک‌ها. هر سطح ظرفیت انبار را بیشتر می‌کند.",
        "levels": [L(cost=2_000_000, capacity=4000), L(cost=4_200_000, capacity=8000), L(cost=8_800_000, capacity=12000), L(cost=16_000_000, capacity=16000), L(cost=27_000_000, capacity=20000)],
    },
    "missile_factory": {
        "power_required": 10,
        "name": "موشک‌سازی", "group": "missile", "icon": "🎯",
        "desc": "موشک تولید می‌کند. سطح بالاتر موشک‌های قوی‌تر را باز می‌کند و از سطح ۲ به بعد هر ارتقا ۵٪ به دفاع موشک‌ها اضافه می‌کند.",
        "bonus": {"defense": 0.05},
        "levels": [L(cost=2_400_000), L(cost=5_040_000), L(cost=10_560_000), L(cost=19_200_000), L(cost=32_400_000)],
    },
    "satellite": {
        "power_required": 6,
        "name": "ماهواره", "group": "strategy", "icon": "🛰️",
        "desc": "پایگاه ماهواره‌ای. تب «ماهواره» در بخش جنگ را باز می‌کند: پرتاب ماهواره، اسکن سکوها و تنگه‌ها و اسکن کشورها.",
        "levels": [L(cost=6_000_000)],
    },
    # ==================== رفاه و امنیت ====================
    "hospital": {
        "power_required": 6, "name": "بیمارستان", "group": "welfare", "icon": "🏥",
        "desc": "هر سطح ۲٪ به پاداش رفاه اضافه می‌کند و اثر همه‌گیری را کم می‌کند.",
        "levels": [L(cost=500_000, welfare=2), L(cost=1_100_000, welfare=2), L(cost=2_200_000, welfare=2), L(cost=4_200_000, welfare=2), L(cost=7_500_000, welfare=2)],
    },
    "police": {
        "power_required": 4, "name": "ایستگاه پلیس", "group": "welfare", "icon": "🚓",
        "desc": "هر سطح ۲٪ به پاداش رفاه اضافه می‌کند و اثر موج سرقت را کم می‌کند.",
        "levels": [L(cost=350_000, welfare=2), L(cost=800_000, welfare=2), L(cost=1_600_000, welfare=2), L(cost=3_100_000, welfare=2), L(cost=5_600_000, welfare=2)],
    },
    "housing": {
        "power_required": 8, "name": "شهرک مسکونی", "group": "welfare", "icon": "🏘️",
        "desc": "هر سطح ۲٪ به پاداش رفاه اضافه می‌کند و اثر زلزله را کم می‌کند.",
        "levels": [L(cost=600_000, welfare=2), L(cost=1_300_000, welfare=2), L(cost=2_600_000, welfare=2), L(cost=5_000_000, welfare=2), L(cost=9_000_000, welfare=2)],
    },
    "metro": {
        "power_required": 12, "name": "مترو", "group": "welfare", "icon": "🚇",
        "desc": "هر سطح ۲٪ به پاداش رفاه اضافه می‌کند و اثر قحطی را کم می‌کند.",
        "levels": [L(cost=800_000, welfare=2), L(cost=1_800_000, welfare=2), L(cost=3_600_000, welfare=2), L(cost=6_800_000, welfare=2), L(cost=12_000_000, welfare=2)],
    },
    "university": {
        "power_required": 10, "name": "دانشگاه", "group": "welfare", "icon": "🎓",
        "desc": "هر سطح ۲٪ به پاداش رفاه اضافه می‌کند و اثر خشکسالی را کم می‌کند.",
        "levels": [L(cost=700_000, welfare=2), L(cost=1_500_000, welfare=2), L(cost=3_000_000, welfare=2), L(cost=5_800_000, welfare=2), L(cost=10_000_000, welfare=2)],
    },
}

UPKEEP_RATE = 0.005   # هزینهٔ نگهداری روزانه = ۰٫۵٪ مجموع پولِ خرج‌شده روی ساخت و ارتقا

ECO_UPKEEP_RATE = 0.12   # هزینهٔ روزانهٔ سرمایه‌گذاری اقتصادی = ۱۲٪ درآمد روزانهٔ همان سطح (درآمد خالص همچنان مثبت است)

def infra_upkeep(item, lv):
    if lv <= 0: return 0
    if item.get("group") == "eco":
        levels = item["levels"]
        return int(round(levels[min(lv, len(levels)) - 1]["income"] * ECO_UPKEEP_RATE / 100.0)) * 100
    levels = item["levels"]
    invested = sum(l["cost"] for l in levels[:min(lv, len(levels))])
    return int(round(invested * UPKEEP_RATE / 100.0)) * 100

ECONOMY = {
    "eco_agriculture": {
        "name": "کشاورزی و دامداری", "group": "eco", "icon": "🌾",
        "desc": "سرمایه‌گذاری کم‌ریسک در تولید و صادرات محصولات غذایی.", "power_required": 2,
        "levels": [L(cost=720_000, income=360_000), L(cost=1_200_000, income=635_000), L(cost=1_840_000, income=1_030_000), L(cost=2_640_000, income=1_560_000), L(cost=3_600_000, income=2_230_000)],
    },
    "eco_textile": {
        "name": "کارخانه نساجی", "group": "eco", "icon": "🧵",
        "desc": "تولید پوشاک و منسوجات برای بازار داخلی و صادرات.", "power_required": 3,
        "levels": [L(cost=910_000, income=465_000), L(cost=1_460_000, income=795_000), L(cost=2_190_000, income=1_255_000), L(cost=3_040_000, income=1_835_000), L(cost=4_240_000, income=2_685_000)],
    },
    "eco_fishing": {
        "name": "شیلات و فرآوری غذا", "group": "eco", "icon": "🐟",
        "desc": "صادرات محصولات دریایی با سرمایه‌گذاری آغازین مناسب.", "power_required": 2,
        "levels": [L(cost=840_000, income=440_000), L(cost=1_360_000, income=755_000), L(cost=2_080_000, income=1_220_000), L(cost=2_960_000, income=1_825_000), L(cost=4_000_000, income=2_585_000)],
    },
    "eco_construction": {
        "name": "شرکت عمرانی", "group": "eco", "icon": "🏗️",
        "desc": "پروژه‌های ساخت‌وساز داخلی و قراردادهای عمرانی.", "power_required": 3,
        "levels": [L(cost=1_220_000, income=660_000), L(cost=1_820_000, income=1_035_000), L(cost=2_740_000, income=1_640_000), L(cost=3_800_000, income=2_390_000), L(cost=5_170_000, income=3_405_000)],
    },
    "eco_mining": {
        "name": "معدن‌کاری", "group": "eco", "icon": "⛏️",
        "desc": "استخراج و فروش مواد معدنی؛ درآمد مناسب با مصرف برق بیشتر.", "power_required": 4,
        "levels": [L(cost=1_220_000, income=675_000), L(cost=1_890_000, income=1_100_000), L(cost=2_740_000, income=1_675_000), L(cost=3_800_000, income=2_440_000), L(cost=5_170_000, income=3_475_000)],
    },
    "eco_steel": {
        "name": "کارخانه فولاد", "group": "eco", "icon": "⚙️",
        "desc": "تولید محصولات فلزی و صنعتی با هزینهٔ آغازین بالاتر.", "power_required": 5,
        "levels": [L(cost=1_520_000, income=860_000), L(cost=2_310_000, income=1_375_000), L(cost=3_280_000, income=2_050_000), L(cost=4_500_000, income=2_945_000), L(cost=6_080_000, income=4_165_000)],
    },
    "eco_tourism": {
        "name": "گردشگری و هتل‌داری", "group": "eco", "icon": "🏨",
        "desc": "درآمد از گردشگری، هتل‌ها و خدمات شهری.", "power_required": 4,
        "levels": [L(cost=1_670_000, income=965_000), L(cost=2_430_000, income=1_475_000), L(cost=3_500_000, income=2_235_000), L(cost=4_860_000, income=3_245_000), L(cost=6_540_000, income=4_565_000)],
    },
    "eco_trade": {
        "name": "تجارت بین‌الملل", "group": "eco", "icon": "🚢",
        "desc": "گسترش شبکهٔ واردات و صادرات کشور.", "power_required": 6,
        "levels": [L(cost=2_000_000, income=1_180_000), L(cost=2_920_000, income=1_815_000), L(cost=4_140_000, income=2_695_000), L(cost=5_680_000, income=3_865_000), L(cost=7_680_000, income=5_460_000)],
    },
    "eco_electronics": {
        "name": "کارخانهٔ تجهیزات الکترونیکی", "group": "eco", "icon": "🔌",
        "desc": "مونتاژ و فروش تجهیزات برقی و الکترونیکی.", "power_required": 7,
        "levels": [L(cost=2_800_000, income=1_690_000), L(cost=4_190_000, income=2_655_000), L(cost=5_990_000, income=3_985_000), L(cost=8_190_000, income=5_685_000), L(cost=10_790_000, income=7_815_000)],
    },
    "eco_oil": {
        "name": "پالایشگاه نفت", "group": "eco", "icon": "🛢️",
        "desc": "تبدیل نفت خام به فرآورده‌های قابل صادرات.", "power_required": 8,
        "levels": [L(cost=3_200_000, income=1_970_000), L(cost=4_530_000, income=2_925_000), L(cost=6_410_000, income=4_340_000), L(cost=8_670_000, income=6_125_000), L(cost=11_680_000, income=8_615_000)],
    },
    "eco_chemicals": {
        "name": "مجتمع پتروشیمی", "group": "eco", "icon": "🧪",
        "desc": "تولید مواد شیمیایی و فرآورده‌های صنعتی برای صادرات.", "power_required": 9,
        "levels": [L(cost=4_000_000, income=2_520_000), L(cost=5_990_000, income=3_950_000), L(cost=8_440_000, income=5_825_000), L(cost=11_310_000, income=8_145_000), L(cost=14_640_000, income=10_980_000)],
    },
    "eco_bank": {
        "name": "بانک مرکزی", "group": "eco", "icon": "🏦",
        "desc": "زیرساخت مالی کشور؛ درآمد بالا با سرمایه‌گذاری بیشتر.", "power_required": 10,
        "levels": [L(cost=5_000_000, income=3_215_000), L(cost=7_500_000, income=5_050_000), L(cost=11_000_000, income=7_740_000), L(cost=15_000_000, income=10_995_000), L(cost=20_000_000, income=15_265_000)],
    },
    "eco_market": {
        "name": "بازار و خرده‌فروشی", "group": "eco", "icon": "🛒",
        "desc": "فروشگاه‌ها و بازارهای محلی؛ شروع ارزان با درآمد روزانهٔ کم.", "power_required": 1,
        "levels": [L(cost=90_000, income=60_000), L(cost=150_000, income=105_000), L(cost=240_000, income=170_000), L(cost=380_000, income=285_000), L(cost=560_000, income=435_000)],
    },
    "eco_handicraft": {
        "name": "صنایع دستی", "group": "eco", "icon": "🏺",
        "desc": "تولید و صادرات صنایع دستی؛ سرمایهٔ اولیهٔ کم و درآمد پایدار.", "power_required": 1,
        "levels": [L(cost=110_000, income=75_000), L(cost=180_000, income=125_000), L(cost=290_000, income=210_000), L(cost=450_000, income=340_000), L(cost=680_000, income=535_000)],
    },
    "eco_dairy": {
        "name": "صنایع لبنی و بسته‌بندی", "group": "eco", "icon": "🥛",
        "desc": "فرآوری لبنیات و مواد غذایی بسته‌بندی‌شده.", "power_required": 2,
        "levels": [L(cost=180_000, income=130_000), L(cost=290_000, income=205_000), L(cost=450_000, income=335_000), L(cost=680_000, income=525_000), L(cost=980_000, income=785_000)],
    },
    "eco_transport": {
        "name": "حمل‌ونقل و لجستیک", "group": "eco", "icon": "🚛",
        "desc": "ناوگان باربری و انبارداری برای بازار داخلی.", "power_required": 3,
        "levels": [L(cost=260_000, income=180_000), L(cost=420_000, income=305_000), L(cost=650_000, income=490_000), L(cost=960_000, income=760_000), L(cost=1_400_000, income=1_140_000)],
    },
    "eco_it": {
        "name": "فناوری اطلاعات", "group": "eco", "icon": "💻",
        "desc": "شرکت‌های نرم‌افزاری و خدمات دیجیتال.", "power_required": 4,
        "levels": [L(cost=900_000, income=640_000), L(cost=1_450_000, income=1_070_000), L(cost=2_200_000, income=1_690_000), L(cost=3_200_000, income=2_555_000), L(cost=4_500_000, income=3_725_000)],
    },
    "eco_pharma": {
        "name": "داروسازی", "group": "eco", "icon": "💊",
        "desc": "تولید دارو و تجهیزات پزشکی برای داخل و صادرات.", "power_required": 5,
        "levels": [L(cost=2_400_000, income=1_260_000), L(cost=2_750_000, income=2_060_000), L(cost=4_120_000, income=3_220_000), L(cost=5_880_000, income=4_760_000), L(cost=8_120_000, income=6_830_000)],
    },
    "eco_auto": {
        "name": "خودروسازی", "group": "eco", "icon": "🚗",
        "desc": "خط تولید خودرو و قطعات صنعتی.", "power_required": 7,
        "levels": [L(cost=3_600_000, income=2_205_000), L(cost=4_650_000, income=3_555_000), L(cost=6_750_000, income=5_360_000), L(cost=9_450_000, income=7_785_000), L(cost=12_900_000, income=11_020_000)],
    },
    "eco_aerospace": {
        "name": "صنایع هوافضا", "group": "eco", "icon": "🛰️",
        "desc": "فناوری پیشرفتهٔ هوایی و فضایی با درآمد بالا.", "power_required": 9,
        "levels": [L(cost=5_900_000, income=4_405_000), L(cost=8_850_000, income=6_875_000), L(cost=12_780_000, income=10_315_000), L(cost=17_700_000, income=14_820_000), L(cost=23_600_000, income=20_465_000)],
    },
    "eco_stock": {
        "name": "بورس و بازار سرمایه", "group": "eco", "icon": "📈",
        "desc": "بازار سهام و اوراق؛ بیشترین بازده با سرمایهٔ بالا.", "power_required": 10,
        "levels": [L(cost=6_000_000, income=4_560_000), L(cost=9_090_000, income=7_175_000), L(cost=13_200_000, income=10_825_000), L(cost=18_170_000, income=15_445_000), L(cost=24_000_000, income=21_120_000)],
    },
}

# =========================================================
# زمان‌بندی فعالیت‌ها
# =========================================================
# فعالیت‌های خانه (ساخت، ارتقا، سرمایه‌گذاری): زمان هر سطح از هزینه‌اش محاسبه می‌شود (مقیاس لگاریتمی)؛
# ارزان‌ترین سطح ≈ ۲۰ دقیقه و گران‌ترین سطح ≈ ۲ ساعت. چون هزینه با هر سطح بالاتر می‌رود، زمان هم بیشتر می‌شود.
HOME_TIME_MIN_SEC = 20 * 60
HOME_TIME_MAX_SEC = 120 * 60
HOME_TIME_COST_LOW = 180_000
HOME_TIME_COST_HIGH = 36_840_000
HOME_TIME_STEP_SEC = 60

def auto_home_seconds(cost):
    c = min(max(float(cost or 0), HOME_TIME_COST_LOW), HOME_TIME_COST_HIGH)
    f = (math.log(c) - math.log(HOME_TIME_COST_LOW)) / (math.log(HOME_TIME_COST_HIGH) - math.log(HOME_TIME_COST_LOW))
    sec = HOME_TIME_MIN_SEC + f * (HOME_TIME_MAX_SEC - HOME_TIME_MIN_SEC)
    sec = int(round(sec / HOME_TIME_STEP_SEC) * HOME_TIME_STEP_SEC)
    return max(HOME_TIME_MIN_SEC, min(HOME_TIME_MAX_SEC, sec))

# زمان ساخت نیروگاه‌ها (دقیقه): از ۲۰ دقیقه شروع می‌شود و با هر ارتقا کمی بیشتر می‌شود
POWER_TIMES_MIN = {
    "power_coal":    [20, 25, 31],
    "power_wind":    [22, 28, 35],
    "power_solar":   [25, 32, 40],
    "power_nuclear": [30, 38, 47],
}

# صنایع سنگین اقتصاد: زمان ساخت از ۲۰ دقیقه (ارزان‌ترین سطح) تا ۳ ساعت (گران‌ترین سطح) بر اساس قیمت؛ با هر ارتقا بیشتر می‌شود.
HEAVY_ECO_IDS = ("eco_stock", "eco_aerospace", "eco_bank", "eco_chemicals", "eco_oil", "eco_auto", "eco_electronics", "eco_trade", "eco_pharma")
HEAVY_TIME_MIN_SEC = 20 * 60
HEAVY_TIME_MAX_SEC = 180 * 60

def _apply_heavy_eco_times(catalog):
    costs = [lv["cost"] for iid in HEAVY_ECO_IDS for lv in catalog[iid]["levels"]]
    lo, hi = min(costs), max(costs)
    for iid in HEAVY_ECO_IDS:
        prev = 0
        for lv in catalog[iid]["levels"]:
            f = (math.log(lv["cost"]) - math.log(lo)) / (math.log(hi) - math.log(lo))
            t = HEAVY_TIME_MIN_SEC + f * (HEAVY_TIME_MAX_SEC - HEAVY_TIME_MIN_SEC)
            t = int(round(t / HOME_TIME_STEP_SEC) * HOME_TIME_STEP_SEC)
            if t <= prev: t = prev + HOME_TIME_STEP_SEC
            lv["time"] = t; prev = t

def _apply_auto_times(catalog):
    for iid, item in catalog.items():
        if iid in POWER_TIMES_MIN:
            for lv, m in zip(item["levels"], POWER_TIMES_MIN[iid]): lv["time"] = m * 60
            continue
        prev = 0
        for lv in item["levels"]:
            t = auto_home_seconds(lv.get("cost", 0))
            if t <= prev: t = min(HOME_TIME_MAX_SEC, prev + HOME_TIME_STEP_SEC)   # با بالا رفتن سطح زمان کمتر نشود
            lv["time"] = t; prev = t

_apply_auto_times(INFRASTRUCTURE)
_apply_auto_times(ECONOMY)
_apply_heavy_eco_times(ECONOMY)

# صف کارخانهٔ ارتش: برای هر دسته یک صف مستقل. ظرفیت = تعداد «سفارش» ثبت‌شده در صف (نه تعداد واحدها).
FACTORY_QUEUE_LIMITS = {"land": 20, "naval": 16, "air": 20, "missile": 12}
FACTORY_GROUP_NAMES = {"land": "نیروهای زمینی", "naval": "نیروهای دریایی", "air": "نیروهای هوایی", "missile": "موشک‌ها"}
FACTORY_REQUEST_ID_KEEP = 60     # شناسهٔ آخرین درخواست‌های ثبت سفارش، برای جلوگیری از ثبت دوباره
TG_OUTBOX_MAX_ATTEMPTS = 8       # بیشتر از این تعداد تلاش ناموفق (مثلاً ربات بلاک شده) رها می‌شود
TG_DONE_KEEP = 100

ARMY_UNITS = {
    "infantry": {"name": "پیاده‌نظام", "group": "land", "requires": ["land_barracks", "land_hq"],
        "cost": 50_000, "manpower": 150, "resources": {"food": 1000}, "daily": {"food": 20},
        "attack": 20, "defense": 10},
    "tank": {"name": "تانک", "group": "land", "requires": ["land_barracks", "land_hq", "land_tank_factory"],
        "cost": 150_000, "manpower": 400, "resources": {"steel": 300, "food": 1500}, "daily": {"food": 30, "oil": 40, "steel": 10},
        "attack": 50, "defense": 25},
    "ship": {"name": "ناو دریایی", "group": "naval", "requires": ["naval_port", "naval_shipyard"],
        "cost": 250_000, "manpower": 1200, "resources": {"oil": 250, "food": 1500}, "daily": {"food": 40, "oil": 100, "steel": 10},
        "attack": 50, "defense": 60},
    "submarine": {"name": "زیردریایی", "group": "naval", "requires": ["naval_port", "naval_shipyard"],
        "cost": 200_000, "manpower": 800, "resources": {"oil": 200, "steel": 150}, "daily": {"food": 20, "oil": 80, "steel": 10},
        "attack": 45, "defense": 25},
    "transport_ship": {"name": "ناو ترابری", "group": "naval", "requires": ["naval_port", "naval_shipyard"],
        "cost": 180_000, "manpower": 600, "resources": {"oil": 150, "steel": 200}, "daily": {"food": 20, "oil": 50, "steel": 10},
        "attack": 5, "defense": 40, "transport_capacity": 500},
    "aircraft_carrier": {"name": "ناو هواپیمابر", "group": "naval", "requires": ["naval_port", "naval_shipyard"],
        "cost": 800_000, "manpower": 4000, "resources": {"oil": 800, "steel": 1200}, "daily": {"food": 80, "oil": 300, "steel": 20},
        "attack": 25, "defense": 90, "aircraft_capacity": 40},
    "fighter": {"name": "جنگنده", "group": "air", "requires": ["air_airport", "air_arsenal"],
        "cost": 200_000, "manpower": 500, "resources": {"oil": 200, "steel": 100}, "daily": {"food": 10, "oil": 50},
        "attack": 45, "defense": 40},
    "bomber": {"name": "بمب‌افکن", "group": "air", "requires": ["air_airport", "air_arsenal"],
        "cost": 250_000, "manpower": 600, "resources": {"oil": 300, "steel": 150}, "daily": {"food": 20, "oil": 80},
        "attack": 60, "defense": 15},
    "helicopter": {"name": "بالگرد", "group": "air", "requires": ["air_airport", "air_arsenal"],
        "cost": 120_000, "manpower": 300, "resources": {"oil": 120, "steel": 60}, "daily": {"food": 10, "oil": 30},
        "attack": 30, "defense": 35},
    "air_tanker": {"name": "هواپیمای سوخت‌رسان", "group": "air", "requires": ["air_airport", "air_arsenal"],
        "cost": 220_000, "manpower": 400, "resources": {"oil": 250, "steel": 120}, "daily": {"food": 10, "oil": 80},
        "attack": 2, "defense": 20, "refuel_capacity": 20},
    # یگان‌ها و موشک‌ها: علاوه بر هزینهٔ ساخت، منابع روزانهٔ نگهداری دارند
    "cruise_missile": {"name": "موشک کروز", "group": "missile", "requires": ["missile_depot", "missile_factory"],
        "min_level": {"missile_factory": 1},
        "cost": 400_000, "manpower": 300, "resources": {"steel": 300, "oil": 200, "food": 500},
        "daily": {"food": 20, "oil": 50, "steel": 30},
        "attack": 70, "defense": 5},
    "ballistic_missile": {"name": "موشک بالستیک", "group": "missile", "requires": ["missile_depot", "missile_factory"],
        "min_level": {"missile_factory": 3},
        "cost": 900_000, "manpower": 800, "resources": {"steel": 600, "oil": 400, "food": 1000},
        "daily": {"food": 30, "oil": 100, "steel": 60},
        "attack": 120, "defense": 10},
    "icbm": {"name": "موشک قاره‌پیما", "group": "missile", "requires": ["missile_depot", "missile_factory"],
        "min_level": {"missile_factory": 5},
        "cost": 2_500_000, "manpower": 2000, "resources": {"steel": 1200, "oil": 900, "food": 2000},
        "daily": {"food": 50, "oil": 200, "steel": 120},
        "attack": 250, "defense": 20},
}

# زمان ساخت «هر یک واحد» (ثانیه) ≈ ۱٫۲ ثانیه به ازای هر ۱٬۰۰۰ دلار هزینهٔ واحد؛ سفارشِ N تایی N برابر آن طول می‌کشد
# و واحدها یکی‌یکی (به‌تدریج) تحویل می‌شوند. پس سفارش کوچک و سفارش بزرگ زمان یکسان ندارند.
UNIT_BUILD_SECONDS = {
    "infantry": 60,            # ۱ دقیقه
    "tank": 3 * 60,
    "ship": 5 * 60,
    "submarine": 4 * 60,
    "transport_ship": 216,     # ۳٫۶ دقیقه
    "aircraft_carrier": 16 * 60,
    "fighter": 4 * 60,
    "bomber": 5 * 60,
    "helicopter": 144,         # ۲٫۴ دقیقه
    "air_tanker": 264,         # ۴٫۴ دقیقه
    "cruise_missile": 8 * 60,
    "ballistic_missile": 18 * 60,
    "icbm": 50 * 60,
}
for _uid, _sec in UNIT_BUILD_SECONDS.items():
    ARMY_UNITS[_uid]["build_seconds"] = _sec
assert all(u.get("build_seconds", 0) > 0 for u in ARMY_UNITS.values()), "every army unit needs build_seconds"

REMOVED_MAP_SITES = ("food_safrica", "food_ukraine", "steel_blacksea")

MAP_RESOURCES = {
    # همهٔ سکوها و معدن‌ها در دریا هستند (روی خشکی کشور فعال نمی‌افتند) — zone: sea
    # ---------- نفت ----------
    "oil_gulf": {"type": "oil", "zone": "sea", "name": "سکوی قطر", "lon": 51.5, "lat": 27.0, "production": 5_000_000},
    "oil_northsea": {"type": "oil", "zone": "sea", "name": "سکوی دانمارک", "lon": 5.5, "lat": 57.8, "production": 4_000_000},
    "oil_gom": {"type": "oil", "zone": "sea", "name": "سکوی آمریکا (خلیج مکزیک)", "lon": -90.5, "lat": 28.2, "production": 4_000_000},
    "oil_campos": {"type": "oil", "zone": "sea", "name": "سکوی برزیل", "lon": -40.0, "lat": -22.5, "production": 2_500_000},
    "oil_texas": {"type": "oil", "zone": "sea", "name": "سکوی مکزیک", "lon": -94.5, "lat": 26.5, "production": 4_000_000},
    "oil_ghawar": {"type": "oil", "zone": "sea", "name": "سکوی امارات", "lon": 54.0, "lat": 25.6, "production": 5_000_000},
    "oil_siberia": {"type": "oil", "zone": "sea", "name": "سکوی روسیه (کارا)", "lon": 74.0, "lat": 76.0, "production": 4_000_000},
    "oil_westafrica": {"type": "oil", "zone": "sea", "name": "سکوی نیجریه", "lon": 5.0, "lat": 3.0, "production": 3_500_000},
    "oil_angola": {"type": "oil", "zone": "sea", "name": "سکوی آنگولا", "lon": 11.0, "lat": -9.0, "production": 3_000_000},
    "oil_barents": {"type": "oil", "zone": "sea", "name": "سکوی روسیه (بارنتس)", "lon": 38.0, "lat": 73.0, "production": 3_000_000},
    "oil_southchina": {"type": "oil", "zone": "sea", "name": "سکوی ویتنام", "lon": 111.0, "lat": 13.0, "production": 3_500_000},
    "oil_beaufort": {"type": "oil", "zone": "sea", "name": "سکوی آمریکا (بوفورت)", "lon": -145.0, "lat": 71.5, "production": 3_000_000},
    "oil_norway": {"type": "oil", "zone": "sea", "name": "سکوی نروژ", "lon": 3.0, "lat": 63.0, "production": 3_500_000},
    "oil_india": {"type": "oil", "zone": "sea", "name": "سکوی هند", "lon": 70.5, "lat": 19.5, "production": 3_500_000},
    "oil_medeast": {"type": "oil", "zone": "sea", "name": "سکوی مصر", "lon": 29.5, "lat": 33.0, "production": 2_500_000},
    # ---------- آهن ----------
    "steel_ruhr": {"type": "steel", "zone": "sea", "name": "معدن آهن هلند (دریای نروژ)", "lon": 1.5, "lat": 66.5, "production": 4_000_000},
    "steel_brazil": {"type": "steel", "zone": "sea", "name": "معدن آهن برزیل", "lon": -33.0, "lat": -8.0, "production": 3_500_000},
    "steel_mesabi": {"type": "steel", "zone": "sea", "name": "معدن آهن کانادا (گرند بنکس)", "lon": -51.0, "lat": 44.0, "production": 3_000_000},
    "steel_anshan": {"type": "steel", "zone": "sea", "name": "معدن آهن چین", "lon": 123.5, "lat": 35.5, "production": 3_500_000},
    "steel_japan": {"type": "steel", "zone": "sea", "name": "معدن آهن ژاپن", "lon": 145.0, "lat": 35.0, "production": 3_500_000},
    "steel_tasman": {"type": "steel", "zone": "sea", "name": "معدن آهن استرالیا", "lon": 156.0, "lat": -30.0, "production": 3_000_000},
    "steel_arabian": {"type": "steel", "zone": "sea", "name": "معدن آهن هند", "lon": 71.0, "lat": 15.0, "production": 3_000_000},
    "steel_biscay": {"type": "steel", "zone": "sea", "name": "معدن آهن فرانسه", "lon": -6.0, "lat": 45.5, "production": 3_000_000},
    "oil_blacksea": {"type": "oil", "zone": "sea", "name": "سکوی ترکیه (دریای سیاه)", "lon": 34.5, "lat": 43.0, "production": 3_000_000},
    # ---------- اورانیوم ----------
    "uranium_kazakh": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم یونان (آیونی)", "lon": 18.0, "lat": 35.5, "production": 2_500_000},
    "uranium_canada": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم کانادا", "lon": -85.0, "lat": 59.5, "production": 2_000_000},
    "uranium_aussie": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم استرالیا", "lon": 128.0, "lat": -11.5, "production": 2_200_000},
    "uranium_niger": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم موریتانی", "lon": -20.0, "lat": 18.0, "production": 2_000_000},
    "uranium_namibia": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم نامیبیا", "lon": 7.0, "lat": -22.0, "production": 2_000_000},
    "uranium_indian": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم اقیانوس هند", "lon": 75.0, "lat": -10.0, "production": 2_200_000},
    "uranium_pacific": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم اقیانوس آرام", "lon": -150.0, "lat": 0.0, "production": 2_200_000},
    "uranium_baltic": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم لیتوانی", "lon": 19.5, "lat": 55.5, "production": 2_000_000},
    # ---------- غذا (آبزیان) ----------
    "steel_bulgaria": {"type": "steel", "zone": "sea", "name": "معدن آهن بلغارستان (دریای سیاه)", "lon": 31.0, "lat": 43.5, "production": 3_000_000},
    "food_india": {"type": "food", "zone": "sea", "name": "ماهیگیری هند (خلیج بنگال)", "lon": 88.0, "lat": 14.0, "production": 2_350_000},
    "food_peru": {"type": "food", "zone": "sea", "name": "ماهیگیری پرو", "lon": -80.0, "lat": -12.5, "production": 2_350_000},
    "food_japansea": {"type": "food", "zone": "sea", "name": "ماهیگیری ژاپن", "lon": 135.0, "lat": 40.0, "production": 2_350_000},
    "food_bering": {"type": "food", "zone": "sea", "name": "ماهیگیری آمریکا (برینگ)", "lon": -170.0, "lat": 58.0, "production": 2_350_000},
    # ---------- آفریقا: منابع بیشتر از هر منطقهٔ دیگر ----------
    "oil_gabon": {"type": "oil", "zone": "sea", "name": "سکوی گابن", "lon": 8.0, "lat": -2.5, "production": 3_500_000},
    "oil_libya": {"type": "oil", "zone": "sea", "name": "سکوی لیبی", "lon": 19.0, "lat": 33.0, "production": 4_000_000},
    "oil_algeria": {"type": "oil", "zone": "sea", "name": "سکوی الجزایر", "lon": 5.0, "lat": 38.0, "production": 3_500_000},
    "oil_redsea": {"type": "oil", "zone": "sea", "name": "سکوی سودان (دریای سرخ)", "lon": 37.8, "lat": 21.5, "production": 3_000_000},
    "oil_mozambique": {"type": "oil", "zone": "sea", "name": "سکوی موزامبیک", "lon": 42.5, "lat": -13.5, "production": 3_000_000},
    "oil_namibia": {"type": "oil", "zone": "sea", "name": "سکوی نامیبیا", "lon": 11.0, "lat": -27.0, "production": 3_000_000},
    "steel_safrica": {"type": "steel", "zone": "sea", "name": "معدن آهن آفریقای جنوبی", "lon": 16.0, "lat": -34.5, "production": 3_500_000},
    "steel_morocco": {"type": "steel", "zone": "sea", "name": "معدن آهن مراکش", "lon": -11.5, "lat": 31.0, "production": 3_000_000},
    "uranium_safrica": {"type": "uranium", "zone": "sea", "name": "معدن اورانیوم آفریقای جنوبی", "lon": 15.0, "lat": -31.5, "production": 2_400_000},
    "food_namibia": {"type": "food", "zone": "sea", "name": "ماهیگیری نامیبیا (بنگوئلا)", "lon": 12.5, "lat": -24.0, "production": 2_350_000},
    "food_senegal": {"type": "food", "zone": "sea", "name": "ماهیگیری سنگال", "lon": -18.5, "lat": 15.5, "production": 2_350_000},
    "food_somalia": {"type": "food", "zone": "sea", "name": "ماهیگیری سومالی", "lon": 52.5, "lat": 10.0, "production": 2_350_000},
    "food_madagascar": {"type": "food", "zone": "sea", "name": "ماهیگیری ماداگاسکار", "lon": 42.5, "lat": -19.0, "production": 2_350_000},
    # ---------- نفتِ بیشتر در سایر مناطق ----------
    "oil_brunei": {"type": "oil", "zone": "sea", "name": "سکوی برونئی", "lon": 113.0, "lat": 5.8, "production": 3_000_000},
    "oil_indonesia": {"type": "oil", "zone": "sea", "name": "سکوی اندونزی", "lon": 108.0, "lat": -4.5, "production": 3_000_000},
    "oil_australia": {"type": "oil", "zone": "sea", "name": "سکوی استرالیا", "lon": 115.0, "lat": -19.5, "production": 3_000_000},
    "oil_venezuela": {"type": "oil", "zone": "sea", "name": "سکوی ونزوئلا", "lon": -64.0, "lat": 12.5, "production": 3_500_000},
    "oil_guyana": {"type": "oil", "zone": "sea", "name": "سکوی گویان", "lon": -56.0, "lat": 8.5, "production": 3_000_000},
}

STRAITS_DATA = {
    "gibraltar": {"name": "تنگه جبل‌الطارق", "lon": -5.6, "lat": 35.9, "income": 20_000},
    "bosporus": {"name": "تنگه بسفر", "lon": 29.0, "lat": 41.1, "income": 20_000},
    "hormuz": {"name": "تنگه هرمز", "lon": 56.3, "lat": 26.6, "income": 20_000},
    "babmandeb": {"name": "تنگه باب‌المندب", "lon": 43.3, "lat": 12.6, "income": 20_000},
    "suez": {"name": "کانال سوئز", "lon": 32.3, "lat": 30.6, "income": 20_000},
    "dover": {"name": "تنگه دوور", "lon": 1.4, "lat": 50.9, "income": 20_000},
    "panama": {"name": "کانال پاناما", "lon": -79.6, "lat": 9.1, "income": 20_000},
    "malacca": {"name": "تنگه مالاکا", "lon": 103.8, "lat": 1.3, "income": 20_000},
    "taiwan": {"name": "تنگه تایوان", "lon": 119.6, "lat": 24.4, "income": 20_000},
    "korea": {"name": "تنگه کره", "lon": 129.9, "lat": 34.0, "income": 20_000},
}

def utcnow(): return datetime.now(timezone.utc)

def parse_dt(s):
    if not s: return None
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except: return None

def _world_meta(world_id=None):
    return worlds_registry.get(str(world_id or active_world_id), {})


def _season_for_elapsed_days(elapsed_days):
    """فصل چرخه‌ای (۲ روز برای هر فصل) و مرز پایان همین فصل بر حسب روز از شروع بازی."""
    elapsed_days = max(0.0, float(elapsed_days))
    step = SEASON_LENGTH_DAYS[SEASONS[0]]
    idx = int(elapsed_days // step)
    season = SEASONS[idx % len(SEASONS)]
    return season, (idx + 1) * step


def get_game_time(player=None, at_time=None):
    meta = _world_meta()
    started = parse_dt(meta.get("game_started_at"))
    now = at_time or utcnow()
    registration_open = bool(meta.get("registration_open", not bool(started)))
    finished = bool(meta.get("game_finished"))
    if not started:
        return {
            "day": 0, "season": "در انتظار شروع", "season_days_left": 0,
            "season_hours_left": 0, "next_season": "بهار",
            "season_hint": "منتظر فرمانده بمان؛ شروع روز اول برای همهٔ بازیکنان هم‌زمان است.",
            "season_effects": dict(SEASON_EFFECTS["بهار"]),
            "game_started": False, "game_finished": False,
            "registration_open": registration_open, "game_started_at": None,
            "game_ends_at": None, "game_winner": meta.get("winner"),
        }
    game_end = started + timedelta(days=GAME_TOTAL_DAYS)
    effective_now = min(max(now, started), game_end)
    elapsed_seconds = max(0.0, (effective_now - started).total_seconds())
    elapsed_days = min(float(GAME_TOTAL_DAYS), elapsed_seconds / 86400.0)
    day = min(GAME_TOTAL_DAYS, int(elapsed_days) + 1)
    season, boundary_day = _season_for_elapsed_days(elapsed_days)
    season_end = min(started + timedelta(days=boundary_day), game_end)
    remaining = max(timedelta(0), season_end - effective_now)
    effects = dict(SEASON_EFFECTS[season])
    hint = SEASON_HINTS[season]
    winner = meta.get("winner")
    return {
        "season_end": season_end.isoformat(), "day": day, "season": season,
        "season_days_left": remaining.days,
        "season_hours_left": remaining.seconds // 3600,
        "next_season": SEASONS[(SEASONS.index(season) + 1) % len(SEASONS)] if season_end < game_end else "پایان بازی",
        "season_seconds_left": int(remaining.total_seconds()),
        "season_hint": hint, "season_effects": effects,
        "game_started": True, "game_finished": finished or now >= game_end,
        "registration_open": registration_open, "game_started_at": started.isoformat(),
        "game_ends_at": game_end.isoformat(), "game_winner": winner,
    }

def get_infra_level(player, item_id):
    return player.get("infra_levels", {}).get(item_id, 0)

def get_item_info(catalog, item_id, level):
    if level <= 0: return None
    levels = catalog[item_id]["levels"]
    return levels[min(level, len(levels)) - 1]

def get_power_total(player):
    total = 0
    for item_id, item in INFRASTRUCTURE.items():
        if item.get("group") != "power": continue
        lv = get_infra_level(player, item_id)
        if lv > 0: total += item["levels"][min(lv, len(item["levels"])) - 1]["capacity"]
    return total

def get_power_used(player):
    total = 0
    for item_id, item in ECONOMY.items():
        lv = get_infra_level(player, item_id)
        if lv > 0: total += item["power_required"] * lv
    for item_id, item in INFRASTRUCTURE.items():
        lv = get_infra_level(player, item_id)
        if lv > 0: total += item.get("power_required", 0) * min(lv, len(item["levels"]))
    return total

def get_group_capacity(player, group):
    total = 0
    for item_id, item in INFRASTRUCTURE.items():
        if item.get("group") != group: continue
        lv = get_infra_level(player, item_id)
        if lv > 0: total += item["levels"][min(lv, len(item["levels"])) - 1].get("capacity", 0)
    return total

def group_defense_mult(player, group):
    # سطح ۱ اثری ندارد؛ از سطح ۲ به بعد هر ارتقا درصدِ دفاع اضافه می‌کند
    t = 0.0
    for iid, item in INFRASTRUCTURE.items():
        v = item.get("bonus", {}).get("defense")
        if not v or item.get("group") != group: continue
        t += v * max(0, min(get_infra_level(player, iid), len(item["levels"])) - 1)
    return 1 + t

def get_group_units(player, group):
    total = 0
    dep = deployed_units(player.get("country"))
    for unit_id, unit in ARMY_UNITS.items():
        if unit["group"] == group:
            total += player.get("units", {}).get(unit_id, 0) + dep.get(unit_id, 0)
    return total

def recompute_army(player):
    """قدرت کل همهٔ یگان‌های زندهٔ کشور؛ خانه، مواضع تصرف‌شده و مسیر حرکت."""
    total = 0
    cid = player.get("country")
    dep = deployed_units(cid)
    in_transit = {}
    # اعزام نیرو آن‌ها را از واحدهای داخل کشور خارج می‌کند؛ تا رسیدن/بازگشت،
    # نباید قدرتشان از جمع قدرت نظامی ناپدید شود.
    for transit in transits:
        if transit.get("owner") != cid:
            continue
        for uid_, count in (transit.get("units") or {}).items():
            in_transit[uid_] = in_transit.get(uid_, 0) + max(0, int(count or 0))
    for unit_id, unit in ARMY_UNITS.items():
        dm = group_defense_mult(player, unit["group"])
        count = (player.get("units", {}).get(unit_id, 0)
                 + dep.get(unit_id, 0) + in_transit.get(unit_id, 0))
        total += max(0, count) * (unit["attack"] + unit["defense"] * dm)
    player["army"] = int(round(total))

def ensure_player_fields(player):
    player.setdefault("resources", dict(STARTING_RESOURCES))
    for k in RESOURCE_NAMES: player["resources"].setdefault(k, 0)
    units = player.setdefault("units", {})
    for uid_ in ARMY_UNITS: units.setdefault(uid_, 0)
    for stale in [k for k in units if k not in ARMY_UNITS]: del units[stale]
    lv_map = player.setdefault("infra_levels", {})
    for k in list(lv_map):
        if k in INFRASTRUCTURE: lv_map[k] = min(lv_map[k], len(INFRASTRUCTURE[k]["levels"]))
        elif k not in ECONOMY: del lv_map[k]
    player.setdefault("build_queue", [])  # صف فعالیت‌های خانه (ساخت/ارتقا/سرمایه‌گذاری) — حداکثر یک فعالیت هم‌زمان
    factory_queues(player)                # صف مستقل کارخانهٔ ارتش، یک صف برای هر دسته
    player.setdefault("factory_request_ids", [])
    player.setdefault("tg_outbox", [])    # اعلان‌های تلگرامیِ هنوز ارسال‌نشده (پایدار؛ فقط پس از ارسال موفق حذف می‌شود)
    player.setdefault("tg_done", [])      # شناسهٔ اعلان‌های تلگرامیِ ارسال‌شده (ضد تکرار)
    player.setdefault("activity_notices", [])  # اعلان‌های پایان فعالیت که هنوز به بازیکن نمایش داده نشده‌اند
    player.setdefault("map_holdings", {})
    player.setdefault("strait_holdings", {})
    player.setdefault("announcements", {}); player.setdefault("land_trade_open", True)
    player.setdefault("is_eliminated", False)
    player.setdefault("scans", 0)
    player.setdefault("scan_active", {})
    player.setdefault("vip", False)
    player.setdefault("welfare_events", [])

# ---------------- رفاه و امنیت ----------------
WELFARE_PER_LEVEL = 2.0                 # هر سطح ساختمان = ۲ واحد (٪)
WELFARE_MAX = 50.0                      # سقف پاداش
WELFARE_RECOVERY_PER_PERIOD = 3.0       # هر دوره ۳ واحد جبران می‌شود
WELFARE_RECOVERY_PERIOD_HOURS = 6
WELFARE_EVENT_MIN_H, WELFARE_EVENT_MAX_H = 2, 6
WELFARE_EVENTS = {
    "earthquake": {"name": "زلزله",     "icon": "🌋", "bld": "housing",    "drop": 6.0, "chance": 0.7, "hours": 3},
    "pandemic":   {"name": "همه‌گیری",   "icon": "🦠", "bld": "hospital",   "drop": 5.0, "chance": 0.7, "hours": 3},
    "crime":      {"name": "موج سرقت",  "icon": "🚨", "bld": "police",     "drop": 4.0, "chance": 0.8, "hours": 1.5},
    "drought":    {"name": "خشکسالی",   "icon": "⚠️", "bld": "university", "drop": 3.0, "chance": 0.7, "hours": 2},
    "famine":     {"name": "قحطی",      "icon": "🍞", "bld": "metro",      "drop": 5.0, "chance": 0.6, "hours": 3},
}
COUNTRY_RISKS = {"germany": ["crime"], "britain": ["pandemic"], "ussr": ["famine", "drought"],
                 "usa": ["crime", "earthquake"], "france": ["drought"], "italy": ["earthquake"],
                 "china": ["pandemic", "earthquake"], "japan": ["earthquake"],
                 "saudi": ["drought"], "iran": ["earthquake"], "turkey": ["earthquake"],
                 "venezuela": ["crime"], "egypt": ["drought"]}

def welfare_gross(player):
    total = 0
    for item_id, item in INFRASTRUCTURE.items():
        if item.get("group") != "welfare": continue
        lv = min(get_infra_level(player, item_id), len(item["levels"]))
        total += lv * WELFARE_PER_LEVEL
    return min(WELFARE_MAX, total)

def welfare_penalty_now(player):
    """مجموع خسارت‌های موقتِ فعال رویدادها (هر خسارت تا زمان پایانش دارد و بعد کاملاً برمی‌گردد)."""
    now = utcnow(); total = 0.0
    for pen in player.get("welfare_penalties") or []:
        until = parse_dt(pen.get("until"))
        if until and until > now: total += float(pen.get("amt", 0) or 0)
    # سازگاری با دادهٔ قدیمی (افت تدریجی)
    old = player.get("welfare_penalty", 0) or 0
    at = parse_dt(player.get("welfare_pen_at"))
    if old > 0 and at:
        hours = max(0.0, (now - at).total_seconds() / 3600)
        total += max(0.0, old - WELFARE_RECOVERY_PER_PERIOD * hours / WELFARE_RECOVERY_PERIOD_HOURS)
    return total

def welfare_bonus(player):
    return max(0.0, welfare_gross(player) - welfare_penalty_now(player))

def compute_rates(player, _occ=True, at_time=None):
    power_capacity = get_power_total(player)
    power_consumption = get_power_used(player)
    manpower_production = BASE_MANPOWER_PRODUCTION
    resource_production = {k: 0 for k in RESOURCE_NAMES}
    resource_consumption = {k: 0 for k in RESOURCE_NAMES}
    res_infra = {k: 0 for k in RESOURCE_NAMES}
    res_sites = {k: [] for k in RESOURCE_NAMES}
    res_units = {k: [] for k in RESOURCE_NAMES}
    base_income = BASE_DAILY_INCOME
    income = base_income
    eco_income = 0
    map_income = 0
    strait_income = 0
    occupation_income = 0
    upkeep = 0

    for item_id, item in INFRASTRUCTURE.items():
        group = item.get("group")
        lv = min(get_infra_level(player, item_id), len(item["levels"]))
        if lv <= 0: continue
        upkeep += infra_upkeep(item, lv)
        lvl = item["levels"][lv - 1]
        if group == "manpower": manpower_production += lvl["production"]
        elif group == "resource":
            key = item.get("resource_key")
            if key:
                resource_production[key] += lvl["production"]
                res_infra[key] += lvl["production"]

    for item_id, item in ECONOMY.items():
        lv = get_infra_level(player, item_id)
        if lv > 0:
            eco_income += item["levels"][min(lv, len(item["levels"])) - 1]["income"]
            upkeep += infra_upkeep(item, lv)
    # درآمد ساختمان‌های اقتصادی ابتدا بدون پاداش رفاه جمع می‌شود.
    income += eco_income
    wb = welfare_bonus(player)

    country = player.get("country")

    # ----- منابع تصرف‌شده روی نقشه (باگ قبلی: از دیکشنری گلوبال می‌خوانیم) -----
    for key, owner in map_holdings.items():
        if owner != country: continue
        res = MAP_RESOURCES.get(key)
        if not res: continue
        if res["type"] in res_sites:
            amt = res["production"] // 5
            resource_production[res["type"]] += amt
            res_sites[res["type"]].append({"name": res.get("name", key), "amount": amt})

    for key, owner in strait_holdings.items():
        if owner != country: continue
        s = STRAITS_DATA.get(key)
        if s:
            # تنگه‌ها درآمد روزانه ندارند؛ فقط عوارض هنگام عبور مستقیماً به خزانهٔ مالک واریز می‌شود.
            pass

    # کشور اشغال‌شده: ۳۰٪ درآمد پایه/اقتصادی و تولید نیروی انسانیِ کشور مغلوب به اشغالگر می‌رسد.
    if _occ:
        for target_country, occupier in occupied_countries.items():
            if occupier != country: continue
            yield_row = occupation_yields.get(target_country, {})
            if yield_row and yield_row.get("owner") == country:
                share = int(max(0, yield_row.get("daily_income", 0)) * 0.30)
                mp_share = int(max(0, yield_row.get("manpower_production", 0)) * 0.30)
            else:
                # مهاجرت از ذخیره‌های قدیمی که هنوز snapshot درآمد اشغال نداشتند.
                _, dp = get_player_by_country(target_country)
                if not dp: continue
                dr = compute_rates(dp, _occ=False, at_time=at_time)
                share = int(max(0, dr["base_income"] + dr["economy_income"]) * 0.30)
                mp_share = int(max(0, dr["manpower_production"]) * 0.30)
            income += share
            occupation_income += share
            manpower_production += mp_share

    # اثر فصل بر درآمد روزانه
    time_info = get_game_time(player, at_time=at_time)
    season = time_info.get("season", "بهار")
    effects = SEASON_EFFECTS.get(season, SEASON_EFFECTS["بهار"])
    income_before_season = income
    income *= max(0.0, 1 + effects["income_pct"] / 100.0)
    season_income_loss = income_before_season - income
    manpower_production *= max(0.0, 1 + effects["manpower_production_pct"] / 100.0)

    # اثر منفی پاییز و زمستان بر بازده تولید همهٔ منابع.
    production_mult = max(0.0, 1 + effects["resource_production_pct"] / 100.0)
    if production_mult != 1.0:
        for key in resource_production:
            resource_production[key] = int(resource_production[key] * production_mult)

    # پاداش رفاه پس از اثر فصلی بر درآمد اعمال می‌شود.
    income_before_welfare = income
    welfare_extra_income = income_before_welfare * wb / 100.0
    income += welfare_extra_income

    # مصرف روزانهٔ نگهداریِ همهٔ یگان‌های کشور؛ هم در خانه، هم در مواضع و هم در مسیر.
    # یگان‌های اعزام‌شده از player["units"] خارج می‌شوند، بنابراین باید از موقعیت فعلی‌شان جمع شوند.
    unit_totals = {uid_: max(0, int(n or 0)) for uid_, n in player.get("units", {}).items()}
    country_id = player.get("country")
    for garrison in globals().get("site_forces", {}).values():
        if garrison.get("owner") != country_id:
            continue
        for uid_, n in (garrison.get("units") or {}).items():
            unit_totals[uid_] = unit_totals.get(uid_, 0) + max(0, int(n or 0))
    for transit in globals().get("transits", []):
        if transit.get("owner") != country_id:
            continue
        for uid_, n in (transit.get("units") or {}).items():
            unit_totals[uid_] = unit_totals.get(uid_, 0) + max(0, int(n or 0))
    for uid_, u in ARMY_UNITS.items():
        n = unit_totals.get(uid_, 0)
        if n > 0:
            for k, a in u.get("daily", {}).items():
                if k in resource_consumption:
                    resource_consumption[k] += a * n
                    res_units[k].append({"name": u.get("name", uid_), "count": n, "amount": a * n})

    # افزایش مصرف غذا و نفت هر فصل را فقط یک بار و روی مصرف واقعی اعمال می‌کنیم.
    season_consumption_extra = {}
    for key in ("food", "oil"):
        pct = effects.get(f"{key}_consumption_pct", 0) + effects.get("food_oil_consumption_pct", 0)
        base_use = resource_consumption[key]
        new_use = int(round(base_use * max(0.0, 1 + pct / 100.0)))
        season_consumption_extra[key] = new_use - int(round(base_use))
        resource_consumption[key] = new_use
    consumption_mult = {k: max(0.0, 1 + (effects.get(f"{k}_consumption_pct", 0) + effects.get("food_oil_consumption_pct", 0)) / 100.0) for k in ("food", "oil")}

    return {"gross_income": income, "income_before_welfare": income_before_welfare,
            "base_income": base_income, "economy_income": eco_income,
            "map_income": map_income, "strait_income": strait_income,
            "occupation_income": occupation_income,
            "welfare_extra_income": welfare_extra_income,
            "season": season, "season_income_pct": effects["income_pct"],
            "season_income_loss": season_income_loss,
            "season_consumption_extra": season_consumption_extra,
            "season_consumption_pct": {k: effects.get(f"{k}_consumption_pct", 0) + effects.get("food_oil_consumption_pct", 0) for k in ("food", "oil")},
            "net_income": income - upkeep, "daily_upkeep": upkeep,
            "power_capacity": power_capacity, "power_consumption": power_consumption,
            "manpower_production": manpower_production,
            "resource_production": resource_production,
            "resource_consumption": resource_consumption,
            "resource_breakdown": {k: {"infra": res_infra[k], "sites": res_sites[k], "units": res_units[k],
                                       "prod_mult": production_mult,
                                       "cons_mult": consumption_mult.get(k, 1.0)}
                                   for k in RESOURCE_NAMES}}

def _season_boundary_after(started, when):
    elapsed = max(0.0, (when - started).total_seconds() / 86400.0)
    _, boundary_day = _season_for_elapsed_days(elapsed)
    return min(started + timedelta(days=boundary_day), started + timedelta(days=GAME_TOTAL_DAYS))


def _resolve_wars_between(attacker_cid, defender_cid):
    for wid, war in list(active_wars.items()):
        if {war.get("attacker"), war.get("defender")} == {attacker_cid, defender_cid}:
            war["resolved"] = True
            war["status"] = "resolved"
            if wid in war_declarations:
                war_declarations[wid]["resolved"] = True
                war_declarations[wid]["status"] = "resolved"


def occupy_country(attacker_cid, defender_cid, resolve_wars=True, announce_event=True):
    """سقوط کشور اصلی؛ دارایی‌های اصلی به فاتح منتقل و ۳۰٪ درآمد/تولید نیروی پایه حفظ می‌شود."""
    if not attacker_cid or not defender_cid or attacker_cid == defender_cid:
        return
    _, dfd = get_player_by_country(defender_cid)

    # دارایی‌هایی را که پیش‌تر متعلق به مستعمره‌های کشور مغلوب بوده‌اند از دارایی‌های اصلی‌اش جدا می‌کنیم.
    already_colony_map = set()
    already_colony_straits = set()
    for colony, record in occupied_assets.items():
        if occupied_countries.get(colony) == defender_cid or record.get("owner") == defender_cid:
            already_colony_map.update(record.get("map", []))
            already_colony_straits.update(record.get("straits", []))
    native_map_assets = [k for k, owner in map_holdings.items()
                         if owner == defender_cid and k not in already_colony_map]
    native_strait_assets = [k for k, owner in strait_holdings.items()
                            if owner == defender_cid and k not in already_colony_straits]

    if dfd:
        # ذخیرهٔ تولید قبل از حذف بازیکن؛ مستعمره از این پس بازیکن مستقل ندارد.
        rates = compute_rates(dfd, _occ=False)
        captured_season = get_game_time(dfd).get("season", "بهار")
        captured_effect = SEASON_EFFECTS.get(captured_season, SEASON_EFFECTS["بهار"])
        captured_mp_mult = max(0.0, 1 + captured_effect["manpower_production_pct"] / 100.0)
        raw_mp_total = rates.get("manpower_production", 0) / captured_mp_mult if captured_mp_mult > 0 else 0
        # _occ=False یعنی تولید مستعمره‌ها اصلاً در این نرخ نیست؛ پس نباید دوباره از تولید کشور کم شود.
        raw_mp = max(0, raw_mp_total)
        base_economy_income = max(0, rates.get("base_income", 0) + rates.get("economy_income", 0))
        source_welfare_mult = 1 + max(0.0, welfare_bonus(dfd)) / 100.0
        occupation_yields[defender_cid] = {
            "owner": attacker_cid,
            "daily_income": int(round(base_economy_income * source_welfare_mult)),
            "manpower_production": int(max(0, raw_mp)),
        }

    occupied_countries[defender_cid] = attacker_cid
    occupied_assets[defender_cid] = {
        "owner": attacker_cid,
        "map": native_map_assets,
        "straits": native_strait_assets,
    }

    # مستعمره‌های اشغالگر شکست‌خورده نیز به فاتح جدید می‌رسند، اما همچنان به‌صورت مستعمره ثبت می‌مانند.
    for colony, old_occupier in list(occupied_countries.items()):
        if colony != defender_cid and old_occupier == defender_cid:
            occupied_countries[colony] = attacker_cid
            if colony in occupation_yields:
                occupation_yields[colony]["owner"] = attacker_cid
            if colony in occupied_assets:
                occupied_assets[colony]["owner"] = attacker_cid

    for k, owner in list(map_holdings.items()):
        if owner == defender_cid:
            map_holdings[k] = attacker_cid
    for k, owner in list(strait_holdings.items()):
        if owner == defender_cid:
            strait_holdings[k] = attacker_cid

    for k in list(site_forces):
        force_owner = site_forces[k].get("owner")
        if force_owner == defender_cid or site_owner(k) != force_owner:
            del site_forces[k]
    if dfd:
        dfd["is_eliminated"] = True
        dfd["country"] = None
        dfd["units"] = {k: 0 for k in ARMY_UNITS}
        dfd["army"] = 0
    for transit in list(transits):
        if transit.get("owner") == defender_cid:
            transits.remove(transit)

    # قراردادهای وام کشور حذف‌شده لغو می‌شوند تا بازیکن آیندهٔ آن کشور بدهیِ بازیکن قبلی را به ارث نبرد.
    for loan in loans.values():
        if defender_cid in (loan.get("lender"), loan.get("borrower")) and loan.get("status") in ("pending", "active", "overdue"):
            loan["status"] = "cancelled_elimination"
            loan["closed_at"] = utcnow().isoformat()

    # سفارش‌های باز کشور حذف‌شده لغو می‌شوند و وثیقهٔ آن به حساب حذف‌شده بازمی‌گردد.
    for lid, listing in list(market_listings.items()):
        if listing.get("status") != "open" or defender_cid not in (listing.get("seller"), listing.get("buyer")):
            continue
        if listing.get("escrowed") and dfd:
            if listing.get("side", "sell") == "sell":
                key = listing.get("sell_resource")
                if key in RESOURCE_NAMES:
                    dfd.setdefault("resources", {}).setdefault(key, 0)
                    dfd["resources"][key] += int(listing.get("sell_amount", 0) or 0)
            else:
                key = listing.get("offer_resource", "money")
                value = int(listing.get("offer_amount", 0) or 0)
                if key == "money": dfd["money"] = dfd.get("money", 0) + value
                elif key in RESOURCE_NAMES:
                    dfd.setdefault("resources", {}).setdefault(key, 0)
                    dfd["resources"][key] += value
        listing["status"] = "cancelled_eliminated"

    if resolve_wars:
        _resolve_wars_between(attacker_cid, defender_cid)
    if announce_event:
        msg = (f"{cname(attacker_cid)} با سقوط پایتخت، کشور {cname(defender_cid)} را حذف کرد؛ "
               "دارایی‌های نقشه و مستعمره‌های آن به فاتح منتقل شدند و ۳۰٪ درآمد پایه/اقتصادی و تولید نیروی انسانی آن حفظ می‌شود.")
        push_news("اشغال کشور", msg, "warning", countries=[attacker_cid, defender_cid])
        push_war("occupy", msg, [attacker_cid, defender_cid])


def occupy_colony(attacker_cid, colony_cid, previous_occupier):
    """تسخیر مستعمره؛ دارایی‌ها و ۳۰٪ بازدهش منتقل می‌شود، ولی کشور اصلی اشغالگر حذف نمی‌شود."""
    if (not attacker_cid or not colony_cid or attacker_cid == previous_occupier
            or occupied_countries.get(colony_cid) != previous_occupier):
        return False
    assets = occupied_assets.setdefault(colony_cid, {"owner": previous_occupier, "map": [], "straits": []})
    map_ids = set(assets.get("map", []))
    strait_ids = set(assets.get("straits", []))
    moved_map = []
    moved_straits = []
    for sid in map_ids:
        if map_holdings.get(sid) == previous_occupier:
            map_holdings[sid] = attacker_cid
            moved_map.append(sid)
    for sid in strait_ids:
        if strait_holdings.get(sid) == previous_occupier:
            strait_holdings[sid] = attacker_cid
            moved_straits.append(sid)
    # نیروهای مستقر در دارایی‌هایی که منتقل شدند نیز زیر مالکیت جدید قرار می‌گیرند.
    moved_site_ids = map_ids | strait_ids
    for sid in moved_site_ids:
        garrison_row = site_forces.get(sid)
        if garrison_row and garrison_row.get("owner") == previous_occupier:
            garrison_row["owner"] = attacker_cid

    occupied_countries[colony_cid] = attacker_cid
    assets["owner"] = attacker_cid
    if colony_cid in occupation_yields:
        occupation_yields[colony_cid]["owner"] = attacker_cid
    # گرفتن یک مستعمره به‌تنهایی جنگ با کشور اصلی را تمام نمی‌کند؛ بازیکن می‌تواند به مستعمره‌های دیگر یا پایتخت حمله کند.
    msg = (f"{cname(attacker_cid)} مستعمرهٔ {cname(colony_cid)} را از {cname(previous_occupier)} گرفت. "
           f"{len(moved_map)} نقطهٔ منابع و {len(moved_straits)} تنگه/سکو منتقل شد؛ کشور اصلی {cname(previous_occupier)} همچنان فعال است.")
    push_news("تغییر مالکیت مستعمره", msg, "warning", countries=[attacker_cid, previous_occupier])
    push_war("colony_captured", msg, [attacker_cid, colony_cid, previous_occupier])
    push_history("colony", f"تصرف مستعمرهٔ {cname(colony_cid)}", attacker_cid, colony_cid, "attacker", msg)
    return True


# ---------------- اعلان پایان فعالیت ----------------
# هر اعلان فقط در پروندهٔ همان بازیکنی ثبت می‌شود که فعالیت را انجام داده است. اعلان تا زمانی که
# کلاینت نمایش آن را تأیید نکرده (POST /api/activity-notices/ack) در state ذخیره می‌ماند؛ پس اگر بازیکن
# هنگام پایان کار بازی را بسته باشد، در ورود بعدی یک بار نمایش داده می‌شود و سپس حذف می‌گردد.
ACTIVITY_NOTICE_LIMIT = 50


def done_message(label):
    """قالب یکسان پیام پایان کار: «✅ <نام فعالیت> با موفقیت تکمیل شد!»"""
    return f"✅ {label} با موفقیت تکمیل شد!"


def push_activity_notice(player, text, key=None):
    """اعلان پایان کار را ثبت می‌کند. با key ثابت (شناسهٔ کار) هرگز دو بار ثبت نمی‌شود."""
    notices = player.setdefault("activity_notices", [])
    nid = str(key) if key else str(uuid.uuid4())
    if any(isinstance(n, dict) and n.get("id") == nid for n in notices):
        return None
    notices.append({"id": nid, "text": text, "at": utcnow().isoformat()})
    if len(notices) > ACTIVITY_NOTICE_LIMIT:
        del notices[:-ACTIVITY_NOTICE_LIMIT]
    return nid


def process_deliveries(player):
    """کالاهای تجاری که زمان حملشان تمام شده به موجودی خریدار اضافه می‌شود."""
    pend = player.get("pending_deliveries")
    if not pend: return
    now = utcnow(); keep = []
    for d in pend:
        ar = parse_dt(d.get("arrive"))
        if ar and ar > now:
            keep.append(d); continue
        res = d.get("resource")
        if res in RESOURCE_NAMES:
            player.setdefault("resources", {})
            amount = int(d.get("amount", 0) or 0)
            player["resources"][res] = player["resources"].get(res, 0) + amount
            push_activity_notice(
                player,
                done_message(f"حمل {amount:,} {RESOURCE_NAMES[res]} از {cname(d.get('from'))}"),
                key=("delivery:" + str(d["id"])) if d.get("id") else None)
    player["pending_deliveries"] = keep

# ---------------------------------------------------------
# صف فعالیت‌های خانه (یک فعالیت هم‌زمان) + اعلان تلگرام پایدار
# ---------------------------------------------------------
HOME_JOB_KINDS = ("infra", "economy")

def home_active_job(player):
    """فعالیتِ در حال انجام در صف خانه (اگر باشد). پیش از فراخوانی باید process_build_queue اجرا شده باشد."""
    for job in player.get("build_queue") or []:
        if isinstance(job, dict) and job.get("kind") in HOME_JOB_KINDS:
            return job
    return None

def queue_telegram_notice(player, text, key):
    """اعلان تلگرام را در پروندهٔ بازیکن ثبت می‌کند. با key ثابت (شناسهٔ فعالیت) هرگز دو بار ثبت نمی‌شود،
    حتی اگر ارسالش پیش‌تر موفق شده باشد. ارسال واقعی را حلقهٔ activity_loop انجام می‌دهد."""
    key = str(key) if key else str(uuid.uuid4())
    box = player.setdefault("tg_outbox", [])
    done = player.setdefault("tg_done", [])
    if key in done or any(isinstance(e, dict) and e.get("id") == key for e in box):
        return False
    box.append({"id": key, "text": text, "at": utcnow().isoformat(), "attempts": 0})
    return True

def _migrate_legacy_jobs(player):
    """کارهای «آموزش یگان» که در نسخهٔ قبلی داخل build_queue بودند به صف مستقل کارخانه منتقل می‌شوند."""
    queue = player.get("build_queue")
    if not queue or not any(isinstance(j, dict) and j.get("kind") == "train" for j in queue):
        return
    keep = []
    fq = factory_queues(player)
    for job in queue:
        if not isinstance(job, dict) or job.get("kind") != "train":
            keep.append(job); continue
        unit = ARMY_UNITS.get(job.get("unit_id"))
        if not unit:
            continue
        count = max(1, int(job.get("count", 1) or 1))
        start = parse_dt(job.get("start")) or utcnow()
        end = parse_dt(job.get("end")) or start
        fq[unit["group"]].append({
            "id": str(job.get("id") or uuid.uuid4()), "kind": "train", "group": unit["group"],
            "unit_id": job["unit_id"], "count": count, "delivered": 0,
            "unit_seconds": max(1.0, (end - start).total_seconds() / count),
            "start": start.isoformat(), "queued_at": start.isoformat(),
            "label": job.get("label") or f"ساخت {count:,} {unit['name']}"})
    player["build_queue"] = keep

def process_build_queue(player):
    """فعالیت‌های خانه که زمانشان تمام شده، دقیقاً در لحظهٔ پایان تکمیل می‌شوند: سطح اعمال می‌شود، کار از صف
    حذف می‌شود و اعلان (درون‌برنامه + تلگرام) فقط یک بار ثبت می‌گردد. خروجی: آیا چیزی تغییر کرد."""
    _migrate_legacy_jobs(player)
    queue = player.get("build_queue")
    if not queue: return False
    now = utcnow(); keep = []; changed = False
    for job in queue:
        if not isinstance(job, dict):
            changed = True; continue
        end = parse_dt(job.get("end"))
        if end and end > now:
            keep.append(job); continue
        kind = job.get("kind")
        catalog = INFRASTRUCTURE if kind == "infra" else ECONOMY if kind == "economy" else None
        if catalog is not None and job.get("item_id") in catalog:
            lv_now = player.setdefault("infra_levels", {}).get(job["item_id"], 0)
            player["infra_levels"][job["item_id"]] = max(lv_now, int(job.get("level", 0) or 0))
        text = done_message(job.get("label") or "فعالیت")
        jid = str(job["id"]) if job.get("id") else None
        push_activity_notice(player, text, key=("job:" + jid) if jid else None)
        if kind in HOME_JOB_KINDS and not player.get("is_eliminated"):
            queue_telegram_notice(player, text, ("job:" + jid) if jid else None)
        changed = True
    player["build_queue"] = keep
    if changed: recompute_army(player)
    return changed

# ---------------------------------------------------------
# صف مستقل کارخانهٔ ارتش (برای تولید یگان پیام تلگرام ارسال نمی‌شود)
# ---------------------------------------------------------
def factory_queues(player):
    fq = player.setdefault("factory_queues", {})
    for g in FACTORY_QUEUE_LIMITS:
        if not isinstance(fq.get(g), list): fq[g] = []
    return fq

def factory_order_seconds(order):
    return max(1.0, float(order.get("unit_seconds") or 1.0)) * max(0, int(order.get("count", 0) or 0))

def queued_units_in_group(player, group):
    """واحدهای هنوز تحویل‌نشدهٔ صف کارخانه؛ این‌ها از ظرفیت نگهداری رزرو می‌شوند."""
    total = 0
    for o in factory_queues(player).get(group, []):
        total += max(0, int(o.get("count", 0) or 0) - int(o.get("delivered", 0) or 0))
    return total

def process_factory_queues(player, now=None):
    """واحدها طبق زمان هر واحد یکی‌یکی تحویل می‌شوند (نه فوری). سفارشِ بعدیِ همان دسته دقیقاً از لحظهٔ پایان
    سفارش قبلی شروع می‌شود، حتی اگر بازیکن آفلاین باشد. خروجی: آیا چیزی تغییر کرد."""
    now = now or utcnow(); changed = False
    for group, q in factory_queues(player).items():
        prev_end = None
        while q:
            o = q[0]
            unit_id = o.get("unit_id")
            if unit_id not in ARMY_UNITS or int(o.get("count", 0) or 0) <= 0:
                q.pop(0); changed = True; continue
            count = int(o["count"]); us = max(1.0, float(o.get("unit_seconds") or 1.0))
            start = parse_dt(o.get("start"))
            if start is None:
                start = prev_end or now
                o["start"] = start.isoformat(); changed = True
            finish = start + timedelta(seconds=us * count)
            done = count if now >= finish else max(0, min(count, int((now - start).total_seconds() // us)))
            delta = done - int(o.get("delivered", 0) or 0)
            if delta > 0:
                units = player.setdefault("units", {})
                units[unit_id] = units.get(unit_id, 0) + delta
                o["delivered"] = done; changed = True
            if done >= count:
                q.pop(0)
                # فقط اعلان درون‌برنامه (بدون تلگرام): پایان تولید ارتش در رابط و صف کارخانه دیده می‌شود.
                push_activity_notice(player, done_message(o.get("label") or "تولید یگان"),
                                     key=("order:" + str(o["id"])) if o.get("id") else None)
                prev_end = finish; changed = True
                continue
            break
    if changed: recompute_army(player)
    return changed

def accrue_player(player):
    """درآمد و منابع را با ساعت مشترک دنیا و با نرخ درستِ هر فصل محاسبه می‌کند."""
    if player.get("is_eliminated") or not player.get("country"):
        return
    process_deliveries(player)
    process_build_queue(player)
    process_factory_queues(player)
    meta = _world_meta()
    started = parse_dt(meta.get("game_started_at"))
    if not started:
        return  # تا فرمانده شروع نکند، اقتصاد و زمان بازی متوقف است.
    now = utcnow()
    game_end = started + timedelta(days=GAME_TOTAL_DAYS)
    limit = min(now, game_end)
    last = parse_dt(player.get("last_update")) or started
    if last < started:
        last = started
    if last >= limit:
        if now >= game_end:
            player["last_update"] = game_end.isoformat()
        return
    ensure_player_fields(player)
    while last < limit:
        boundary = _season_boundary_after(started, last)
        segment_end = min(limit, boundary)
        seconds = max(0.0, (segment_end - last).total_seconds())
        if seconds <= 0:
            break
        # نرخ برای فصل فعلی همین بازه؛ بازه‌های عبوری از مرز فصل جدا محاسبه می‌شوند.
        rates = compute_rates(player, at_time=last + timedelta(microseconds=1))
        fraction = seconds / 86400.0
        gain = rates["net_income"] * fraction
        player["money"] = max(0.0, player.get("money", STARTING_MONEY) + gain)
        if gain > 0:
            player["money"] -= loan_garnish(player, min(gain, player["money"]))
        player["manpower"] = player.get("manpower", STARTING_MANPOWER) + rates["manpower_production"] * fraction
        for key, amount in rates["resource_production"].items():
            player["resources"][key] = player["resources"].get(key, 0) + amount * fraction
        for key, amount in rates["resource_consumption"].items():
            if amount > 0:
                player["resources"][key] = max(0, player["resources"].get(key, 0) - amount * fraction)
        last = segment_end
    player["last_update"] = limit.isoformat()


def finalize_world_if_due():
    """در پایان روز ۳۱، اقتصاد را دقیقاً تا لحظهٔ پایان تسویه و برنده را ثبت می‌کند."""
    meta = _world_meta()
    started = parse_dt(meta.get("game_started_at"))
    if not started or meta.get("game_finished"):
        return False
    end = started + timedelta(days=GAME_TOTAL_DAYS)
    if utcnow() < end:
        return False
    for p in players.values():
        if p.get("country") and not p.get("is_eliminated"):
            accrue_player(p)
    rows = compute_rankings()
    winner = None
    if rows:
        first = rows[0]
        winner = {"country": first["country"], "name": first["name"], "score": first["overall"], "rank": first["rank"]}
    meta["game_finished"] = True
    meta["registration_open"] = False
    meta["game_finished_at"] = end.isoformat()
    meta["winner"] = winner
    if winner:
        message = f"🏆 بازی پس از ۳۱ روز به پایان رسید؛ {winner['name']} با امتیاز نهایی {winner['score']} برنده شد."
    else:
        message = "بازی پس از ۳۱ روز به پایان رسید؛ بازیکن فعالی برای تعیین برنده وجود نداشت."
    push_news("پایان بازی", message, "success")
    push_war("game_finished", message, [winner["country"]] if winner else [])
    save_state()
    return True

def build_catalog_status(player, catalog):
    result = {}
    for item_id, item in catalog.items():
        lv = get_infra_level(player, item_id)
        current = get_item_info(catalog, item_id, lv)
        levels = item["levels"]
        nxt = lv + 1
        next_info = levels[nxt - 1] if nxt <= len(levels) else None
        result[item_id] = {
            "name": item["name"], "group": item.get("group"),
            "icon": item.get("icon", ""),
            "desc": item.get("desc", ""),
            "resource_key": item.get("resource_key"), "bonus": item.get("bonus"),
            "power_required": item.get("power_required"),
            "level": lv, "max_level": len(levels),
            "current": current, "next": next_info,
            "upkeep": infra_upkeep(item, lv),
            "next_upkeep": infra_upkeep(item, nxt) if next_info else 0,
        }
    return result

def army_locations(player):
    """هر یگان کجاست: در خانه، در مواضع بیرون از خانه (سکو، تنگه، معدن، بندر، جبهه) یا در راه."""
    cid = player.get("country")
    out = {u: {"home": max(0, int(player.get("units", {}).get(u, 0) or 0)), "sites": [], "transit": 0}
           for u in ARMY_UNITS}
    if cid:
        for sid, g in site_forces.items():
            if g.get("owner") != cid: continue
            if not (str(sid).startswith(("port:", "front:")) or site_owner(sid) == cid): continue
            try:
                meta = site_meta(sid); name = meta["name"] if meta else str(sid)
            except Exception:
                name = str(sid)
            for u, n in (g.get("units") or {}).items():
                n = int(n or 0)
                if u in out and n > 0: out[u]["sites"].append({"name": name, "count": n})
        for t in transits:
            if t.get("owner") != cid: continue
            for u, n in (t.get("units") or {}).items():
                n = int(n or 0)
                if u in out and n > 0: out[u]["transit"] += n
    for v in out.values():
        v["away"] = sum(s["count"] for s in v["sites"]) + v["transit"]
        v["total"] = v["home"] + v["away"]
    return out

def serialize_player(player):
    ensure_player_fields(player); accrue_player(player); recompute_army(player)
    rates = compute_rates(player)
    data = dict(player); data.update(get_game_time(player))
    for private in ("tg_outbox", "tg_done", "factory_request_ids"):
        data.pop(private, None)
    data["factory_queue_limits"] = dict(FACTORY_QUEUE_LIMITS)
    data["server_now"] = utcnow().isoformat()
    winner = data.get("game_winner") or {}
    data["game_winner_name"] = winner.get("name") if isinstance(winner, dict) else None
    data["game_winner_country"] = winner.get("country") if isinstance(winner, dict) else None
    data["resource_production"] = rates["resource_production"]
    data["resource_consumption"] = rates["resource_consumption"]
    data["resource_breakdown"] = rates.get("resource_breakdown", {})
    data["power_capacity"] = rates["power_capacity"]
    data["power_consumption"] = rates["power_consumption"]
    data["manpower_production"] = rates["manpower_production"]
    data["daily_income"] = rates["net_income"]
    data["season_income_loss"] = rates.get("season_income_loss", 0)
    data["season_consumption_extra"] = rates.get("season_consumption_extra", {})
    data["season_consumption_pct"] = rates.get("season_consumption_pct", {})
    data["daily_upkeep"] = rates["daily_upkeep"]
    data["infra"] = build_catalog_status(player, INFRASTRUCTURE)
    data["economy"] = build_catalog_status(player, ECONOMY)
    data["satellite_built"] = get_infra_level(player, "satellite") > 0
    data["def_mult"] = {g: group_defense_mult(player, g) for g in ("land", "naval", "air", "missile")}
    data["unit_locations"] = army_locations(player)
    return data

# =========================================================
# State
# =========================================================
players = {}
map_holdings = {}
strait_holdings = {}
occupied_countries = {}
occupied_assets = {}  # کشور مستعمره -> دارایی‌های نقشه‌ای که هنگام اشغال به مالک جدید منتقل شدند
occupation_yields = {}  # کشور اشغال‌شده -> درآمد پایه/اقتصادی و تولید نیروی انسانی پیش از اشغال
war_declarations = {}
active_wars = {}
war_reports = []
announcements = []
unions = {}
private_messages = {}
pm_read = {}   # cid -> {other_cid: تعداد پیام‌های دیده‌شده}
market_listings = {}
news_feed = []
site_forces = {}   # site_id -> {"owner": country, "units": {unit_id: n}}
war_events = []    # خبرهای جنگ
war_history = []   # تاریخچهٔ درگیری‌ها
transits = []      # نیروهای در راه
loans = {}         # وام‌ها
market_sanctions = {}  # کشور تحریم‌کننده -> مجموعه‌ای از کشورهای محروم از خرید
diplomacy_proposals = {}  # پیشنهادهای پیمان
active_treaties = []      # پیمان‌های فعال
un_messages = []          # پیام‌های بازیکنان به سازمان ملل (برای مدیر)
reset_notices = {}        # uid(str) -> متن اعلان «ریست شدید»

def create_player(user_id):
    return {"user_id": user_id, "country": None, "money": STARTING_MONEY, "army": 0,
            "manpower": STARTING_MANPOWER, "infra_levels": {},
            "units": {uid_: 0 for uid_ in ARMY_UNITS}, "resources": dict(STARTING_RESOURCES),
            "map_holdings": {}, "strait_holdings": {}, "announcements": {}, "land_trade_open": True,
            "is_eliminated": False, "started_at": None, "last_update": None,
            "telegram_first_name": "", "telegram_last_name": "", "telegram_username": "",
            "telegram_language_code": "", "last_seen_at": None}

# تاریخچهٔ محدود عملیات مدیریتی برای عیب‌یابی و پیگیری تغییرات
admin_audit = []

def log_admin_action(action, target_uid=None, detail=""):
    row = {"at": utcnow().isoformat(), "action": str(action)[:100],
           "target_user_id": int(target_uid) if target_uid is not None else None,
           "detail": str(detail)[:500], "admin_id": ADMIN_ID}
    admin_audit.append(row)
    if len(admin_audit) > 250:
        del admin_audit[:-250]

def remember_telegram_user(user):
    """Persist Telegram display name/username from a verified WebApp user or /start."""
    if not user:
        return None
    if isinstance(user, dict):
        getv = lambda key: user.get(key)
    else:
        getv = lambda key: getattr(user, key, None)
    try:
        uid = int(getv("id"))
    except (TypeError, ValueError):
        return None
    created = uid not in players
    if created:
        players[uid] = create_player(uid)
    p = players[uid]
    changed = created
    for field, incoming in (
        ("telegram_first_name", getv("first_name")),
        ("telegram_last_name", getv("last_name")),
        ("telegram_username", getv("username")),
        ("telegram_language_code", getv("language_code")),
    ):
        value = str(incoming or "").strip()[:128]
        if p.get(field, "") != value:
            p[field] = value
            changed = True
    now = utcnow()
    last_seen = parse_dt(p.get("last_seen_at")) if p.get("last_seen_at") else None
    if not last_seen or (now - last_seen).total_seconds() >= 45:
        p["last_seen_at"] = now.isoformat()
        changed = True
    if changed:
        save_state()
    return uid

def get_player_by_country(country_id):
    for uid_, p in players.items():
        if p.get("country") == country_id and not p.get("is_eliminated"):
            return uid_, p
    return None, None

def classify_news(title, text="", kind="info"):
    """دسته‌بندی اخبار برای فیلترهای بخش ارتباطات."""
    source = f"{title or ''} {text or ''}".lower()
    if "اتحادیه" in source:
        return "union"
    if any(word in source for word in ("پیمان", "عدم تجاوز", "دیپلماسی", "مذاکره")):
        return "diplomacy"
    if any(word in source for word in ("جنگ", "نبرد", "دفاع", "حمله", "اشغال", "تلفات", "نیرو", "ارتش", "پیروزی", "شکست")):
        return "military"
    if any(word in source for word in ("بیانیه", "اعلان", "اطلاعیه")):
        return "general"
    if any(word in source for word in ("معامله", "تجارت", "بازار", "مرز زمینی", "حمل‌ونقل", "حمل و نقل")):
        return "trade"
    if any(word in source for word in ("تصرف", "تنگه", "قلمرو", "مرز", "منطقه")):
        return "territory"
    if any(word in source for word in ("وام", "درآمد", "اقتصاد", "تسویه", "غذا", "نفت", "آهن", "اورانیوم", "منبع", "منابع")):
        return "economy"
    return "general"

def _detect_news_countries(title, text):
    """کشورهای بازیکن که نامشان در خبر آمده (به ترتیب ظهور). نام سکو/معدن/تنگه‌ها پیش‌تر حذف می‌شود
    تا مثلاً «سکوی آمریکا (بوفورت)» یا «معدن آهن چین» پرچم اشتباه نیاورد."""
    s = f"{title or ''} {text or ''}"
    names = {v.get("name") for v in list(MAP_RESOURCES.values()) + list(STRAITS_DATA.values()) if v.get("name")}
    for n in sorted(names, key=len, reverse=True):
        s = s.replace(n, " ")
    found = []
    for cid, c in COUNTRIES.items():
        # نام کشور باید کلمهٔ مستقل باشد (مثلاً «مصر» داخل «مصرف» نباشد)
        m = re.search(r"(?<![\u0600-\u06FF\u200c])" + re.escape(c["name"]) + r"(?![\u0600-\u06FF\u200c])", s)
        if m: found.append((m.start(), cid))
    return [cid for _, cid in sorted(found)][:3]

def push_news(title, text, kind="info", countries=None):
    if countries is None:
        countries = _detect_news_countries(title, text)
    row = {"id": str(uuid.uuid4()), "title": title, "text": text,
           "kind": kind, "category": classify_news(title, text, kind),
           "at": utcnow().isoformat()}
    # کشورهای مربوط به خبر (برای نمایش پرچم کوچک کنار خبر)؛ بدون تکرار و حداکثر ۳ کشور
    rel = []
    for c in (countries or []):
        if c in COUNTRIES and c not in rel: rel.append(c)
    if rel: row["countries"] = rel[:3]
    news_feed.append(row)
    if len(news_feed) > 300: del news_feed[:len(news_feed) - 300]   # سقف ۳۰۰ خبر

# هر دنیا نسخهٔ مستقل خود از داده‌های بازی را دارد. هنگام هر درخواست، وضعیت دنیای مربوط
# به درخواست فعال می‌شود و پیش از بازگرداندن وضعیت قبلی ذخیره می‌گردد.
WORLD_STATE_KEYS = [
    "players", "map_holdings", "strait_holdings",
    "occupied_countries", "occupied_assets", "occupation_yields", "war_declarations", "active_wars", "war_reports", "announcements",
    "unions", "private_messages", "pm_read", "market_listings", "news_feed", "STRAITS_DATA",
    "site_forces", "war_events", "war_history", "transits", "loans", "admin_audit", "market_sanctions",
    "diplomacy_proposals", "active_treaties", "un_messages", "reset_notices",
]
DEFAULT_STRAITS_DATA = copy.deepcopy(STRAITS_DATA)
worlds_registry = {"1": {"id": 1, "name": "دنیای ۱", "created_at": None,
                           "registration_open": True, "game_started_at": None,
                           "game_finished": False, "winner": None}}
world_states = {}
active_world_id = "1"
WORLD_SWITCH_LOCK = asyncio.Lock()

# پیام‌های تلگرام هرگز نباید زیر WORLD_SWITCH_LOCK ارسال شوند. زیر قفل فقط در صف می‌روند
# و پس از آزاد شدن قفل ارسال می‌شوند.
_TG_OUTBOX = contextvars.ContextVar("tg_outbox", default=None)
_AFTER_LOCK = contextvars.ContextVar("after_lock", default=None)
_BG_TASKS = set()


async def _flush_tg_outbox(items, delay=0.02):
    """ارسال واقعی پیام‌ها (بدون نگه داشتن قفل). خروجی: (موفق, ناموفق)."""
    sent = failed = 0
    for chat_id, text, markup in items:
        try:
            await bot.send_message(chat_id=chat_id, text=text, reply_markup=markup)
            sent += 1
        except Exception as exc:
            failed += 1
            logging.warning("telegram send failed for %s: %s", chat_id, exc)
        await asyncio.sleep(delay)
    return sent, failed


def _spawn_tg_flush(items, delay=0.02):
    if not items:
        return
    try:
        task = asyncio.get_running_loop().create_task(_flush_tg_outbox(list(items), delay))
    except RuntimeError:
        return
    _BG_TASKS.add(task)
    task.add_done_callback(_BG_TASKS.discard)


@contextlib.contextmanager
def _tg_outbox_scope():
    """بیرون از قفل باز شود: پیام‌های صف‌شده بعد از خروج (و رها شدن قفل) فرستاده می‌شوند."""
    box = []
    token = _TG_OUTBOX.set(box)
    try:
        yield box
    finally:
        _TG_OUTBOX.reset(token)
        _spawn_tg_flush(box)


async def _tg_dispatch(items):
    box = _TG_OUTBOX.get()
    if box is not None:
        box.extend(items)
    else:
        await _flush_tg_outbox(items)


async def _tg_send(chat_id, text, reply_markup=None):
    await _tg_dispatch([(chat_id, text, reply_markup)])


def _after_lock(fn):
    """ثبت کاری که بعد از آزاد شدن قفل اجرا شود و می‌تواند پاسخ را جایگزین کند."""
    hooks = _AFTER_LOCK.get()
    if hooks is None:
        raise RuntimeError("_after_lock outside world_scoped")
    hooks.append(fn)


@contextlib.asynccontextmanager
async def _in_world(wid):
    async with WORLD_SWITCH_LOCK:
        previous = str(active_world_id)
        _persist_active_world_memory()
        try:
            _activate_world(wid)
            yield
        finally:
            _persist_active_world_memory()
            _activate_world(previous if previous in worlds_registry else "1")


def _fresh_world_state():
    return {
        "players": {}, "map_holdings": {},
        "strait_holdings": {}, "occupied_countries": {}, "occupied_assets": {}, "occupation_yields": {}, "war_declarations": {}, "active_wars": {},
        "war_reports": [], "announcements": [], "unions": {}, "private_messages": {}, "pm_read": {},
        "market_listings": {}, "news_feed": [], "STRAITS_DATA": copy.deepcopy(DEFAULT_STRAITS_DATA),
        "site_forces": {}, "war_events": [], "war_history": [], "transits": [], "loans": {},
        "admin_audit": [], "market_sanctions": {},
        "diplomacy_proposals": {}, "active_treaties": [],
        "un_messages": [], "reset_notices": {},
    }


def _capture_world_state():
    return {key: globals().get(key) for key in WORLD_STATE_KEYS}


def _persist_active_world_memory():
    world_states[str(active_world_id)] = _capture_world_state()


def _activate_world(world_id):
    global active_world_id
    wid = str(world_id)
    if wid not in worlds_registry:
        return False
    state = world_states.get(wid)
    if not isinstance(state, dict):
        state = _fresh_world_state()
        world_states[wid] = state
    else:
        fresh = _fresh_world_state()
        for key, value in fresh.items(): state.setdefault(key, value)
    for key in WORLD_STATE_KEYS:
        globals()[key] = state.get(key, _fresh_world_state().get(key))
    if not isinstance(players, dict): globals()["players"] = {}
    # سازگاری با فایل‌های قدیمی که کلید بازیکن را رشته ذخیره کرده‌اند.
    if players and any(not isinstance(k, int) for k in players):
        globals()["players"] = {int(k): v for k, v in players.items()}
    active_world_id = wid
    world_states[wid] = _capture_world_state()
    return True



# ---------------- ذخیرهٔ پایدار در دیتابیس رایگان (برای Render رایگان که دیسک ندارد) ----------------
# اگر متغیر محیطی DATABASE_URL (مثلاً از Neon یا Supabase) تنظیم شده باشد، نسخهٔ کامل state در Postgres هم ذخیره می‌شود
# و موقع شروع از همان‌جا خوانده می‌شود. اگر تنظیم نباشد رفتار قبلی (فقط فایل محلی) بدون تغییر می‌ماند.
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
_DB_STATE = {"pending": None, "thread": None}
_DB_LOCK = threading.Lock()
_DB_WAKE = threading.Event()

def _db_connect():
    import psycopg2
    conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
    with conn.cursor() as cur:
        cur.execute("CREATE TABLE IF NOT EXISTS game_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())")
    conn.commit()
    return conn

def _db_load_state_text():
    if not DATABASE_URL: return None
    try:
        conn = _db_connect()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT value FROM game_state WHERE key = 'main'")
                row = cur.fetchone()
            return row[0] if row else None
        finally:
            conn.close()
    except Exception as e:
        logging.error("DB load failed: %s", e)
        return None

def _db_worker():
    while True:
        _DB_WAKE.wait(); _DB_WAKE.clear()
        time.sleep(2)  # چند ذخیرهٔ پشت‌سرهم یکی می‌شوند
        with _DB_LOCK:
            text = _DB_STATE["pending"]; _DB_STATE["pending"] = None
        if text is None: continue
        try:
            conn = _db_connect()
            try:
                with conn.cursor() as cur:
                    cur.execute("INSERT INTO game_state (key, value, updated_at) VALUES ('main', %s, now()) "
                                "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", (text,))
                conn.commit()
            finally:
                conn.close()
        except Exception as e:
            logging.error("DB save failed: %s", e)
            with _DB_LOCK:
                if _DB_STATE["pending"] is None: _DB_STATE["pending"] = text
            time.sleep(10); _DB_WAKE.set()

def _db_queue_save(text):
    if not DATABASE_URL: return
    with _DB_LOCK:
        _DB_STATE["pending"] = text
        if _DB_STATE["thread"] is None:
            t = threading.Thread(target=_db_worker, daemon=True); _DB_STATE["thread"] = t; t.start()
    _DB_WAKE.set()

def _db_flush():
    """هنگام خاموش‌شدن، آخرین state را همین‌جا ذخیره می‌کند."""
    with _DB_LOCK:
        text = _DB_STATE["pending"]; _DB_STATE["pending"] = None
    if not text or not DATABASE_URL: return
    try:
        conn = _db_connect()
        try:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO game_state (key, value, updated_at) VALUES ('main', %s, now()) "
                            "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", (text,))
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        logging.error("DB flush failed: %s", e)

import atexit as _atexit
_atexit.register(_db_flush)

def save_state():
    try:
        _persist_active_world_memory()
        os.makedirs(DATA_DIR, exist_ok=True)
        state = {
            "version": 2,
            "worlds": worlds_registry,
            "world_states": {str(wid): payload for wid, payload in world_states.items()},
        }
        text = json.dumps(state, ensure_ascii=False)
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, STATE_FILE)
        _db_queue_save(text)
    except Exception as e:
        logging.error("save_state failed: %s", e)


def load_state():
    global worlds_registry, world_states, active_world_id
    db_text = _db_load_state_text()
    if db_text:
        try:
            json.loads(db_text)
            os.makedirs(DATA_DIR, exist_ok=True)
            with open(STATE_FILE, "w", encoding="utf-8") as f: f.write(db_text)
            logging.info("State restored from database.")
        except Exception as e:
            logging.error("DB state invalid, using local file: %s", e)
    if not os.path.exists(STATE_FILE):
        logging.info("No state, fresh start.")
        world_states = {"1": _fresh_world_state()}
        _activate_world("1")
        return
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f: saved = json.load(f)
        if isinstance(saved.get("world_states"), dict):
            worlds_registry = {str(k): v for k, v in (saved.get("worlds") or {}).items()}
            worlds_registry.setdefault("1", {"id": 1, "name": "دنیای ۱", "created_at": None})
            world_states = {str(k): v for k, v in saved["world_states"].items() if isinstance(v, dict)}
            # اگر دنیای جدید در registry بوده ولی داده نداشته باشد، خالی ایجادش کن.
            for wid in worlds_registry: world_states.setdefault(str(wid), _fresh_world_state())
            # دنیای قدیمی که ساعت مشترک نداشته باشد، در وضعیت انتظار می‌ماند؛
            # شروع فصل فقط با دکمهٔ مدیر انجام می‌شود و ساعت‌های قدیمی بازیکنان نادیده گرفته می‌شوند.
            for wid, meta in worlds_registry.items():
                meta.setdefault("registration_open", True)
                meta.setdefault("game_finished", False)
                meta.setdefault("winner", None)
                state_players = (world_states.get(str(wid), {}) or {}).get("players", {})
                if not meta.get("game_started_at"):
                    meta["registration_open"] = True
                    for player_row in state_players.values():
                        if isinstance(player_row, dict) and not player_row.get("is_eliminated"):
                            player_row["started_at"] = None
                            player_row["last_update"] = None
                else:
                    old_start = parse_dt(meta["game_started_at"])
                    if old_start:
                        meta.setdefault("game_ends_at", (old_start + timedelta(days=GAME_TOTAL_DAYS)).isoformat())
        else:
            # مهاجرت خودکار فایل ذخیرهٔ قدیمی به دنیای ۱.
            worlds_registry = {"1": {"id": 1, "name": "دنیای ۱", "created_at": None,
                                     "registration_open": True, "game_started_at": None,
                                     "game_finished": False, "winner": None}}
            legacy = _fresh_world_state()
            for key in WORLD_STATE_KEYS:
                source_key = "straits_data" if key == "STRAITS_DATA" else key
                if source_key in saved: legacy[key] = saved[source_key]
            world_states = {"1": legacy}
        # Flat legacy saves also wait for an explicit manager start.
        for wid, meta in worlds_registry.items():
            if not meta.get("game_started_at"):
                meta["registration_open"] = True
                legacy_players = (world_states.get(str(wid), {}) or {}).get("players", {})
                for player_row in legacy_players.values():
                    if isinstance(player_row, dict) and not player_row.get("is_eliminated"):
                        player_row["started_at"] = None
                        player_row["last_update"] = None
        # منابع حذف‌شده از بازی (مثلاً ماهیگیری آفریقای جنوبی) از ذخیره‌های قدیمی پاک می‌شوند.
        for _ws in world_states.values():
            for _key in ("map_holdings", "site_forces"):
                if isinstance(_ws.get(_key), dict):
                    for _sid in REMOVED_MAP_SITES: _ws[_key].pop(_sid, None)
        active_world_id = "1"
        _activate_world("1")
        logging.info("State loaded: %d players across %d worlds", len(players), len(worlds_registry))
        save_state()
    except Exception as e:
        logging.error("load_state failed: %s", e)


def world_scoped(handler):
    """Execute an API handler against its selected world's isolated data snapshot."""
    async def _wrapped(request):
        wid = str(request.query.get("world_id", "1"))
        if wid not in worlds_registry:
            return web.json_response({"success": False, "error": "world_not_found", "message": "این دنیا وجود ندارد."}, status=404)
        hooks = []
        hooks_token = _AFTER_LOCK.set(hooks)
        try:
            with _tg_outbox_scope():
                async with WORLD_SWITCH_LOCK:
                    previous = str(active_world_id)
                    _persist_active_world_memory()
                    _activate_world(wid)
                    try:
                        finalize_world_if_due()
                        path = request.path
                        exempt_before_start = {"/api/select-country", "/api/pm/send", "/api/activity-notices/ack", "/api/un/send", "/api/guide/seen"}
                        is_admin_path = path.startswith("/api/admin/")
                        result = None
                        if request.method == "POST" and not is_admin_path and path not in exempt_before_start:
                            meta = _world_meta()
                            started = bool(meta.get("game_started_at"))
                            finished = bool(meta.get("game_finished"))
                            if not started:
                                result = web.json_response({"success": False, "error": "game_not_started",
                                    "message": "بعد از شروع فصل امکان‌پذیر است."}, status=403)
                            elif finished:
                                result = web.json_response({"success": False, "error": "game_finished",
                                    "message": "بازی پس از ۳۱ روز تمام شده است؛ انجام این کار دیگر امکان‌پذیر نیست."}, status=403)
                        if result is None:
                            result = await handler(request)
                            save_state()
                    finally:
                        _persist_active_world_memory()
                        _activate_world(previous if previous in worlds_registry else "1")
        finally:
            _AFTER_LOCK.reset(hooks_token)
        # قفل رها شده است؛ کارهای شبکه‌ای وابسته به پاسخ اینجا انجام می‌شوند.
        for fn in hooks:
            result = await fn(result)
        return result
    _wrapped.__name__ = getattr(handler, "__name__", "world_scoped_handler")
    return _wrapped


async def get_worlds(request):
    try: viewer_uid = get_auth_user_id(request)
    except Exception: viewer_uid = None
    async with WORLD_SWITCH_LOCK:
        _persist_active_world_memory()
        result = []
        now = utcnow()
        for wid, meta in sorted(worlds_registry.items(), key=lambda x: int(x[0])):
            state = world_states.get(str(wid), {})
            rows = state.get("players", {}) if isinstance(state, dict) else {}
            start = parse_dt(meta.get("game_started_at"))
            end = start + timedelta(days=GAME_TOTAL_DAYS) if start else None
            elapsed_days = max(0.0, (now - start).total_seconds() / 86400.0) if start else 0.0
            day = min(GAME_TOTAL_DAYS, int(elapsed_days) + 1) if start else 0
            season, _ = _season_for_elapsed_days(min(elapsed_days, GAME_TOTAL_DAYS)) if start else ("در انتظار شروع", 0)
            result.append({"id": int(wid), "name": meta.get("name", f"دنیای {wid}"),
                           "created_at": meta.get("created_at"), "players": sum(1 for p in rows.values() if isinstance(p, dict) and p.get("country") and not p.get("is_eliminated")),
                           "countries_taken": len(
                               {p.get("country") for p in rows.values() if isinstance(p, dict) and p.get("country") and not p.get("is_eliminated")}
                               | set((state.get("occupied_countries", {}) or {}).keys())
                           ),
                           "registration_open": bool(meta.get("registration_open", not bool(start))),
                           "game_started_at": start.isoformat() if start else None,
                           "game_ends_at": end.isoformat() if end else None,
                           "game_started": bool(start),
                           "game_finished": bool(meta.get("game_finished") or (end and now >= end)),
                           "day": day, "season": season, "winner": meta.get("winner"),
                           # آیا این کاربر قبلاً در همین دنیا کشور گرفته است؟ (برای ورود خودکار)
                           "mine": bool(viewer_uid is not None and any(
                               str(k) == str(viewer_uid) and isinstance(p, dict) and p.get("country") and not p.get("is_eliminated")
                               for k, p in rows.items()))})
        return web.json_response({"success": True, "worlds": result})


async def admin_global(request):
    denied = _admin_denied(request)
    if denied: return denied
    # Aggregate saved per-world state; never combine countries from different worlds.
    async with WORLD_SWITCH_LOCK:
        _persist_active_world_memory()
        now = utcnow()
        result = []
        for wid, meta in sorted(worlds_registry.items(), key=lambda x: int(x[0])):
            state = world_states.get(str(wid), {}) or {}
            rows = list((state.get("players") or {}).values())
            rows = [x for x in rows if isinstance(x, dict)]
            start = parse_dt(meta.get("game_started_at"))
            end = start + timedelta(days=GAME_TOTAL_DAYS) if start else None
            elapsed = max(0, (now - start).total_seconds()/86400) if start else 0
            country_set = {p.get("country") for p in rows if p.get("country") and not p.get("is_eliminated")}
            country_set |= set((state.get("occupied_countries") or {}).keys())
            pm = state.get("private_messages") or {}
            # Each PM is mirrored to both participants; count only one copy.
            message_keys = set()
            for contacts in pm.values():
                if not isinstance(contacts, dict): continue
                for msgs in contacts.values():
                    for m in msgs if isinstance(msgs, list) else []:
                        if isinstance(m, dict): message_keys.add((m.get("from"), m.get("to"), m.get("text"), m.get("at")))
            result.append({"id": int(wid), "name": meta.get("name", f"دنیای {wid}"),
                "created_at": meta.get("created_at"), "players": len(country_set),
                "total_players": len(rows), "countries_taken": len(country_set), "total_countries": len(COUNTRIES),
                "active_players": sum(1 for r in rows if (t := parse_dt(r.get("last_seen_at"))) and (now-t).total_seconds() <= 900),
                "pending_wars": sum(1 for w in (state.get("war_declarations") or {}).values() if isinstance(w, dict) and w.get("status") == "pending_admin"),
                "private_message_count": len(message_keys), "un_message_count": len(state.get("un_messages") or []),
                "registration_open": bool(meta.get("registration_open", not bool(start))),
                "game_started_at": start.isoformat() if start else None,
                "game_ends_at": end.isoformat() if end else None,
                "game_started": bool(start), "game_finished": bool(meta.get("game_finished") or (end and now >= end)),
                "day": min(GAME_TOTAL_DAYS, int(elapsed)+1) if start else 0,
                "season": _season_for_elapsed_days(min(elapsed, GAME_TOTAL_DAYS))[0] if start else "در انتظار شروع",
                "winner": meta.get("winner")})
        return web.json_response({"success": True, "worlds": result})

async def admin_communications(request):
    denied = _admin_denied(request)
    if denied: return denied
    messages = {}
    for contacts in private_messages.values():
        if not isinstance(contacts, dict): continue
        for thread in contacts.values():
            if not isinstance(thread, list): continue
            for m in thread:
                if not isinstance(m, dict): continue
                key = (m.get("from"), m.get("to"), m.get("text"), m.get("at"))
                messages[key] = {"from": m.get("from"), "to": m.get("to"), "text": m.get("text", ""), "at": m.get("at")}
    recent = sorted(messages.values(), key=lambda m: m.get("at") or "", reverse=True)[:150]
    return web.json_response({"success": True, "messages": recent})

async def admin_start_world(request):
    denied = _admin_denied(request)
    if denied: return denied
    meta = _world_meta()
    if meta.get("game_started_at"):
        return web.json_response({"success": False, "error": "already_started", "message": "این دنیا قبلاً شروع شده است."}, status=409)
    active = [p for p in players.values() if p.get("country") and not p.get("is_eliminated")]
    if not active:
        return web.json_response({"success": False, "error": "no_players", "message": "پیش از شروع، دست‌کم یک کشور باید انتخاب شده باشد."}, status=400)
    now = utcnow()
    meta["game_started_at"] = now.isoformat()
    meta["game_ends_at"] = (now + timedelta(days=GAME_TOTAL_DAYS)).isoformat()
    meta["game_finished"] = False
    meta["winner"] = None
    meta["registration_open"] = False
    meta["last_announced_season"] = "بهار"
    for p in active:
        p["started_at"] = now.isoformat()
        p["last_update"] = now.isoformat()
    message = f"🚩 فصل بازی در دنیای {meta.get('name', active_world_id)} آغاز شد! روز اول برای همهٔ بازیکنان هم‌زمان است؛ بازی ۳۱ روز ادامه دارد. هر فصل ۲ روز است؛ بهار بدون اثر است."
    push_news("آغاز فصل", message, "success")
    push_war("season_started", message, [p.get("country") for p in active])
    await notify_world_players(message)
    log_admin_action("شروع فصل دنیا", None, f"world={active_world_id}; start={now.isoformat()}")
    save_state()
    return web.json_response({"success": True, "message": message, "game_started_at": now.isoformat(),
                              "game_ends_at": meta["game_ends_at"]})


async def admin_set_world_registration(request):
    denied = _admin_denied(request)
    if denied: return denied
    data = await read_json(request)
    meta = _world_meta()
    if meta.get("game_finished"):
        return web.json_response({"success": False, "message": "بازی تمام شده و ثبت‌نام دوباره قابل بازگشایی نیست."}, status=400)
    opened = bool(data.get("open"))
    meta["registration_open"] = opened
    status = "بازگشایی شد؛ فقط کشورهای آزاد قابل انتخاب‌اند." if opened else "ثبت‌نام این دنیا بسته شد."
    log_admin_action("تغییر وضعیت ثبت‌نام", None, f"world={active_world_id}; open={opened}")
    save_state()
    return web.json_response({"success": True, "message": status, "registration_open": opened})

async def admin_create_world(request):
    denied = _admin_denied(request)
    if denied: return denied
    data = await read_json(request)
    name = str(data.get("name", "")).strip()[:50]
    async with WORLD_SWITCH_LOCK:
        _persist_active_world_memory()
        next_id = max([int(x) for x in worlds_registry.keys()] or [0]) + 1
        if next_id > 100:
            return web.json_response({"success": False, "message": "حداکثر ۱۰۰ دنیا می‌توان ساخت."}, status=400)
        name = name or f"دنیای {next_id}"
        worlds_registry[str(next_id)] = {"id": next_id, "name": name, "created_at": utcnow().isoformat(),
                                         "registration_open": True, "game_started_at": None,
                                         "game_ends_at": None, "game_finished": False, "winner": None}
        world_states[str(next_id)] = _fresh_world_state()
        save_state()
        log_admin_action("ساخت دنیای جدید", None, f"world_id={next_id}; name={name}")
        save_state()
        return web.json_response({"success": True, "world": worlds_registry[str(next_id)]})

async def admin_rename_world(request):
    denied = _admin_denied(request)
    if denied: return denied
    data = await read_json(request)
    wid = str(data.get("world_id", "")).strip()
    name = str(data.get("name", "")).strip()[:50]
    async with WORLD_SWITCH_LOCK:
        if wid not in worlds_registry:
            return web.json_response({"success": False, "message": "این دنیا وجود ندارد."}, status=404)
        if not name:
            return web.json_response({"success": False, "message": "نام دنیا نمی‌تواند خالی باشد."}, status=400)
        old = worlds_registry[wid].get("name", wid)
        worlds_registry[wid]["name"] = name
        log_admin_action("ویرایش نام دنیا", None, f"world_id={wid}; {old} -> {name}")
        save_state()
    return web.json_response({"success": True, "message": f"نام دنیا به «{name}» تغییر کرد.", "name": name})

async def admin_delete_world(request):
    denied = _admin_denied(request)
    if denied: return denied
    data = await read_json(request)
    wid = str(data.get("world_id", "")).strip()
    async with WORLD_SWITCH_LOCK:
        if wid not in worlds_registry:
            return web.json_response({"success": False, "message": "این دنیا وجود ندارد."}, status=404)
        if len(worlds_registry) <= 1:
            return web.json_response({"success": False, "message": "آخرین دنیا قابل حذف نیست."}, status=400)
        _persist_active_world_memory()
        name = worlds_registry[wid].get("name", wid)
        worlds_registry.pop(wid, None)
        world_states.pop(wid, None)
        if str(active_world_id) == wid:
            _activate_world(sorted(worlds_registry, key=lambda x: int(x))[0])
        log_admin_action("حذف دنیا", None, f"world_id={wid}; name={name}")
        save_state()
    return web.json_response({"success": True, "message": f"دنیای «{name}» حذف شد."})

async def autosave_loop():
    while True:
        await asyncio.sleep(60)
        async with WORLD_SWITCH_LOCK:
            save_state()

# =========================================================
# Auth
# =========================================================
def verify_init_data(init_data: str):
    if not init_data: return None
    try:
        parsed = dict(parse_qsl(init_data, keep_blank_values=True))
        rh = parsed.pop("hash", None)
        if not rh: return None
        dcs = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
        secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        computed = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(computed, rh): return None
        try: auth_date = int(parsed.get("auth_date") or 0)
        except (TypeError, ValueError): return None
        if not auth_date or time.time() - auth_date > 24 * 3600: return None
        u = parsed.get("user")
        if u: return json.loads(u)
        return None
    except Exception as e:
        logging.error("verify_init_data: %s", e); return None

def get_auth_user_id(request):
    init_data = request.headers.get("X-Telegram-Init-Data") or request.query.get("init_data")
    if init_data:
        user = verify_init_data(init_data)
        if user and user.get("id"):
            return remember_telegram_user(user)
    if DEV_AUTH:
        uid = request.query.get("user_id")
        if uid:
            try: return int(uid)
            except: return None
    return None

async def read_json(request):
    try: return await request.json()
    except: return {}

@web.middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS": response = web.Response()
    else:
        try: response = await handler(request)
        except web.HTTPException as ex: response = ex
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Telegram-Init-Data"
    response.headers["Access-Control-Max-Age"] = "3600"
    return response

# =========================================================
# Bot
# =========================================================
bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=None))
dp = Dispatcher()

class GameEntryButtonMiddleware(BaseRequestMiddleware):
    """Append a persistent WebApp entry button to every message sent by the bot."""
    async def __call__(self, make_request, bot, method):
        if isinstance(method, SendMessage):
            entry_button = InlineKeyboardButton(
                text="🎮 ورود به بازی",
                web_app=WebAppInfo(url=WEB_APP_URL)
            )
            markup = getattr(method, "reply_markup", None)
            if isinstance(markup, InlineKeyboardMarkup):
                rows = [list(row) for row in markup.inline_keyboard]
                already_present = any(button.web_app is not None for row in rows for button in row)
                if not already_present:
                    rows.append([entry_button])
                method.reply_markup = InlineKeyboardMarkup(inline_keyboard=rows)
            else:
                # SendMessage permits only one reply markup type; inline markup is
                # used here so the game entry button is always available below text.
                method.reply_markup = InlineKeyboardMarkup(inline_keyboard=[[entry_button]])
        return await make_request(bot, method)

bot.session.middleware(GameEntryButtonMiddleware())

@dp.message(Command("start"))
async def start_command(message: types.Message):
    user_id = message.from_user.id
    # حساب داخل دنیای انتخاب‌شده ثبت می‌شود؛ /start نباید کاربر را ناخواسته به دنیای ۱ اضافه کند.
    game_url = WEB_APP_URL
    if int(user_id) == int(ADMIN_ID):
        admin_url = WEB_APP_URL + ("&" if "?" in WEB_APP_URL else "?") + "open=admin"
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🎮 ورود به بازی", web_app=WebAppInfo(url=game_url))],
            [InlineKeyboardButton(text="🛡️ ورود به پنل مدیریت", web_app=WebAppInfo(url=admin_url))],
        ])
        text = "🛡️ دسترسی مدیر اصلی\nاز یکی از دکمه‌های زیر وارد بازی یا مرکز مدیریت شو."
    else:
        kb = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="🌍 ورود به بازی", web_app=WebAppInfo(url=game_url))]])
        text = "⚔️ به FRONT-LINE 1936 خوش آمدید.\nبرای آغاز، دنیا و سپس کشور خود را انتخاب کنید."
    await message.answer(text, reply_markup=kb)

async def notify_admin(text, keyboard=None):
    if ADMIN_ID:
        try: await _tg_send(ADMIN_ID, text, reply_markup=keyboard)
        except Exception as e: logging.warning("admin notify: %s", e)

@dp.callback_query(F.data.startswith("treaty:"))
async def treaty_cb(cb: types.CallbackQuery):
    # قالب: treaty:<accept|reject>:<world_id>:<proposal_id>
    parts = (cb.data or "").split(":")
    if len(parts) != 4:
        await cb.answer("درخواست نامعتبر است.", show_alert=True); return
    _, action, wid, pid = parts
    text, alert = "منقضی شده است.", True
    async with WORLD_SWITCH_LOCK:
        previous = str(active_world_id)
        _persist_active_world_memory()
        try:
            if wid in worlds_registry and _activate_world(wid):
                text, alert = _apply_treaty_response(pid, cb.from_user.id, action == "accept")
                save_state()
        finally:
            _persist_active_world_memory()
            _activate_world(previous if previous in worlds_registry else "1")
    try: await cb.message.edit_text(text)
    except Exception: pass
    await cb.answer(text, show_alert=alert)

@dp.callback_query(F.data.startswith("war:"))
async def war_cb(cb: types.CallbackQuery):
    _, action, war_id = cb.data.split(":")
    if cb.from_user.id != ADMIN_ID:
        await cb.answer("دسترسی ندارید."); return
    response = None
    keep_message = False
    with _tg_outbox_scope():
        async with WORLD_SWITCH_LOCK:
            previous = str(active_world_id)
            _persist_active_world_memory()
            try:
                for wid in sorted(worlds_registry, key=lambda x: int(x)):
                    _activate_world(wid)
                    w = war_declarations.get(war_id)
                    if w is None:
                        continue
                    if w.get("status") != "pending_admin":
                        response = ("درخواست قبلاً بررسی شده یا منقضی است.", True)
                        break
                    if action == "approve":
                        # دلیل رسمی مدیر لازم است و از دکمهٔ تلگرام نوشته نمی‌شود؛ پیام و دکمه‌ها دست‌نخورده می‌مانند.
                        response = ("برای تأیید باید دلیل رسمی خودتان را بنویسید؛ از «بررسی جنگ‌ها» در پنل مدیریت تأیید کنید.", True)
                        keep_message = True
                        break
                    if action == "reject":
                        w["status"] = "rejected"
                        message = f"درخواست اعلان جنگ {COUNTRIES[w['attacker']]['name']} علیه {COUNTRIES[w['defender']]['name']} رد شد."
                        push_news("درخواست جنگ رد شد", message, countries=[w["attacker"], w["defender"]])
                        await notify_world_players(message)
                        response = ("❌ درخواست رد شد.", False)
                    else:
                        response = ("عملیات نامعتبر است.", True)
                    save_state()
                    break
                if response is None:
                    response = ("درخواست جنگ در هیچ‌کدام از دنیاها پیدا نشد.", True)
            finally:
                _persist_active_world_memory()
                _activate_world(previous if previous in worlds_registry else "1")
                save_state()
    text, alert = response
    try:
        if not keep_message: await cb.message.edit_text(text)
    except Exception:
        pass
    await cb.answer(text, show_alert=alert)

# =========================================================
# API Player / Countries
# =========================================================
async def get_player(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    if uid not in players: players[uid] = create_player(uid); save_state()
    data = serialize_player(players[uid])
    data["guide_seen"] = bool(players[uid].get("guide_seen"))
    note = reset_notices.pop(str(uid), None)
    if note:
        data["reset_notice"] = note
        save_state()
    return web.json_response(data)

async def mark_guide_seen(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    p = players.get(uid)
    if p is not None and not p.get("guide_seen"):
        p["guide_seen"] = True; save_state()
    return web.json_response({"success": True})

async def get_countries(request):
    result = []
    for cid, c in COUNTRIES.items():
        oid, _ = get_player_by_country(cid)
        result.append({"id": cid, "name": c["name"], "flag": c["flag"],
                       "taken": oid is not None, "occupier": occupied_countries.get(cid)})
    return web.json_response(result)

async def select_country(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); cid = data.get("country")
    if cid not in COUNTRIES:
        return web.json_response({"success": False, "error": "invalid_country"}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]
    if p.get("is_eliminated"):
        return web.json_response({"success": False, "error": "player_eliminated",
                                  "message": "این حساب از دور جاری حذف شده و امکان انتخاب کشور دوباره را ندارد."}, status=403)
    if p.get("country"):
        if p["country"] == cid: return web.json_response({"success": True, "player": serialize_player(p)})
        return web.json_response({"success": False, "error": "already_has_country"}, status=409)
    meta = _world_meta()
    if not meta.get("registration_open", not bool(meta.get("game_started_at"))):
        return web.json_response({"success": False, "error": "registration_closed",
                                  "message": "ثبت‌نام این دنیا بسته است. فرمانده باید از پنل مدیریت آن را بازگشایی کند."}, status=403)
    if cid in occupied_countries:
        return web.json_response({"success": False, "error": "occupied",
                                  "message": "این کشور اشغال شده است و قابل انتخاب نیست."}, status=409)
    oid, _ = get_player_by_country(cid)
    if oid is not None and oid != uid:
        return web.json_response({"success": False, "error": "country_taken"}, status=409)
    p["country"] = cid
    world_start = parse_dt(meta.get("game_started_at"))
    if world_start:
        p["started_at"] = world_start.isoformat()
        p["last_update"] = utcnow().isoformat()
    else:
        p["started_at"] = None
        p["last_update"] = None
    save_state()
    return web.json_response({"success": True, "player": serialize_player(p)})

# =========================================================
# API Infra / Economy / Army
# =========================================================
HOME_BUSY_MESSAGE = "در بخش خانه هم‌زمان فقط یک فعالیت ممکن است؛ تا پایان فعالیت فعلی نمی‌توانید فعالیت دیگری شروع کنید."

def home_busy_response(job):
    left = 0
    end = parse_dt(job.get("end")) if job else None
    if end: left = max(0, int((end - utcnow()).total_seconds()))
    return web.json_response({"success": False, "error": "home_busy", "message": HOME_BUSY_MESSAGE,
                              "busy_with": job.get("label") if job else None, "ready_in": left}, status=409)

def start_home_job(p, kind, item_id, item, lv, cost, res_cost, levels):
    """هزینه را کسر می‌کند و فعالیت زمان‌دار را در صف خانه ثبت می‌کند. فعالیت خانه همیشه زمان مشخص دارد."""
    label = f"ساخت {item['name']}" if lv == 0 else f"ارتقای {item['name']} به سطح {lv + 1}"
    build_s = int(levels[lv].get("time") or 0) or auto_home_seconds(cost)
    now = utcnow()
    p["money"] -= cost
    for k, a in res_cost.items(): p["resources"][k] -= a
    p.setdefault("build_queue", []).append({
        "id": str(uuid.uuid4()), "kind": kind, "item_id": item_id, "level": lv + 1, "label": label,
        "start": now.isoformat(), "end": (now + timedelta(seconds=build_s)).isoformat()})
    return build_s

async def upgrade_infra(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); item_id = data.get("category")
    if item_id not in INFRASTRUCTURE:
        return web.json_response({"success": False, "error": "invalid_category"}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]
    if not p.get("country") or p.get("is_eliminated"):
        return web.json_response({"success": False, "error": "invalid_state"}, status=400)
    accrue_player(p); ensure_player_fields(p)
    busy = home_active_job(p)
    if busy:   # صف خانه: فقط یک فعالیت هم‌زمان
        return home_busy_response(busy)
    item = INFRASTRUCTURE[item_id]; lv = get_infra_level(p, item_id); levels = item["levels"]
    if lv >= len(levels):
        return web.json_response({"success": False, "error": "max_level"}, status=400)
    cost = levels[lv]["cost"]; res_cost = levels[lv].get("resources", {})
    if p.get("money", 0) < cost:
        return web.json_response({"success": False, "error": "not_enough_money",
                                  "message": "پول کافی ندارید."}, status=400)
    req_power = item.get("power_required", 0)
    if req_power and get_power_total(p) < get_power_used(p) + req_power:
        return web.json_response({"success": False, "error": "not_enough_power",
                                  "message": "برق کافی ندارید. ابتدا نیروگاه بسازید یا ارتقا دهید."}, status=400)
    for k, a in res_cost.items():
        if p["resources"].get(k, 0) < a:
            return web.json_response({"success": False, "error": "not_enough_resource",
                                      "message": f"{RESOURCE_NAMES[k]} کافی ندارید."}, status=400)
    build_s = start_home_job(p, "infra", item_id, item, lv, cost, res_cost, levels)
    save_state()
    return web.json_response({"success": True, "queued": True, "ready_in": build_s, "player": serialize_player(p)})

async def upgrade_economy(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); item_id = data.get("category")
    if item_id not in ECONOMY:
        return web.json_response({"success": False, "error": "invalid_category"}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]
    if not p.get("country") or p.get("is_eliminated"):
        return web.json_response({"success": False, "error": "invalid_state"}, status=400)
    accrue_player(p); ensure_player_fields(p)
    busy = home_active_job(p)
    if busy:
        return home_busy_response(busy)
    item = ECONOMY[item_id]; lv = get_infra_level(p, item_id); levels = item["levels"]
    if lv >= len(levels):
        return web.json_response({"success": False, "error": "max_level"}, status=400)
    cost = levels[lv]["cost"]
    if p.get("money", 0) < cost:
        return web.json_response({"success": False, "error": "not_enough_money",
                                  "message": "پول کافی ندارید."}, status=400)
    req_power = item["power_required"]
    if get_power_total(p) < get_power_used(p) + req_power:
        return web.json_response({"success": False, "error": "not_enough_power",
                                  "message": "برق کافی ندارید. ابتدا نیروگاه بسازید."}, status=400)
    build_s = start_home_job(p, "economy", item_id, item, lv, cost, {}, levels)
    save_state()
    return web.json_response({"success": True, "queued": True, "ready_in": build_s, "player": serialize_player(p)})

async def train_unit(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); unit_id = data.get("unit_id")
    try: count = int(data.get("count", 1))
    except: count = 1
    count = max(1, min(count, 100000))
    request_id = str(data.get("request_id") or "")[:64]
    if unit_id not in ARMY_UNITS:
        return web.json_response({"success": False, "error": "invalid_unit"}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]
    if not p.get("country") or p.get("is_eliminated"):
        return web.json_response({"success": False, "error": "invalid_state"}, status=400)
    ensure_player_fields(p); accrue_player(p)
    # ارسال دوبارهٔ همان درخواست (دوبار کلیک، تلاش مجدد شبکه) نباید دوباره هزینه کسر کند یا سفارش ثبت کند.
    if request_id and request_id in p["factory_request_ids"]:
        return web.json_response({"success": True, "duplicate": True, "queued": True, "player": serialize_player(p)})
    unit = ARMY_UNITS[unit_id]; group = unit["group"]
    ml = unit.get("min_level", {}); missing = []
    for r in unit["requires"]:
        need = ml.get(r, 1)
        if get_infra_level(p, r) < need:
            missing.append(INFRASTRUCTURE[r]["name"] + (f" سطح {need}" if need > 1 else ""))
    if missing:
        return web.json_response({"success": False, "error": "no_infra",
                                  "message": "ابتدا بسازید: " + "، ".join(f"«{m}»" for m in missing)}, status=400)
    queue = factory_queues(p)[group]; limit = FACTORY_QUEUE_LIMITS[group]
    if len(queue) >= limit:
        return web.json_response({"success": False, "error": "queue_full",
                                  "message": f"صف کارخانهٔ {FACTORY_GROUP_NAMES[group]} پر است (حداکثر {limit} سفارش). "
                                             "تا تکمیل یکی از سفارش‌ها صبر کنید."}, status=400)
    cap = get_group_capacity(p, group)
    used = get_group_units(p, group) + queued_units_in_group(p, group)   # واحدهای داخل صف از ظرفیت رزرو می‌شوند
    store = {"land": "پادگان", "naval": "بندر", "air": "فرودگاه", "missile": "انبار موشک"}.get(group, "")
    if cap <= 0:
        return web.json_response({"success": False, "error": "no_storage",
                                  "message": f"برای نگهداری یگان‌ها ابتدا «{store}» را بسازید."}, status=400)
    if used >= cap:
        return web.json_response({"success": False, "error": "capacity_full",
                                  "message": f"ظرفیت {GROUP_NAMES[group]} پر است."}, status=400)
    count = min(count, cap - used)
    total_cost = unit["cost"] * count; total_mp = unit["manpower"] * count
    if p.get("money", 0) < total_cost:
        return web.json_response({"success": False, "error": "not_enough_money",
                                  "message": "پول کافی ندارید."}, status=400)
    if p.get("manpower", 0) < total_mp:
        return web.json_response({"success": False, "error": "not_enough_manpower",
                                  "message": "نیروی انسانی کافی ندارید."}, status=400)
    for k, a in unit["resources"].items():
        if p["resources"].get(k, 0) < a * count:
            return web.json_response({"success": False, "error": "not_enough_resource",
                                      "message": f"{RESOURCE_NAMES[k]} کافی ندارید."}, status=400)
    p["money"] -= total_cost; p["manpower"] -= total_mp
    for k, a in unit["resources"].items(): p["resources"][k] -= a * count
    now = utcnow(); unit_s = int(unit.get("build_seconds") or 0) or 60
    queue.append({
        "id": str(uuid.uuid4()), "kind": "train", "group": group, "unit_id": unit_id,
        "count": count, "delivered": 0, "unit_seconds": unit_s,
        # اگر صف خالی است همین حالا شروع می‌شود؛ وگرنه سفارش منتظر می‌ماند تا قبلی تمام شود.
        "start": now.isoformat() if not queue else None, "queued_at": now.isoformat(),
        "label": f"تولید {count:,} {unit['name']}"})
    if request_id:
        p["factory_request_ids"].append(request_id)
        del p["factory_request_ids"][:-FACTORY_REQUEST_ID_KEEP]
    save_state()
    return web.json_response({"success": True, "queued": True, "ready_in": unit_s * count,
                              "unit_seconds": unit_s, "player": serialize_player(p)})

async def get_army_units(request):
    return web.json_response({"units": ARMY_UNITS, "resources": RESOURCE_NAMES, "groups": GROUP_NAMES,
                              "queue_limits": FACTORY_QUEUE_LIMITS, "queue_names": FACTORY_GROUP_NAMES})

# =========================================================
# API Diplomacy
# =========================================================
# =========================================================
# API War
# =========================================================
def _world_recipients(exclude_uid=None):
    """فقط بازیکنانی که در همین دنیا کشور دارند و حذف نشده‌اند گیرندهٔ پیام می‌شوند.
    بازیکن ریست‌شده یا کسی که فقط بازی را باز کرده (بدون انتخاب کشور) هیچ پیامی از این دنیا نمی‌گیرد."""
    return [int(uid) for uid, pl in list(players.items())
            if isinstance(pl, dict) and pl.get("country") and not pl.get("is_eliminated")
            and (exclude_uid is None or str(uid) != str(exclude_uid))]


async def notify_world_players(message):
    """Broadcast an in-game world event to each Telegram user registered in this world."""
    text = (_world_tag() + str(message))[:3500]
    items = [(int(uid), text, None) for uid, p in list(players.items())
             if p.get("country") and not p.get("is_eliminated")]
    await _tg_dispatch(items)


# =========================================================
# API Diplomacy
# =========================================================
def have_treaty(a, b, kind):
    now = utcnow()
    for t in active_treaties:
        if t.get("treaty_type") != kind: continue
        exp = parse_dt(t.get("expires_at"))
        if exp and now >= exp: continue
        if (t["country_a"] == a and t["country_b"] == b) or (t["country_a"] == b and t["country_b"] == a):
            return True
    return False

def _apply_treaty_response(pid, responder_uid, accept):
    """منطق مشترک پذیرش/رد پیمان برای وب‌اپ و دکمه‌های تلگرام. خروجی: (پیام، آیا هشدار است)."""
    p = diplomacy_proposals.get(pid)
    if not p or p.get("status") != "pending":
        return "این پیشنهاد منقضی شده یا قبلاً پاسخ داده شده است.", True
    if int(p["to_user"]) != int(responder_uid):
        return "این پیشنهاد برای شما نیست.", True
    tn = TREATY_TYPE_NAMES[p["treaty_type"]]
    if accept:
        p["status"] = "accepted"
        active_treaties.append({"id": str(uuid.uuid4()), "country_a": p["from_country"],
            "country_b": p["to_country"], "treaty_type": p["treaty_type"],
            "expires_at": (utcnow() + timedelta(days=p["duration_days"])).isoformat()})
        push_news("پیمان جدید", f"{COUNTRIES[p['from_country']]['name']} و {COUNTRIES[p['to_country']]['name']} {tn} بستند.")
        notify_country(p["from_country"], f"✅ {COUNTRIES[p['to_country']]['name']} {tn} را پذیرفت.")
        return f"✅ {tn} پذیرفته شد.", False
    p["status"] = "rejected"
    notify_country(p["from_country"], f"❌ {COUNTRIES[p['to_country']]['name']} {tn} را رد کرد.")
    return f"❌ {tn} رد شد.", False

async def propose_treaty(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request)
    target = data.get("target"); ttype = data.get("type")
    try: dur = int(data.get("duration_days", 10))
    except Exception: dur = 10
    dur = max(1, min(dur, 30))
    if target not in COUNTRIES or ttype not in TREATY_TYPE_NAMES:
        return web.json_response({"success": False, "error": "invalid", "message": "کشور یا نوع پیمان نامعتبر است."}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]; fc = p.get("country")
    if not fc or p.get("is_eliminated"):
        return web.json_response({"success": False, "error": "no_country", "message": "ابتدا کشور انتخاب کنید."}, status=400)
    if target == fc:
        return web.json_response({"success": False, "error": "self", "message": "با خودتان نمی‌توانید پیمان ببندید."}, status=400)
    if target in occupied_countries:
        return web.json_response({"success": False, "error": "occupied", "message": "این کشور اشغال شده است."}, status=400)
    tuid, _ = get_player_by_country(target)
    if tuid is None:
        return web.json_response({"success": False, "error": "unowned", "message": "این کشور بازیکن فعال ندارد."}, status=400)
    if have_treaty(fc, target, ttype):
        return web.json_response({"success": False, "error": "exists", "message": f"{TREATY_TYPE_NAMES[ttype]} با این کشور از قبل فعال است."}, status=400)
    for x in diplomacy_proposals.values():
        if x.get("status") == "pending" and x["from_user"] == uid and x["to_country"] == target and x["treaty_type"] == ttype:
            return web.json_response({"success": False, "error": "duplicate", "message": "پیشنهاد مشابهی در انتظار پاسخ است."}, status=400)
    # اگر طرف مقابل از قبل همین پیمان را به ما پیشنهاد داده، نباید پیشنهاد متقابل ثبت شود؛ باید همان را بپذیریم.
    for x in diplomacy_proposals.values():
        if x.get("status") == "pending" and x["from_country"] == target and x["to_country"] == fc and x["treaty_type"] == ttype:
            return web.json_response({"success": False, "error": "reverse_pending",
                "message": f"{COUNTRIES[target]['name']} قبلاً {TREATY_TYPE_NAMES[ttype]} را به شما پیشنهاد داده است؛ در بخش «پیشنهادهای دریافتی» آن را بپذیرید یا رد کنید."}, status=400)
    pid = str(uuid.uuid4())
    diplomacy_proposals[pid] = {"id": pid, "from_user": uid, "from_country": fc,
        "to_user": tuid, "to_country": target, "treaty_type": ttype,
        "duration_days": dur, "status": "pending", "created_at": utcnow().isoformat()}
    # فقط اطلاع‌رسانی؛ تأیید یا رد باید داخل بازی، در بخش دیپلماسی انجام شود.
    try:
        await _tg_send(tuid,
            f"📜 پیشنهاد {TREATY_TYPE_NAMES[ttype]}\nاز {COUNTRIES[fc]['name']} به مدت {dur} روز\n"
            "برای تأیید یا رد، وارد بازی شوید و در بخش «دیپلماسی» تصمیم بگیرید.")
    except Exception as e: logging.warning("treaty msg: %s", e)
    save_state()
    return web.json_response({"success": True, "message": "پیشنهاد ثبت شد."})

async def get_diplomacy(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]
    cid = p.get("country")
    now = utcnow()
    sent = [x for x in diplomacy_proposals.values() if x["from_user"] == uid and x["status"] == "pending"]
    recv = [x for x in diplomacy_proposals.values() if x["to_user"] == uid and x["status"] == "pending"]
    tr = [t for t in active_treaties if cid and (t["country_a"] == cid or t["country_b"] == cid)
          and (parse_dt(t.get("expires_at")) or now) > now]
    return web.json_response({"sent": sent, "received": recv, "treaties": tr})

async def respond_treaty(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); pid = data.get("proposal_id"); accept = bool(data.get("accept"))
    message, alert = _apply_treaty_response(pid, uid, accept)
    if alert:
        return web.json_response({"success": False, "error": "invalid", "message": message}, status=400)
    save_state()
    return web.json_response({"success": True, "message": message})

async def declare_war(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); target = data.get("target")
    reason = str(data.get("reason", "")).strip()[:1800]
    if not reason:
        return web.json_response({"success": False, "error": "reason_required", "message": "دلیل اعلان جنگ را بنویسید."}, status=400)
    if target not in COUNTRIES:
        return web.json_response({"success": False, "error": "invalid_target"}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]
    if not p.get("country") or p.get("is_eliminated"):
        return web.json_response({"success": False, "error": "invalid_state"}, status=400)
    attacker = p["country"]
    if target == attacker:
        return web.json_response({"success": False, "error": "self"}, status=400)
    if sum(p.get("units", {}).values()) == 0:
        return web.json_response({"success": False, "error": "no_units",
                                  "message": "هیچ یگانی ندارید."}, status=400)
    tuid, tp = get_player_by_country(target)
    if tuid is None: return web.json_response({"success": False, "error": "unowned"}, status=400)
    if target in occupied_countries:
        return web.json_response({"success": False, "error": "already_occupied"}, status=400)
    if have_treaty(attacker, target, "non_aggression"):
        return web.json_response({"success": False, "error": "non_aggression",
                                  "message": "پیمان عدم تجاوز فعال است."}, status=400)
    penalty = WAR_PENALTY_ALLIANCE if have_treaty(attacker, target, "alliance") else 0
    for w in war_declarations.values():
        if w["status"] in ("pending_admin", "negotiation", "battle") and w["attacker"] == attacker and w["defender"] == target:
            return web.json_response({"success": False, "error": "duplicate"}, status=400)
    wid = str(uuid.uuid4())
    war_declarations[wid] = {"id": wid, "attacker": attacker, "defender": target,
        "attacker_user": uid, "defender_user": tuid, "penalty": penalty,
        "reason": reason, "peace_votes": [], "status": "pending_admin", "created_at": utcnow().isoformat(), "negotiation_ends": None}
    await notify_admin(
        f"⚔️ درخواست اعلان جنگ جدید در دنیای {worlds_registry.get(str(active_world_id), {}).get('name', active_world_id)}\n"
        f"{COUNTRIES[attacker]['name']} ← {COUNTRIES[target]['name']}\n"
        f"دلیل بازیکن: {reason}\nبرای خواندن دلیل، نوشتن دلیل رسمی خودتان و تأیید یا رد، به بخش «بررسی جنگ‌ها» در پنل مدیریت بروید. در هنگام تأیید، ساعت شروع جنگ را هم خودتان تعیین کنید.")
    save_state()
    return web.json_response({"success": True, "message": "درخواست اعلان جنگ برای بررسی سازمان ملل ارسال شد؛ در صورت تأیید، مدیر زمان شروع جنگ را تعیین می‌کند."})

async def get_wars(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    if uid not in players: players[uid] = create_player(uid)
    cid = players[uid].get("country")
    # درخواست تأییدنشده فقط برای فرستنده و مدیر دیده می‌شود؛ اعلان عمومی پس از تأیید آغاز می‌شود.
    def _public_war(w):
        row = dict(w)
        if int(w.get("attacker_user", -1)) != int(uid): row.pop("reason", None)   # دلیل خام فقط برای فرستنده؛ دلیل رسمی مدیر برای همه
        return row
    pend = [_public_war(w) for w in war_declarations.values()
            if w.get("status") == "negotiation" or
            (w.get("status") == "pending_admin" and int(w.get("attacker_user", -1)) == int(uid))]
    active = [_public_war(w) for w in active_wars.values()]
    mine = [r for r in war_reports if r.get("attacker") == cid or r.get("defender") == cid][-10:]
    return web.json_response({"pending": pend, "active": active, "reports": mine,
                              "occupied": occupied_countries})

async def war_peace(request):
    """صلح: هر دو کشور درگیر باید دکمهٔ صلح را بزنند؛ همان لحظه جنگ تمام می‌شود."""
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request)
    wid = str(data.get("war_id", "")); action = str(data.get("action", "offer"))
    p = players.get(uid); cid = (p or {}).get("country")
    w = war_declarations.get(wid)
    if not cid or p.get("is_eliminated"): return _bad("برای صلح باید در این دنیا کشور داشته باشید.")
    if not w or w.get("resolved") or w.get("status") not in ("negotiation", "battle"):
        return _bad("این جنگ فعال نیست.")
    if cid not in (w.get("attacker"), w.get("defender")):
        return _bad("فقط دو کشور درگیر می‌توانند صلح کنند.", 403)
    other = w["defender"] if cid == w["attacker"] else w["attacker"]
    votes = [c for c in (w.get("peace_votes") or []) if c in (w["attacker"], w["defender"])]
    names = COUNTRIES[cid]["name"], COUNTRIES[other]["name"]
    if action == "cancel":
        if cid in votes: votes.remove(cid)
        w["peace_votes"] = votes; save_state()
        return web.json_response({"success": True, "message": "پیشنهاد صلح شما لغو شد.", "peace_votes": votes})
    if cid not in votes: votes.append(cid)
    w["peace_votes"] = votes
    if w["attacker"] in votes and w["defender"] in votes:
        w["status"] = "peace"; w["resolved"] = True; w["peace_at"] = utcnow().isoformat(); w["negotiation_ends"] = None
        active_wars.pop(wid, None)
        msg = f"🕊️ صلح میان {COUNTRIES[w['attacker']]['name']} و {COUNTRIES[w['defender']]['name']} برقرار شد و جنگ پایان یافت."
        push_news("صلح", msg, "info", countries=[w["attacker"], w["defender"]])
        push_war("peace", msg, [w["attacker"], w["defender"]])
        await notify_world_players(msg)
        save_state()
        return web.json_response({"success": True, "peace": True, "message": msg, "peace_votes": votes})
    notify_country(other, f"🕊️ {names[0]} پیشنهاد صلح داد. برای پذیرش، در بخش جنگ دکمهٔ «صلح» را بزنید.")
    save_state()
    return web.json_response({"success": True, "peace": False, "message": f"پیشنهاد صلح ثبت شد؛ منتظر پذیرش {names[1]} هستیم.", "peace_votes": votes})

async def check_wars_tick():
    """جنگ‌ها فقط در بازهٔ فعال بازی به‌روزرسانی می‌شوند."""
    _now_t = utcnow()
    active_treaties[:] = [t for t in active_treaties
                          if not (parse_dt(t.get("expires_at")) and parse_dt(t.get("expires_at")) <= _now_t)]
    meta = _world_meta()
    started = parse_dt(meta.get("game_started_at"))
    if not started or meta.get("game_finished") or utcnow() >= started + timedelta(days=GAME_TOTAL_DAYS):
        return
    for wid, w in list(war_declarations.items()):
        if w.get("status") == "negotiation":
            ends = parse_dt(w.get("negotiation_ends"))
            if ends and ends > _now_t:
                continue      # هنوز در فاز مذاکره است؛ جنگ فعال نیست.
            w["status"] = "battle"
            w["approved_at"] = w.get("approved_at") or w.get("created_at") or utcnow().isoformat()
            w["negotiation_ends"] = None
            w["battle_started_at"] = utcnow().isoformat()
            active_wars[wid] = w
            msg = (f"⚔️ مهلت مذاکرهٔ {COUNTRIES[w['attacker']]['name']} و {COUNTRIES[w['defender']]['name']} تمام شد؛ جنگ اکنون آغاز شد."
                   if w.get("admin_reason") else
                   f"اعلان جنگ قدیمی بین {COUNTRIES[w['attacker']]['name']} و {COUNTRIES[w['defender']]['name']} به جنگ فعال تبدیل شد.")
            push_news("آغاز جنگ", msg, "warning", countries=[w["attacker"], w["defender"]])
            push_war("war_started", msg, [w["attacker"], w["defender"]])
            await notify_world_players(msg)
    for wid in list(active_wars.keys()):
        if active_wars[wid].get("resolved"):
            del active_wars[wid]

async def admin_wars(request):
    denied = _admin_denied(request)
    if denied: return denied
    rows = []
    for w in sorted(war_declarations.values(), key=lambda x: x.get("created_at", ""), reverse=True):
        item = dict(w)
        item["attacker_name"] = COUNTRIES.get(w.get("attacker"), {}).get("name", w.get("attacker", "—"))
        item["defender_name"] = COUNTRIES.get(w.get("defender"), {}).get("name", w.get("defender", "—"))
        rows.append(item)
    return web.json_response({"success": True, "wars": rows})


async def admin_review_war(request):
    denied = _admin_denied(request)
    if denied: return denied
    meta = _world_meta()
    started = parse_dt(meta.get("game_started_at"))
    if not started or meta.get("game_finished") or utcnow() >= started + timedelta(days=GAME_TOTAL_DAYS):
        return web.json_response({"success": False, "message": "بررسی اعلان جنگ فقط در طول بازی فعال است."}, status=403)
    data = await read_json(request)
    wid = str(data.get("war_id", "")); action = str(data.get("action", ""))
    w = war_declarations.get(wid)
    if not w or w.get("status") != "pending_admin":
        return web.json_response({"success": False, "message": "درخواست جنگ پیدا نشد یا قبلاً بررسی شده است."}, status=400)
    attacker_name = COUNTRIES.get(w.get("attacker"), {}).get("name", w.get("attacker"))
    defender_name = COUNTRIES.get(w.get("defender"), {}).get("name", w.get("defender"))
    if action == "approve":
        admin_reason = str(data.get("admin_reason", "")).strip()[:1000]
        if not admin_reason:
            return web.json_response({"success": False, "message": "دلیل رسمی خودتان را بنویسید؛ این دلیل برای همهٔ بازیکنان ارسال می‌شود."}, status=400)
        # ساعت شروع جنگ را مدیر تعیین می‌کند (چند ساعت بعد از تأیید)؛ پیش‌فرض ۲۴ ساعت.
        try: start_hours = float(data.get("start_hours", NEGOTIATION_HOURS))
        except (TypeError, ValueError): start_hours = float("nan")
        if start_hours != start_hours or not (0 <= start_hours <= 720):
            return web.json_response({"success": False, "message": "ساعت شروع جنگ باید عددی بین ۰ تا ۷۲۰ ساعت باشد."}, status=400)
        now_ = utcnow()
        w["status"] = "negotiation"
        w["admin_reason"] = admin_reason
        w["approved_at"] = now_.isoformat()
        w["negotiation_hours"] = start_hours
        w["negotiation_ends"] = (now_ + timedelta(hours=start_hours)).isoformat()
        when_txt = "جنگ همین الان آغاز می‌شود." if start_hours == 0 else f"هر دو کشور {start_hours:g} ساعت وقت دارند وارد فاز مذاکره شوند؛ پس از آن جنگ آغاز می‌شود."
        msg = (f"⚔️ {attacker_name} به {defender_name} اعلان جنگ کرد.\n"
               f"📜 دلیل: {admin_reason}\n"
               f"🤝 {when_txt}")
        push_news("اعلان جنگ", msg, "warning", countries=[w["attacker"], w["defender"]])
        push_war("war_declared", msg, [w["attacker"], w["defender"]])
        await notify_world_players(msg)
    elif action == "reject":
        w["status"] = "rejected"
        msg = f"❎ درخواست اعلان جنگ {attacker_name} علیه {defender_name} رد شد."
        push_news("رد درخواست جنگ", msg, countries=[w["attacker"], w["defender"]])
        await notify_world_players(msg)
    else:
        return web.json_response({"success": False, "message": "عملیات نامعتبر است."}, status=400)
    log_admin_action("بررسی اعلان جنگ", None, f"world={active_world_id}; war={wid}; action={action}; reason={w.get('reason', '')[:200]}")
    save_state()
    return web.json_response({"success": True, "message": msg, "war": w})


# =========================================================
# API Map sites / Capture
# =========================================================
async def get_map_sites(request):
    sites = []
    for k, info in MAP_RESOURCES.items():
        sites.append({**info, "id": k, "kind": "resource", "owner": map_holdings.get(k)})
    for k, info in STRAITS_DATA.items():
        sites.append({"id": k, "kind": "strait", "type": "strait", "name": info["name"],
                      "lon": info["lon"], "lat": info["lat"],
                      "zone": "sea", "owner": strait_holdings.get(k),
                      "toll": int(info.get("toll", 0) or 0), "closed": bool(info.get("closed", False)),
                      "country_rules": info.get("country_rules", {}) if isinstance(info.get("country_rules", {}), dict) else {}})
    for sid, g in site_forces.items():
        if not isinstance(sid, str) or not sid.startswith(("port:", "front:")): continue
        meta = site_meta(sid)
        xy = loc_coords(g.get("owner"), sid)
        if meta and xy:
            sites.append({**meta, "lon": xy[0], "lat": xy[1], "owner": g.get("owner"), "zone": meta.get("zone", "land"), "units": g.get("units", {})})
    return web.json_response(sites)

async def capture_site(request):
    """Legacy endpoint disabled; all territorial capture must be resolved through real force dispatch."""
    uid = get_auth_user_id(request)
    if not uid:
        return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    return web.json_response({
        "success": False,
        "error": "dispatch_required",
        "message": "تصرف مستقیم حذف شده است؛ برای تصرف سکو، معدن یا تنگه، از بخش جنگ نیروها را روی نقشه اعزام کنید. تنگه‌ها، سکوها و معادن بدون اعلان جنگ هم قابل تصرف‌اند."
    }, status=400)

# =========================================================
# نیروها روی نقشه / اخبار و تاریخچهٔ جنگ / ماهواره
# =========================================================
SCAN_HOURS = 24
SAT_LAUNCH_COST = 1_000_000
SAT_SCANS = 5
COUNTRY_SCAN_COST = 1_100_000

def cname(cid): return COUNTRIES[cid]["name"] if cid in COUNTRIES else "—"

def site_meta(site_id):
    if site_id in MAP_RESOURCES:
        i = MAP_RESOURCES[site_id]
        return {"id": site_id, "name": i["name"], "kind": "resource", "type": i.get("type"), "zone": i.get("zone", "land")}
    if site_id in STRAITS_DATA:
        return {"id": site_id, "name": STRAITS_DATA[site_id]["name"], "kind": "strait", "type": "strait", "zone": "sea"}
    if site_id in NAVAL_WAYPOINTS:
        return {"id": site_id, "name": "مسیر دریایی", "kind": "waypoint", "type": "waypoint", "zone": "sea"}
    if isinstance(site_id, str) and site_id.startswith("country:"):
        target = site_id.split(":", 1)[1]
        if target in COUNTRIES:
            return {"id": site_id, "name": f"بندر {COUNTRIES[target]['name']}", "kind": "country", "type": "country_port", "zone": "sea", "country": target}
    if isinstance(site_id, str) and site_id.startswith("port:"):
        parts = site_id.split(":")
        if len(parts) == 3 and parts[1] in COUNTRIES and parts[2] in COUNTRIES:
            return {"id": site_id, "name": f"بندر {COUNTRIES[parts[1]]['name']}", "kind": "port", "type": "port", "zone": "sea", "country": parts[1], "owner": parts[2]}
    if isinstance(site_id, str) and site_id.startswith("front:"):
        parts = site_id.split(":")
        if len(parts) == 3 and parts[1] in COUNTRIES and parts[2] in COUNTRIES:
            return {"id": site_id, "name": f"جبههٔ {COUNTRIES[parts[1]]['name']}", "kind": "front", "type": "front", "zone": "land", "country": parts[1], "owner": parts[2]}
    return None

def site_zone(site_id):
    m = site_meta(site_id)
    return m["zone"] if m else None

def dispatch_rule_errors(units, zone, ground=None):
    """قوانین اعزام: بررسی می‌کند ترکیب نیرو در موضعی با این zone (sea/land) مجاز و پشتیبانی‌شده باشد."""
    errs = []
    cnt = lambda *ids: sum(max(0, units.get(i, 0)) for i in ids)
    nm = lambda i: ARMY_UNITS[i]["name"]
    # یگان‌هایی که اصلاً نمی‌توانند به این نوع موضع بروند
    banned = [k for k, n in units.items() if n > 0 and k in ARMY_UNITS and (
        ARMY_UNITS[k]["group"] == "missile" or (zone == "land" and ARMY_UNITS[k]["group"] == "naval"))]
    if banned:
        errs.append("این یگان‌ها نمی‌توانند به " + ("خشکی" if zone == "land" else "این موضع") + " بروند: "
                    + "، ".join(nm(k) for k in banned))
    if zone == "sea":
        # ground: تعداد نیروی زمینی که واقعاً حمل می‌شود. نیروهای زمینی که از قبل در موضع مستقر هستند (نگهبان) نیاز به ناو ترابری ندارند.
        ground = cnt("infantry", "tank") if ground is None else ground
        cap = units.get("transport_ship", 0) * ARMY_UNITS["transport_ship"]["transport_capacity"]
        if ground > cap:
            errs.append(f"در دریا، تانک و پیاده‌نظام به {nm('transport_ship')} نیاز دارند "
                        f"(ظرفیت حمل {cap} از {ground} یگان).")
        planes = cnt("fighter", "bomber", "air_tanker")
        cap = units.get("aircraft_carrier", 0) * ARMY_UNITS["aircraft_carrier"]["aircraft_capacity"]
        if planes > cap:
            errs.append(f"در دریا، جنگنده و بمب‌افکن به {nm('aircraft_carrier')} نیاز دارند "
                        f"(ظرفیت {cap} از {planes} هواپیما). بالگرد نیازی ندارد.")
    elif zone == "land":
        jets = cnt("fighter", "bomber")
        cap = units.get("air_tanker", 0) * ARMY_UNITS["air_tanker"]["refuel_capacity"]
        if jets > cap:
            errs.append(f"در خشکی، جنگنده و بمب‌افکن به {nm('air_tanker')} نیاز دارند "
                        f"(ظرفیت سوخت‌رسانی {cap} از {jets} هواپیما). بالگرد نیازی ندارد.")
    return errs

def is_mine(site_id):
    i = MAP_RESOURCES.get(site_id)
    return bool(i and i.get("type") in ("steel", "uranium"))

def site_owner(site_id):
    if isinstance(site_id, str) and site_id.startswith(("port:", "front:")):
        parts = site_id.split(":")
        if len(parts) == 3: return parts[2]
    return map_holdings.get(site_id) or strait_holdings.get(site_id)

def set_site_owner(site_id, cid):
    d = map_holdings if site_id in MAP_RESOURCES else strait_holdings
    if cid: d[site_id] = cid
    else: d.pop(site_id, None)

def strait_policy(site_id, country_id=None):
    """Effective toll/closure for one traveler. The owner always crosses its own strait freely."""
    info = STRAITS_DATA.get(site_id, {})
    owner = strait_holdings.get(site_id)
    if not owner:
        return {"toll": 0, "closed": False, "custom": False}
    if country_id and country_id == owner:
        return {"toll": 0, "closed": False, "custom": False}
    base_toll = max(0, int(info.get("toll", 0) or 0))
    base_closed = bool(info.get("closed", False))
    rules = info.get("country_rules", {})
    rule = rules.get(country_id, {}) if country_id and isinstance(rules, dict) else {}
    if not isinstance(rule, dict): rule = {}
    return {
        "toll": max(0, int(rule.get("toll", base_toll) or 0)),
        "closed": bool(rule.get("closed", base_closed)),
        "custom": bool(rule),
    }

def reset_strait_policy(site_id):
    """فقط وقتی تنگه بی‌صاحب می‌شود (حذف مالک) به حالت باز برمی‌گردد؛ با تصرف، تنظیمات تا تغییر مالک باقی می‌مانند."""
    if site_id in STRAITS_DATA:
        STRAITS_DATA[site_id]["toll"] = 0
        STRAITS_DATA[site_id]["closed"] = False
        STRAITS_DATA[site_id]["country_rules"] = {}

def garrison(site_id):
    g = site_forces.get(site_id)
    if g and g.get("owner") and g["owner"] == site_owner(site_id): return g["units"]
    return {}

def deployed_units(cid):
    t = {}
    if not cid: return t
    for sid, g in site_forces.items():
        if g.get("owner") == cid and site_owner(sid) == cid:
            for k, n in g["units"].items(): t[k] = t.get(k, 0) + n
    return t

def units_count(units): return sum(n for n in units.values() if n > 0)

def units_power(units, owner_player, key=None):
    t = 0.0
    for uid_, n in units.items():
        u = ARMY_UNITS.get(uid_)
        if not u or n <= 0: continue
        dm = group_defense_mult(owner_player, u["group"]) if owner_player else 1
        if key == "attack": t += n * u["attack"]
        elif key == "defense": t += n * u["defense"] * dm
        else: t += n * (u["attack"] + u["defense"] * dm)
    return t

def push_war(kind, text, countries=()):
    war_events.append({"id": str(uuid.uuid4()), "kind": kind, "text": text,
                       "countries": list(countries), "at": utcnow().isoformat()})
    if len(war_events) > 300: del war_events[:len(war_events) - 300]   # سقف ۳۰۰ خبر نظامی

def push_history(kind, title, attacker, defender, winner, detail=""):
    war_history.append({"id": str(uuid.uuid4()), "kind": kind, "title": title, "attacker": attacker,
                        "defender": defender, "winner": winner, "detail": detail, "at": utcnow().isoformat()})
    if len(war_history) > 300: del war_history[:len(war_history) - 300]   # سقف ۳۰۰ تاریخچه

def _me(uid):
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]; ensure_player_fields(p); return p

def _bad(msg, code=400):
    return web.json_response({"success": False, "message": msg}, status=code)

async def get_forces(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    process_transits()
    p = _me(uid); cid = p.get("country"); sites = []
    owned_ids = set()
    if cid:
        owned_ids.update(sid for sid, owner in map_holdings.items() if owner == cid)
        owned_ids.update(sid for sid, owner in strait_holdings.items() if owner == cid)
        owned_ids.update(sid for sid, g in site_forces.items() if g.get("owner") == cid and (sid.startswith("port:") or sid.startswith("front:")))
        owned_ids.update(sid for sid, g in site_forces.items() if g.get("owner") == cid and site_owner(sid) == cid)
    for sid in sorted(owned_ids):
        meta = site_meta(sid)
        if not meta: continue
        g = dict(site_forces.get(sid, {}).get("units", {})) if sid.startswith(("port:", "front:")) else dict(garrison(sid))
        clean = {k: int(n) for k, n in g.items() if int(n or 0) > 0}
        sites.append({**meta, "owner": cid, "units": clean, "power": int(units_power(clean, p))})
    def _trip_ends(t):
        # در سفر دریایی چندمرحله‌ای، مبدأ و مقصد نهایی نمایش داده می‌شود نه گذرگاه میانی («مسیر دریایی»).
        if t.get("kind") == "go" and t.get("passage") and t.get("route_final_dst"):
            return loc_label(t.get("origin") or t["from"]), loc_label(t["route_final_dst"])
        return ("میانهٔ راه" if t["from"] == "mid" else loc_label(t["from"])), loc_label(t["to"])
    mine = [{"id": t["id"], "from": t["from"], "to": t["to"],
             "from_name": _battle_label(t)[0] if (t.get("route_battle") or t.get("arrival_battle")) else _trip_ends(t)[0],
             "to_name": _battle_label(t)[1] if (t.get("route_battle") or t.get("arrival_battle")) else _trip_ends(t)[1], "kind": t["kind"], "units": t["units"],
             "start": (t.get("route_battle") or t.get("arrival_battle") or {}).get("started_at", t["start"]),
             "arrive": (t.get("route_battle") or t.get("arrival_battle") or {}).get("ends_at", t["arrive"]),
             "eta_arrive": ((t["arrive"] if (t.get("route_battle") or t.get("arrival_battle")) else
                             (t.get("route_total_arrive") if parse_dt(t.get("route_total_arrive")) and parse_dt(t.get("route_total_arrive")) > utcnow() else t["arrive"]))),
             "battle": bool(t.get("route_battle") or t.get("arrival_battle")), "from_ll": t.get("from_ll"), "to_ll": t.get("to_ll"),
             "trip_start": t.get("trip_start") or t["start"]}
            for t in transits if t["owner"] == cid]
    # نیروهای دشمن که به مواضع من (سکو/تنگه/معدن/ماهیگیری) می‌روند؛ بدون تعداد و نوع یگان
    incoming = []
    if cid:
        for t in transits:
            if t["owner"] == cid or t.get("kind") != "go": continue
            final = t.get("to") if (t.get("arrival_battle") or {}).get("phase") == "site" else (t.get("route_final_dst") or t.get("to"))
            if not isinstance(final, str) or final in ("home", "mid") or final.startswith(("country:", "sea:")): continue
            if not site_meta(final) or site_owner(final) != cid: continue
            in_battle = bool(t.get("route_battle") or t.get("arrival_battle"))
            rtot = parse_dt(t.get("route_total_arrive"))
            eta_arrive = t["arrive"] if (in_battle or not rtot or rtot <= utcnow()) else t.get("route_total_arrive")
            incoming.append({"id": t["id"], "country": t["owner"], "country_name": cname(t["owner"]),
                             "to": final, "to_name": loc_label(final), "battle": in_battle,
                             "start": t.get("trip_start") or t["start"], "arrive": t["arrive"],
                             "eta_arrive": eta_arrive})
    return web.json_response({"home": {k: n for k, n in p["units"].items() if n > 0}, "sites": sites,
                              "transits": mine, "incoming": incoming, "now": utcnow().isoformat()})

# ---------------- زمان سفر نیروها ----------------
# قانون یکسان زمان حرکت برای همهٔ جابه‌جایی‌های نقشه (نیرو، ناو، ناوگان تجاری، حمل کالا):
# نزدیک‌ترین مقصد ۱ دقیقه، دورترین مقصد (نصف محیط زمین) ۳ ساعت، و بقیه به‌صورت خطی بر اساس فاصله.
TRAVEL_MIN_SECONDS = 60
TRAVEL_MAX_SECONDS = 3 * 3600
TRAVEL_MIN_MINUTES = TRAVEL_MIN_SECONDS / 60
TRAVEL_MAX_MINUTES = TRAVEL_MAX_SECONDS / 60
TRAVEL_MAX_KM = 20015.0  # دورترین فاصلهٔ ممکن روی کره

def travel_seconds_for_km(km):
    try: km = float(km)
    except (TypeError, ValueError): return float(TRAVEL_MIN_SECONDS)
    if km != km: return float(TRAVEL_MIN_SECONDS)
    ratio = min(1.0, max(0.0, km / TRAVEL_MAX_KM))
    return TRAVEL_MIN_SECONDS + (TRAVEL_MAX_SECONDS - TRAVEL_MIN_SECONDS) * ratio

def fmt_duration_fa(seconds):
    secs = max(0, int(math.ceil(seconds)))
    h, m = secs // 3600, (secs % 3600) // 60
    if h and m: return f"{h} ساعت و {m} دقیقه"
    if h: return f"{h} ساعت"
    return f"{max(1, m)} دقیقه"

COUNTRY_PORT_COORDS = {
    "germany": (8.15, 53.53), "britain": (-1.10, 50.80), "ussr": (30.20, 59.93),
    "usa": (-76.30, 36.90), "france": (-4.49, 48.39), "italy": (14.27, 40.85),
    "china": (121.50, 31.23), "japan": (139.65, 35.45),
    "saudi": (39.17, 21.49), "iran": (56.27, 27.18), "turkey": (28.98, 41.00),
    "venezuela": (-66.93, 10.60), "egypt": (29.92, 31.20),
}
NAVAL_WAYPOINTS = {
    "sea:north": (3.0, 57.0), "sea:channel": (-3.8, 50.0), "sea:biscay": (-12.0, 45.0),
    "sea:westmed": (-1.0, 38.0), "sea:red": (38.0, 20.0), "sea:arabian": (58.0, 14.0),
    "sea:indian": (75.0, 2.0), "sea:southchina": (112.0, 10.0), "sea:natlantic": (-35.0, 43.0),
    "sea:baltic": (18.0, 57.0), "sea:arcticwest": (12.0, 68.0), "sea:arcticmid": (55.0, 74.0),
    "sea:arcticeast": (105.0, 73.0), "sea:bering": (170.0, 61.0), "sea:northpacific": (160.0, 43.0),
    "sea:eastpacific": (-140.0, 28.0), "sea:caribbean": (-72.0, 18.0), "sea:westafrica": (-20.0, 25.0),
    "sea:centralmed": (15.0, 35.5), "sea:eastmed": (28.0, 34.0), "sea:eastchina": (126.0, 29.0),
    "sea:westpacific": (129.0, 14.0), "sea:seajapan": (138.0, 32.0), "sea:iceland": (-20.0, 64.0),
    "sea:tyrrhenian": (12.5, 39.0), "sea:skagerrak": (9.0, 58.0),
    "sea:norwegian": (0.0, 65.0), "sea:barents": (35.0, 72.0),
    # --- مرحلهٔ ۲ (اصلاح مسیر دریایی): نقاط جدید برای جلوگیری از عبور خط مستقیم از خشکی ---
    # تنگهٔ لوزون (شمال فیلیپین): مسیر غرب اقیانوس آرام ← دریای چین جنوبی دیگر از روی جزایر فیلیپین نمی‌گذرد.
    "sea:luzon": (121.5, 20.0),
    # خلیج فارس (بعد از تنگهٔ هرمز تا سکوها)
    "sea:gulf_e": (55.5, 26.0), "sea:gulf": (53.5, 26.3),
    # مسیر تنگه‌های ترکیه (شرق مدیترانه ← دریای اژه ← داردانل ← مرمره ← بسفر ← دریای سیاه)
    "sea:aegean_s": (26.0, 36.2), "sea:aegean_c": (25.3, 37.85), "sea:aegean_n": (25.2, 39.3),
    "sea:dardanelles": (26.35, 40.14), "sea:gelibolu": (26.65, 40.37),
    "sea:marmara": (28.0, 40.78), "sea:marmara_east": (28.9, 40.9),
}
# زنجیرهٔ اجباری گذرگاه‌ها برای رسیدن به منابع (فقط گراف سکوها/معدن‌ها؛ مسیرهای کشور به کشور همان COUNTRY_SEA_LANES است).
# هر زنجیره گره‌ها را پشت‌سرهم وصل می‌کند و یال‌های میان‌بُری که تنگه را دور می‌زنند حذف می‌شوند.
SEA_SITE_CHAINS = [
    ["sea:red", "babmandeb", "sea:arabian"],                       # دریای سرخ ↔ دریای عرب فقط با باب‌المندب
    ["sea:arabian", "hormuz", "sea:gulf_e", "sea:gulf"],           # دریای عرب ↔ خلیج فارس فقط با هرمز
    ["sea:northpacific", "sea:bering"],                            # بن‌بست: فقط برای سکوی برینگ (قطبی نیست)
    ["sea:eastmed", "sea:aegean_s", "sea:aegean_c", "sea:aegean_n", "sea:dardanelles",
     "sea:gelibolu", "sea:marmara", "sea:marmara_east", "bosporus"],  # مدیترانه ↔ دریای سیاه فقط با بسفر
]
SEA_SITE_CHAIN_CUTS = [("sea:red", "sea:arabian"), ("sea:eastmed", "bosporus"), ("sea:arabian", "sea:gulf"),
                       ("sea:arabian", "sea:gulf_e"), ("sea:red", "hormuz"), ("sea:red", "sea:gulf")]
# مقصدهایی که فقط از یک دروازهٔ مشخص قابل‌دسترسی‌اند (آخرین گره پیش از خط مستقیم کوتاه تا سکو).
SITE_SEA_GATEWAY = {
    "oil_gulf": "sea:gulf", "oil_ghawar": "sea:gulf",
    "steel_bulgaria": "bosporus",
}
# نکته: دریای خزر عمداً بررسی نمی‌شود (تصمیم مالک بازی: سکوهای خزر فعلاً رها شده‌اند).
COUNTRY_SEA_LANES = {
    # مسیرها به ترتیب از کشور اول به کشور دوم نوشته شده‌اند؛ معکوس آن‌ها به‌طور خودکار برعکس می‌شود.
    ("germany", "britain"): ["sea:north", "dover"],
    ("france", "britain"): ["sea:channel", "dover"],
    ("germany", "france"): ["sea:north", "dover", "sea:channel"],
    ("germany", "italy"): ["sea:north", "dover", "sea:channel", "sea:biscay", "sea:westafrica", "gibraltar", "sea:westmed", "sea:centralmed", "sea:tyrrhenian"],
    ("france", "italy"): ["sea:channel", "sea:biscay", "sea:westafrica", "gibraltar", "sea:westmed", "sea:centralmed", "sea:tyrrhenian"],
    ("italy", "britain"): ["sea:tyrrhenian", "sea:westmed", "gibraltar", "sea:westafrica", "sea:biscay", "sea:channel", "dover"],
    ("germany", "china"): ["sea:north", "dover", "sea:channel", "sea:biscay", "sea:westafrica", "gibraltar", "sea:westmed", "sea:centralmed", "sea:eastmed", "suez", "sea:red", "babmandeb", "sea:arabian", "malacca", "sea:southchina", "sea:luzon", "sea:westpacific", "sea:eastchina"],
    ("france", "china"): ["sea:channel", "sea:biscay", "sea:westafrica", "gibraltar", "sea:westmed", "sea:centralmed", "sea:eastmed", "suez", "sea:red", "babmandeb", "sea:arabian", "malacca", "sea:southchina", "sea:luzon", "sea:westpacific", "sea:eastchina"],
    ("italy", "china"): ["sea:tyrrhenian", "sea:centralmed", "sea:eastmed", "suez", "sea:red", "babmandeb", "sea:arabian", "malacca", "sea:southchina", "sea:luzon", "sea:westpacific", "sea:eastchina"],
    ("britain", "china"): ["dover", "sea:channel", "sea:biscay", "sea:westafrica", "gibraltar", "sea:westmed", "sea:centralmed", "sea:eastmed", "suez", "sea:red", "babmandeb", "sea:arabian", "malacca", "sea:southchina", "sea:luzon", "sea:westpacific", "sea:eastchina"],
    ("ussr", "japan"): ["sea:baltic", "sea:skagerrak", "sea:north", "dover", "sea:channel", "sea:biscay", "sea:westafrica", "gibraltar", "sea:westmed", "sea:centralmed", "sea:eastmed", "suez", "sea:red", "babmandeb", "sea:arabian", "malacca", "sea:southchina", "sea:luzon", "sea:westpacific", "sea:seajapan"],
    ("china", "japan"): ["sea:eastchina", "sea:seajapan"],
    ("usa", "japan"): ["sea:caribbean", "panama", "sea:eastpacific", "sea:northpacific", "sea:seajapan"],
    ("usa", "china"): ["sea:caribbean", "panama", "sea:eastpacific", "sea:northpacific", "sea:westpacific", "sea:eastchina"],
    ("usa", "germany"): ["sea:natlantic", "sea:biscay", "sea:channel", "dover", "sea:north"],
    ("usa", "france"): ["sea:natlantic", "sea:biscay"],
    ("usa", "italy"): ["sea:natlantic", "sea:biscay", "sea:westafrica", "gibraltar", "sea:westmed", "sea:centralmed", "sea:tyrrhenian"],
    ("usa", "britain"): ["sea:natlantic", "sea:biscay", "sea:channel", "dover"],
    ("usa", "ussr"): ["sea:natlantic", "sea:iceland", "sea:norwegian", "sea:skagerrak", "sea:baltic"],
    ("ussr", "china"): ["sea:baltic", "sea:skagerrak", "sea:north", "dover", "sea:channel", "sea:biscay", "sea:westafrica", "gibraltar", "sea:westmed", "sea:centralmed", "sea:eastmed", "suez", "sea:red", "babmandeb", "sea:arabian", "malacca", "sea:southchina", "sea:luzon", "sea:westpacific", "sea:eastchina"],
    ("france", "ussr"): ["sea:channel", "dover", "sea:north", "sea:skagerrak", "sea:baltic"],
    ("italy", "ussr"): ["sea:tyrrhenian", "sea:westmed", "gibraltar", "sea:westafrica", "sea:biscay", "sea:channel", "dover", "sea:north", "sea:skagerrak", "sea:baltic"],
    ("britain", "ussr"): ["dover", "sea:north", "sea:skagerrak", "sea:baltic"],
    ("germany", "ussr"): ["sea:north", "sea:skagerrak", "sea:baltic"],
    ("britain", "japan"): ["dover", "sea:channel", "sea:biscay", "sea:westafrica", "gibraltar", "sea:westmed", "sea:centralmed", "sea:eastmed", "suez", "sea:red", "babmandeb", "sea:arabian", "malacca", "sea:southchina", "sea:luzon", "sea:westpacific", "sea:seajapan"],
    ("france", "japan"): ["sea:channel", "sea:biscay", "sea:westafrica", "gibraltar", "sea:westmed", "sea:centralmed", "sea:eastmed", "suez", "sea:red", "babmandeb", "sea:arabian", "malacca", "sea:southchina", "sea:luzon", "sea:westpacific", "sea:seajapan"],
    ("italy", "japan"): ["sea:tyrrhenian", "sea:centralmed", "sea:eastmed", "suez", "sea:red", "babmandeb", "sea:arabian", "malacca", "sea:southchina", "sea:luzon", "sea:westpacific", "sea:seajapan"],
    ("germany", "japan"): ["sea:north", "dover", "sea:channel", "sea:biscay", "sea:westafrica", "gibraltar", "sea:westmed", "sea:centralmed", "sea:eastmed", "suez", "sea:red", "babmandeb", "sea:arabian", "malacca", "sea:southchina", "sea:luzon", "sea:westpacific", "sea:seajapan"],
}

def loc_coords(cid, loc):
    if loc == "home": return TRADE_COUNTRY_COORDS.get(cid)
    if loc in NAVAL_WAYPOINTS:
        return NAVAL_WAYPOINTS[loc]
    if isinstance(loc, str) and loc.startswith("country:"):
        return COUNTRY_PORT_COORDS.get(loc.split(":", 1)[1])
    if isinstance(loc, str) and loc.startswith("port:"):
        parts = loc.split(":")
        return COUNTRY_PORT_COORDS.get(parts[1]) if len(parts) == 3 else None
    if isinstance(loc, str) and loc.startswith("front:"):
        parts = loc.split(":")
        return TRADE_COUNTRY_COORDS.get(parts[1]) if len(parts) == 3 else None
    i = MAP_RESOURCES.get(loc) or STRAITS_DATA.get(loc)
    return (i["lon"], i["lat"]) if i else None

def geo_interp(a, b, f):
    """نقطهٔ f (۰ تا ۱) روی کمان بین دو مختصات (lon, lat)."""
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    d = 2 * math.asin(min(1, math.sqrt(math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)))
    if d < 1e-9: return (a[0], a[1])
    A = math.sin((1 - f) * d) / math.sin(d); B = math.sin(f * d) / math.sin(d)
    x = A * math.cos(lat1) * math.cos(lon1) + B * math.cos(lat2) * math.cos(lon2)
    y = A * math.cos(lat1) * math.sin(lon1) + B * math.cos(lat2) * math.sin(lon2)
    z = A * math.sin(lat1) + B * math.sin(lat2)
    return (math.degrees(math.atan2(y, x)), math.degrees(math.atan2(z, math.hypot(x, y))))

# ---------------- مسیر واقعی دریایی ----------------
# زمان حرکت دریایی بر اساس طول مسیر قابل پیمایش در دریا (گذرگاه‌ها و تنگه‌ها) حساب می‌شود، نه خط مستقیم.
_SEA_CACHE = {}

def _sea_node_xy(n):
    if n in NAVAL_WAYPOINTS: return tuple(NAVAL_WAYPOINTS[n])
    i = STRAITS_DATA.get(n)
    return (i["lon"], i["lat"]) if i else None

SEA_POLAR_LAT = 66.5  # مرحلهٔ ۴: مسیر قطبی (شمالگان/جنوبگان) در مسیر‌یابی کشتی‌ها نیست.

def _sea_graph():
    g = _SEA_CACHE.get("g")
    if g: return g
    nodes = sorted(n for n in set(NAVAL_WAYPOINTS) | set(STRAITS_DATA)
                   if _sea_node_xy(n) and abs(_sea_node_xy(n)[1]) < SEA_POLAR_LAT)
    xy = {n: _sea_node_xy(n) for n in nodes}
    adj = {n: {} for n in nodes}
    def link(a, b):
        if a == b or a not in xy or b not in xy: return
        d = _great_circle_km(xy[a], xy[b]); adj[a][b] = d; adj[b][a] = d
    for lane in COUNTRY_SEA_LANES.values():
        # گره‌های قطبی حذف می‌شوند و مسیر در همان نقطه قطع می‌شود (دو گرهٔ دو سوی آن به‌هم وصل نمی‌شوند).
        seg = []
        for x in list(lane) + [None]:
            if x in xy: seg.append(x); continue
            for a, b in zip(seg, seg[1:]): link(a, b)
            seg = []
    # زنجیرهٔ تنگه‌ها: عبور از هرمز، باب‌المندب و بسفر برای منابع اجباری است.
    for a_, b_ in SEA_SITE_CHAIN_CUTS:
        if a_ in adj and b_ in adj[a_]: del adj[a_][b_]
        if b_ in adj and a_ in adj[b_]: del adj[b_][a_]
    for chain in SEA_SITE_CHAINS:
        chain = [x for x in chain if x in xy]
        for a_, b_ in zip(chain, chain[1:]): link(a_, b_)
    # گره‌هایی که در هیچ مسیر تعریف‌شده‌ای نیستند به دو گرهٔ دریایی نزدیک وصل می‌شوند.
    linked = [n for n in nodes if adj[n]]
    for n in nodes:
        if adj[n] or not linked: continue
        for m in sorted(linked, key=lambda m: _great_circle_km(xy[n], xy[m]))[:2]: link(n, m)
        linked.append(n)
    # اگر شبکه چند تکه بود، نزدیک‌ترین گره‌ها بین تکه‌ها وصل می‌شوند تا همهٔ نقاط قابل دسترسی باشند.
    def components():
        seen, comps = set(), []
        for n in nodes:
            if n in seen: continue
            comp, stack = [], [n]; seen.add(n)
            while stack:
                x = stack.pop(); comp.append(x)
                for y in adj[x]:
                    if y not in seen: seen.add(y); stack.append(y)
            comps.append(comp)
        return comps
    for _ in range(len(nodes)):
        comps = components()
        if len(comps) <= 1: break
        base = set(comps[0]); rest = [x for c in comps[1:] for x in c]
        a, b = min(((x, y) for x in base for y in rest), key=lambda r: _great_circle_km(xy[r[0]], xy[r[1]]))
        link(a, b)
    N = len(nodes); idx = {n: i for i, n in enumerate(nodes)}; INF = float("inf")
    dist = [[INF] * N for _ in range(N)]; nxt = [[None] * N for _ in range(N)]
    for n in nodes:
        i = idx[n]; dist[i][i] = 0.0; nxt[i][i] = i
        for m, d in adj[n].items(): dist[i][idx[m]] = d; nxt[i][idx[m]] = idx[m]
    for k in range(N):
        for i in range(N):
            dik = dist[i][k]
            if dik == INF: continue
            for j in range(N):
                nd = dik + dist[k][j]
                if nd < dist[i][j]: dist[i][j] = nd; nxt[i][j] = nxt[i][k]
    ref = max((d for row in dist for d in row if d != INF), default=1.0)
    g = {"nodes": nodes, "xy": xy, "idx": idx, "dist": dist, "nxt": nxt, "adj": adj, "ref": max(1.0, ref)}
    _SEA_CACHE["g"] = g
    return g

def _sea_ref_km():
    """طولانی‌ترین مأموریت دریایی ممکن (بندر هر کشور تا بندر کشورها، سکوهای دریایی و تنگه‌ها) = مرجع ۳ ساعت."""
    ref = _SEA_CACHE.get("ref")
    if ref: return ref
    best = 1.0
    ports = list(COUNTRY_PORT_COORDS)
    for i, a in enumerate(ports):
        for b_ in ports[i + 1:]:
            geo = _sea_geometry(a, "home", f"country:{b_}", b_)
            if geo: best = max(best, geo["km"])
        targets = [sid for sid, m in MAP_RESOURCES.items() if m.get("zone") == "sea"] + list(STRAITS_DATA)
        for sid in targets:
            geo = _sea_geometry(a, "home", sid)
            if geo: best = max(best, geo["km"])
    _SEA_CACHE["ref"] = best
    return best

def sea_travel_seconds(km):
    """۱ دقیقه برای کوتاه‌ترین مسیر دریایی و ۳ ساعت برای طولانی‌ترین مسیر دریایی بازی؛ بقیه خطی."""
    ratio = min(1.0, max(0.0, float(km) / _sea_ref_km()))
    return TRAVEL_MIN_SECONDS + (TRAVEL_MAX_SECONDS - TRAVEL_MIN_SECONDS) * ratio

def sea_seconds_per_km():
    return (TRAVEL_MAX_SECONDS - TRAVEL_MIN_SECONDS) / _sea_ref_km()

def _sea_blocked_nodes(traveler):
    """مرحلهٔ ۴: تنگه‌هایی که برای این مسافر بسته‌اند (مالک همیشه آزاد است)؛ مسیر‌یاب تا جای ممکن آن‌ها را دور می‌زند."""
    if not traveler: return set()
    return {sid for sid in STRAITS_DATA if strait_policy(sid, traveler).get("closed", False)}

def _sea_shortest(starts, ends, blocked=()):
    """Dijkstra چندمنبعی روی گراف دریایی. starts/ends: {نام گره: هزینهٔ اتصال به نقطهٔ واقعی (km)}.
    گره‌های blocked عبور داده نمی‌شوند. خروجی: (طول کل km، لیست گره‌ها) یا None."""
    import heapq
    g = _sea_graph(); adj = g["adj"]
    blocked = set(blocked or ())
    heap = [(c, n, (n,)) for n, c in starts.items() if n in adj and n not in blocked]
    heapq.heapify(heap); done = set()
    while heap:
        c, n, path = heapq.heappop(heap)
        if n in done: continue
        done.add(n)
        if n in ends:
            # اولین گره‌ای که با هزینهٔ اتصال انتهایی کمینه شود؛ برای درستی همهٔ end ها بررسی می‌شوند
            best_end = c + ends[n]
            # ادامهٔ جست‌وجو فقط اگر گرهٔ نزدیک‌تر دیگری با مجموع کمتر ممکن باشد
            cand = (best_end, list(path))
            while heap and heap[0][0] < cand[0]:
                c2, n2, p2 = heapq.heappop(heap)
                if n2 in done: continue
                done.add(n2)
                if n2 in ends and c2 + ends[n2] < cand[0]: cand = (c2 + ends[n2], list(p2))
                for m, d in adj[n2].items():
                    if m not in done and m not in blocked: heapq.heappush(heap, (c2 + d, m, p2 + (m,)))
            return cand
        for m, d in adj[n].items():
            if m not in done and m not in blocked: heapq.heappush(heap, (c + d, m, path + (m,)))
    return None

def _sea_choose(starts, ends, traveler=None):
    """کوتاه‌ترین مسیر؛ تنگهٔ بسته تا جای ممکن دور زده می‌شود.
    خروجی: (گره‌ها، {"alt": مسیر جایگزین انتخاب شد, "blocked": ناچار از تنگهٔ بسته می‌گذرد})."""
    blocked = _sea_blocked_nodes(traveler)
    free = _sea_shortest(starts, ends, ())
    if not free: return [], {"alt": False, "blocked": False}
    if not blocked or not any(n in blocked for n in free[1]):
        return free[1], {"alt": False, "blocked": False}
    alt = _sea_shortest(starts, ends, blocked)
    if alt: return alt[1], {"alt": True, "blocked": False, "free_km": free[0], "alt_km": alt[0]}
    return free[1], {"alt": False, "blocked": True}

def _sea_access_nodes(country):
    """گره‌های دریایی که بندر کشور از طریق مسیرهای تعریف‌شدهٔ بازی به آن‌ها وصل است (برای جلوگیری از خط مستقیم روی خشکی)."""
    cache = _SEA_CACHE.setdefault("access", {})
    if country in cache: return cache[country]
    out = []
    for (a, b), lane in COUNTRY_SEA_LANES.items():
        if not lane: continue
        if a == country and lane[0] not in out: out.append(lane[0])
        if b == country and lane[-1] not in out: out.append(lane[-1])
    cache[country] = out
    return out

def _sea_start_nodes(a_xy, src, k=3):
    g = _sea_graph(); nodes, xy, idx = g["nodes"], g["xy"], g["idx"]
    if src in idx: return {src: 0.0}
    return {nodes[i]: _great_circle_km(a_xy, xy[nodes[i]])
            for i in sorted(range(len(nodes)), key=lambda i: _great_circle_km(a_xy, xy[nodes[i]]))[:k]}

def sea_route_between(a_xy, b_xy, skip=(), traveler=None, info=None):
    """کوتاه‌ترین مسیر دریایی بین دو نقطه؛ لیست شناسهٔ گذرگاه‌ها/تنگه‌هایی که باید از آن‌ها گذشت.
    تنگهٔ بسته برای traveler تا جای ممکن دور زده می‌شود (info برای گزارش alt/blocked پر می‌شود)."""
    g = _sea_graph(); nodes, xy = g["nodes"], g["xy"]
    if not a_xy or not b_xy or _great_circle_km(a_xy, b_xy) < 150: return []
    near = lambda p: {nodes[i]: _great_circle_km(p, xy[nodes[i]])
                      for i in sorted(range(len(nodes)), key=lambda i: _great_circle_km(p, xy[nodes[i]]))[:3]}
    path, meta = _sea_choose(near(a_xy), near(b_xy), traveler)
    if info is not None: info.update(meta)
    return [n for n in path if n not in skip]

def sea_route_to_node(a_xy, gateway, traveler=None, info=None, src=None):
    """کوتاه‌ترین مسیر گراف از نقطهٔ a تا یک گرهٔ مشخص (دروازهٔ اجباری)؛ لیست گره‌ها شامل خود دروازه."""
    g = _sea_graph()
    if not a_xy or gateway not in g["idx"]: return []
    path, meta = _sea_choose(_sea_start_nodes(a_xy, src), {gateway: 0.0}, traveler)
    if info is not None: info.update(meta)
    return path

def _sea_loc_xy(cid, loc):
    """نقطهٔ دریایی یک موضع: خانه برای ناوها بندر کشور است."""
    if loc == "home": return COUNTRY_PORT_COORDS.get(cid) or loc_coords(cid, loc)
    return loc_coords(cid, loc)

def _sea_geometry(cid, src, dst, target_country=None, traveler=None):
    """مسیر واقعی دریایی و طول آن (کیلومتر)، بدون محاسبهٔ زمان.
    مرحلهٔ ۴: همیشه کوتاه‌ترین مسیر گراف دریایی؛ اگر تنگهٔ بسته (برای traveler، پیش‌فرض cid) روی آن باشد
    نزدیک‌ترین مسیر جایگزین انتخاب می‌شود و فقط اگر جایگزینی نبود همان مسیر کوتاه می‌ماند (info: alt/blocked)."""
    if target_country is None and isinstance(dst, str) and dst.startswith("country:"):
        target_country = dst.split(":", 1)[1]
    traveler = traveler or cid
    a = _sea_loc_xy(cid, src)
    b = (COUNTRY_PORT_COORDS.get(target_country) or loc_coords(cid, dst)) if target_country else _sea_loc_xy(cid, dst)
    if not a or not b: return None
    info = {"alt": False, "blocked": False}
    g = _sea_graph()
    if target_country:
        nodes = []
        if cid != target_country:
            ends = {n: _great_circle_km(_sea_node_xy(n), b) for n in _sea_access_nodes(target_country) if n in g["idx"]}
            starts = ({n: _great_circle_km(a, _sea_node_xy(n)) for n in _sea_access_nodes(cid) if n in g["idx"]}
                      if src == "home" else _sea_start_nodes(a, src))
            if starts and ends:
                nodes, info = _sea_choose(starts, ends, traveler)
        if not nodes: nodes = sea_route_between(a, b, skip={src, dst}, traveler=traveler, info=info)
    elif dst in SITE_SEA_GATEWAY and SITE_SEA_GATEWAY[dst] in g["idx"]:
        nodes = sea_route_to_node(a, SITE_SEA_GATEWAY[dst], traveler=traveler, info=info, src=src)
    else:
        nodes = sea_route_between(a, b, skip={src, dst}, traveler=traveler, info=info)
    clean = []
    for n in nodes:
        if n in (src, dst) or not _sea_node_xy(n): continue
        if clean and clean[-1] == n: continue
        clean.append(n)
    points = [list(a)] + [list(_sea_node_xy(n)) for n in clean] + [list(b)]
    legs = [_great_circle_km(points[i], points[i + 1]) for i in range(len(points) - 1)]
    km = sum(legs)
    return {"nodes": clean, "points": points, "leg_km": legs, "km": km,
            "straits": [n for n in clean if n in STRAITS_DATA],
            "alt_route": bool(info.get("alt")), "via_closed": bool(info.get("blocked"))}

def plan_sea_voyage(cid, src, dst, target_country=None, traveler=None):
    """مسیر واقعی دریایی، طول آن (کیلومتر) و زمان حرکت را برمی‌گرداند؛ همهٔ مأموریت‌های دریایی از همین‌جا زمان می‌گیرند."""
    geo = _sea_geometry(cid, src, dst, target_country, traveler)
    if not geo: return None
    geo["seconds"] = sea_travel_seconds(geo["km"])
    return geo

def _leg_share(cid, current, next_dst, remaining, final_dst):
    """سهم مرحلهٔ بعدی از کل مسیر باقی‌مانده (بر اساس طول)."""
    seq = [current, next_dst] + list(remaining or []) + ([final_dst] if final_dst else [])
    pts = [_sea_loc_xy(cid, x) for x in seq]
    if any(p is None for p in pts): return 1.0 / (len(remaining or []) + 1)
    segs = [_great_circle_km(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    total = sum(segs)
    return (segs[0] / total) if total > 1e-6 else 1.0 / len(segs)

def _remaining_sea_km(cid, from_xy, next_dst, remaining, final_dst):
    seq = [next_dst] + list(remaining or []) + ([final_dst] if final_dst else [])
    pts = [from_xy] + [_sea_loc_xy(cid, x) for x in seq]
    if any(p is None for p in pts): return 0.0
    return sum(_great_circle_km(pts[i], pts[i + 1]) for i in range(len(pts) - 1))

def travel_minutes(cid, a, b, units=None):
    if has_naval_units(units or {}):
        plan = plan_sea_voyage(cid, a, b)
        if plan: return plan["seconds"] / 60.0
    if a == "home" and has_naval_units(units or {}):
        ca = COUNTRY_PORT_COORDS.get(cid, TRADE_COUNTRY_COORDS.get(cid))
    else:
        ca = loc_coords(cid, a)
    if b == "home" and has_naval_units(units or {}):
        cb = COUNTRY_PORT_COORDS.get(cid, TRADE_COUNTRY_COORDS.get(cid))
    else:
        cb = loc_coords(cid, b)
    if not ca or not cb: return TRAVEL_MIN_MINUTES
    km = _great_circle_km(ca, cb)
    seconds = travel_seconds_for_km(km)
    return max(TRAVEL_MIN_MINUTES, min(TRAVEL_MAX_MINUTES, seconds / 60.0))

def _great_circle_km(a, b):
    if not a or not b: return float("inf")
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * math.asin(min(1.0, math.sqrt(max(0.0, h))))

def has_naval_units(units):
    return any(n > 0 and ARMY_UNITS.get(k, {}).get("group") == "naval" for k, n in (units or {}).items())

def _country_route_straits(src_country, dst_country, traveler):
    """Return a sea-lane ordered from the origin country toward the destination port."""
    if not src_country or not dst_country or src_country == dst_country:
        return []
    route = COUNTRY_SEA_LANES.get((src_country, dst_country))
    if route is not None:
        return list(route)
    route = COUNTRY_SEA_LANES.get((dst_country, src_country))
    if route is not None:
        return list(reversed(route))
    return _country_route_straits_fallback(src_country, dst_country, traveler)

def _country_route_straits_fallback(src_country, dst_country, traveler):
    options = SEA_ROUTE_HINTS.get(frozenset((src_country, dst_country))) if "SEA_ROUTE_HINTS" in globals() else None
    if not options: return []
    candidates = []
    for route in options:
        route = list(route or [])
        if all(s in STRAITS_DATA or s in NAVAL_WAYPOINTS for s in route):
            blocked = any(s in STRAITS_DATA and site_owner(s) and site_owner(s) != traveler and strait_policy(s, traveler).get("closed") for s in route)
            candidates.append((blocked, not bool(route), len(route), route))
    candidates.sort(key=lambda row: (row[0], row[1], row[2]))
    return candidates[0][3] if candidates else []

def _strait_bare(sid):
    """نام تنگه بدون پیشوند «تنگه» (برای جمله‌هایی که خودشان «تنگهٔ …» دارند)."""
    n = loc_label(sid)
    return n[len("تنگه "):] if n.startswith("تنگه ") else n

def loc_label(loc):
    if loc == "home": return "خانه"
    if loc == "mid": return "میانهٔ راه"
    m = site_meta(loc); return m["name"] if m else "—"

def announce(kind, title, text, countries=()):
    """اعلان همزمان در اخبار جنگ و اعلان‌ها/اخبار عمومی (بدون ذکر تعداد نیرو)."""
    push_war(kind, text, list(countries)); push_news(title, text, countries=list(countries))

def _world_tag():
    """وقتی بیش از یک دنیا وجود دارد، نام دنیا ابتدای پیام‌های تلگرام می‌آید تا دنیاها قاطی نشوند."""
    try:
        if len(worlds_registry) > 1:
            return f"🌍 {_world_meta().get('name', f'دنیای {active_world_id}')}\n"
    except Exception:
        pass
    return ""

def notify_country(cid, text):
    """پیام خصوصی تلگرام به بازیکنِ آن کشور (علاوه بر اعلان‌های درون بازی)."""
    uid_, _ = get_player_by_country(cid)
    if not uid_: return
    text = _world_tag() + str(text)
    async def _send():
        try: await bot.send_message(uid_, text)
        except Exception as e: logging.warning("notify failed: %s", e)
    try: asyncio.get_running_loop().create_task(_send())
    except RuntimeError: pass

def _add_units(dest, sent):
    for k, n in sent.items(): dest[k] = dest.get(k, 0) + n

def start_transit(cid, src, dst, units, minutes, kind="go", dst_free=False, origin=None,
                  passage=False, route_final_dst=None, route_remaining_straits=None, route_total_arrive=None,
                  full_path=None, leg=0, trip_start=None):
    now = utcnow()
    t = {"id": str(uuid.uuid4()), "owner": cid, "from": src, "to": dst, "units": dict(units), "kind": kind,
         "dst_free": dst_free, "origin": origin or src, "passage": bool(passage),
         "route_final_dst": route_final_dst,
         "route_remaining_straits": list(route_remaining_straits or []),
         "from_ll": (COUNTRY_PORT_COORDS.get(cid, loc_coords(cid, src)) if src == "home" and has_naval_units(units) else loc_coords(cid, src)), "to_ll": (COUNTRY_PORT_COORDS.get(cid, loc_coords(cid, dst)) if dst == "home" and has_naval_units(units) else loc_coords(cid, dst)),
         "route_total_arrive": route_total_arrive, "trip_start": trip_start or now.isoformat(),
         "full_path": [list(p) for p in full_path] if full_path else None, "leg": int(leg or 0),
         "start": now.isoformat(), "arrive": (now + timedelta(minutes=max(0.0, float(minutes)))).isoformat()}
    transits.append(t); return t

def divert_transits(site_id, new_owner):
    """کسی موضع آزاد را گرفت: نیروهای دیگرانی که به آن می‌رفتند از میانهٔ راه برمی‌گردند."""
    now = utcnow()
    for t in list(transits):
        if t["to"] != site_id or t["kind"] != "go" or not t.get("dst_free") or t["owner"] == new_owner: continue
        # ناوگانی که فقط از این تنگه عبور می‌کند (مقصدش جای دیگری است) برنمی‌گردد؛
        # وقتی به تنگه رسید طبق وضعیت همان لحظه عمل می‌کند: تنگهٔ بسته = نبرد، تنگهٔ باز = پرداخت عوارض و عبور.
        if t.get("passage"): continue
        _turn_back(t, now, f"{cname(new_owner)} {loc_label(site_id)} را گرفت")

def _turn_back(t, now, reason=None):
    """نیرو از همان نقطهٔ میانهٔ راه برمی‌گردد؛ زمان بازگشت = زمانی که تا اینجا رفته است."""
    st, ar = parse_dt(t["start"]), parse_dt(t["arrive"])
    elapsed = max(0.0, (now - st).total_seconds() / 60) if st else 0.0
    cid = t["owner"]; dst_name = loc_label(t["to"])
    total = (ar - st).total_seconds() / 60 if (st and ar) else 0
    fr = t.get("from_ll") or loc_coords(cid, t["from"]); to = t.get("to_ll") or loc_coords(cid, t["to"])
    here = geo_interp(fr, to, min(1.0, elapsed / total)) if (fr and to and total > 0) else fr
    t["from_ll"] = here; t["to_ll"] = (COUNTRY_PORT_COORDS.get(cid, loc_coords(cid, t["origin"])) if t["origin"] == "home" and has_naval_units(t.get("units", {})) else loc_coords(cid, t["origin"]))
    t["kind"] = "back"; t["to"] = t["origin"]; t["from"] = "mid"; t["dst_free"] = False
    fp = t.get("full_path"); lg = int(t.get("leg") or 0)
    t["full_path"] = None; t["leg"] = 0; t["passage"] = False; t["whole_path"] = False
    t["start"] = now.isoformat(); t["arrive"] = (now + timedelta(minutes=elapsed)).isoformat()
    if fp and len(fp) > 2 and has_naval_units(t.get("units", {})) and 0 <= lg < len(fp) - 1:
        # مرحلهٔ ۵: بازگشت دریایی از همان مسیر دریایی که آمده (نه خط مستقیم روی خشکی)؛ زمان = طول واقعی مسیر برگشت.
        back = [list(here)] + [list(x) for x in reversed(fp[:lg + 1])]
        km = sum(_great_circle_km(back[i], back[i + 1]) for i in range(len(back) - 1))
        t["full_path"] = back; t["whole_path"] = True; t["to_ll"] = list(back[-1])
        t["arrive"] = (now + timedelta(seconds=max(1.0, km * sea_seconds_per_km()))).isoformat()
    back_name = loc_label(t["to"])
    announce("turnback", "بازگشت نیرو از میانهٔ راه",
             f"{cname(cid)} نیروهای خود را که به {dst_name} می‌رفتند از میانهٔ راه به {back_name} بازگرداند"
             + (f"؛ دلیل: {reason}." if reason else "."), [cid])

def _continue_strait_passage(t, units):
    """Continue the same expedition after passing/capturing a checkpoint strait."""
    cid = t["owner"]
    current = t["to"]
    final_dst = t.get("route_final_dst")
    if not final_dst:
        return
    remaining = list(t.get("route_remaining_straits") or [])
    if remaining:
        next_dst = remaining.pop(0)
        passage = True
    else:
        next_dst = final_dst
        passage = False
    total_end = parse_dt(t.get("route_total_arrive"))
    if total_end and total_end > utcnow():
        remaining_seconds = max(1.0, (total_end - utcnow()).total_seconds())
        minutes = (remaining_seconds * _leg_share(cid, current, next_dst, remaining, final_dst)) / 60.0
    else:
        km_left = _remaining_sea_km(cid, _sea_loc_xy(cid, current), next_dst, remaining, final_dst)
        minutes = max(1.0 / 60.0, km_left * sea_seconds_per_km() * _leg_share(cid, current, next_dst, remaining, final_dst) / 60.0)
        total_end = utcnow() + timedelta(minutes=(km_left * sea_seconds_per_km()) / 60.0)
    next_owner = site_owner(next_dst) if next_dst != "home" else None
    start_transit(cid, current, next_dst, units, minutes, "go",
                  dst_free=(next_dst != "home" and not next_owner), origin=t.get("origin") or t.get("from"),
                  passage=passage, route_final_dst=final_dst if passage else None,
                  route_remaining_straits=remaining if passage else None, route_total_arrive=total_end.isoformat(),
                  full_path=t.get("full_path"), leg=int(t.get("leg") or 0) + 1, trip_start=t.get("trip_start") or t.get("start"))

def _resolve_strait_passage(t, player):
    cid, units, sid = t["owner"], dict(t["units"]), t["to"]
    owner = site_owner(sid)
    policy = strait_policy(sid, cid)
    origin = t.get("origin") or t.get("from")

    # A closed hostile strait is a combat checkpoint. A defeated fleet is lost;
    # a victor captures the strait and continues toward the original destination.
    if owner and owner != cid and policy["closed"]:
        if have_treaty(cid, owner, "non_aggression"):
            start_transit(cid, sid, origin, units, travel_minutes(cid, sid, origin, units), "back", origin=origin)
            msg = f"عبور {cname(cid)} از {loc_label(sid)} به‌دلیل پیمان عدم تجاوز با {cname(owner)} متوقف شد؛ نیروها بازمی‌گردند."
            announce("turnback", "عبور از تنگه متوقف شد", msg, [cid, owner])
            notify_country(cid, "⛔ عبور از تنگه به‌دلیل پیمان عدم تجاوز ممکن نبود؛ نیروها بازمی‌گردند.")
            return
        _, defender = get_player_by_country(owner)
        guards = garrison(sid)
        duration = int(t.pop("_site_duration", 0) or 0)
        a_name, d_name, site_name = cname(cid), cname(owner), loc_label(sid)
        f = _site_fight(units, player, guards, defender, defeat_loss=1.0)
        if f["attacker_wins"]:
            old_owner = owner
            set_site_owner(sid, cid)
            site_forces.pop(sid, None)
            result_line = f"{a_name} از تنگهٔ بستهٔ {_strait_bare(sid)} عبور کرد و آن را از {d_name} گرفت."
            _site_battle_report(cid, old_owner, f, duration, result_line, result_line, "تصرف تنگه در نبرد",
                                "capture", "strait", f"نبرد عبور از {site_name}")
            if f["survivors"]:
                _continue_strait_passage(t, f["survivors"])
        else:
            guards.clear(); guards.update(f["garrison_after"])
            result_line = f"{d_name} عبور {a_name} از تنگهٔ بستهٔ {_strait_bare(sid)} را دفع کرد؛ تنگه بسته ماند."
            _site_battle_report(cid, owner, f, duration, result_line, result_line, "دفاع از تنگه",
                                "repel", "strait", f"دفاع از {site_name}")
        return

    # Open passage: collect a fixed toll once, credit the strait owner, then continue.
    if owner and owner != cid:
        toll = max(0, int(policy.get("toll", 0)))
        if toll and player.get("money", 0) < toll:
            start_transit(cid, sid, origin, units, travel_minutes(cid, sid, origin, units), "back", origin=origin)
            msg = f"عبور {cname(cid)} از {loc_label(sid)} به‌دلیل کمبود خزانه برای عوارض {toll:,}$ متوقف شد؛ نیروها بازمی‌گردند."
            announce("turnback", "عبور از تنگه متوقف شد", msg, [cid, owner])
            notify_country(cid, f"⛔ خزانه برای عوارض {loc_label(sid)} کافی نبود؛ نیروها بازمی‌گردند.")
            return
        if toll:
            player["money"] = player.get("money", 0) - toll
            _, owner_player = get_player_by_country(owner)
            if owner_player:
                owner_player["money"] = owner_player.get("money", 0) + toll
            push_news("پرداخت عوارض تنگه", f"{cname(cid)} برای عبور از {loc_label(sid)} مبلغ {toll:,}$ به {cname(owner)} پرداخت کرد.")
    _continue_strait_passage(t, units)

def _unit_group_subset(units, group):
    return {k: int(n) for k, n in (units or {}).items() if int(n or 0) > 0 and ARMY_UNITS.get(k, {}).get("group") == group}


# ---------------- نبرد زمان‌دار روی سکو / معدن / تنگه ----------------
SITE_BATTLE_MIN_SECONDS = 10
SITE_BATTLE_MAX_SECONDS = 300

def _fmt_duration(sec):
    sec = max(0, int(sec or 0))
    m, r = divmod(sec, 60)
    if m and r: return f"{m} دقیقه و {r} ثانیه"
    if m: return f"{m} دقیقه"
    return f"{r} ثانیه"

def _site_battle_seconds(attack_units, defend_units):
    """مدت نبرد از ۱۰ ثانیه تا ۵ دقیقه، متناسب با مجموع نیروهای دو طرف (مقیاس لگاریتمی)."""
    total = max(1, units_count(attack_units or {}) + units_count(defend_units or {}))
    lo, hi = 1.0, math.log10(20000)          # ≤۱۰ یگان → ۱۰ ثانیه ؛ ≥۲۰٬۰۰۰ یگان → ۵ دقیقه
    frac = max(0.0, min(1.0, (math.log10(total) - lo) / (hi - lo)))
    sec = SITE_BATTLE_MIN_SECONDS + frac * (SITE_BATTLE_MAX_SECONDS - SITE_BATTLE_MIN_SECONDS)
    sec *= random.uniform(0.93, 1.07)
    return int(max(SITE_BATTLE_MIN_SECONDS, min(SITE_BATTLE_MAX_SECONDS, round(sec))))

def _apply_loss(units, fraction):
    """تلفات نسبی؛ اگر نیرو حداقل ۲ یگان باشد و تلفاتی محاسبه نشود، دست‌کم ۱ یگان تلف می‌شود (باگ «تلفات صفر»)."""
    units = {k: int(n) for k, n in (units or {}).items() if int(n or 0) > 0}
    total = sum(units.values())
    fraction = max(0.0, min(1.0, fraction))
    surv = {}
    for k, n in units.items():
        lost = n if fraction >= 1 else int(round(n * fraction))
        if n - lost > 0: surv[k] = n - lost
    lost_total = total - sum(surv.values())
    if lost_total == 0 and fraction > 0 and total >= 2:
        k = max(surv, key=surv.get)
        surv[k] -= 1
        if surv[k] <= 0: del surv[k]
        lost_total = 1
    return surv, lost_total

def _site_fight(units, atk_player, gar, def_player, defeat_loss=0.70, win_loss=0.20, repel_garrison_loss=0.20):
    units = {k: int(n) for k, n in (units or {}).items() if int(n or 0) > 0}
    gar_c = {k: int(n) for k, n in (gar or {}).items() if int(n or 0) > 0}
    a_before, d_before = units_count(units), units_count(gar_c)
    empty = d_before == 0
    atk = units_power(units, atk_player, "attack") * (1 + random.uniform(-0.08, 0.08))
    dfn = units_power(gar_c, def_player, "defense") * 1.10 * (1 + random.uniform(-0.08, 0.08))
    tie = (not empty) and math.isclose(units_power(units, atk_player), units_power(gar_c, def_player), rel_tol=1e-9, abs_tol=1e-9)
    wins = empty or ((random.random() < 0.5) if tie else (atk > dfn))
    if wins:
        survivors = dict(units) if empty else _apply_loss(units, win_loss)[0]
        gar_after = {}
    else:
        survivors = _apply_loss(units, defeat_loss)[0]
        gar_after = _apply_loss(gar_c, repel_garrison_loss)[0]
    return {"attacker_wins": wins, "empty": empty, "atk_power": atk, "def_power": dfn,
            "survivors": survivors, "garrison_after": gar_after,
            "attacker_lost": a_before - units_count(survivors),
            "defender_lost": d_before - units_count(gar_after)}

def _site_battle_report(cid, owner, f, duration, result_line, public_msg, news_title, war_kind, hist_kind, hist_title):
    """یک پیام برای هر دو بازیکن: نتیجه + مدت + تلفات دو طرف (بدون تعداد باقی‌مانده)؛ اخبار عمومی بدون هیچ عددی."""
    a_name, d_name = cname(cid), cname(owner)
    won = f["attacker_wins"]
    push_war(war_kind, public_msg, [cid, owner])
    push_news(news_title, public_msg, countries=[cid, owner])
    push_history(hist_kind, hist_title, cid, owner, "attacker" if won else "defender",
                 f"مدت نبرد {_fmt_duration(duration)}؛ تلفات مهاجم {f['attacker_lost']}؛ تلفات مدافع {f['defender_lost']}")
    lines = [result_line]
    if duration: lines.append(f"⏱ مدت نبرد: {_fmt_duration(duration)}")
    lines.append(f"تلفات {a_name}: {f['attacker_lost']:,} یگان | تلفات {d_name}: {f['defender_lost']:,} یگان")
    if f["empty"]: lines.append("ℹ️ مدافعی در این موضع مستقر نبود.")
    body = "\n".join(lines)
    notify_country(cid, ("✅ " if won else "❌ ") + body)
    notify_country(owner, ("⚠️ " if won else "🛡️ ") + body)

def _site_battle_needed(t):
    if t.get("kind") != "go" or t.get("arrival_battle") or t.get("route_battle"): return False
    dst = t.get("to"); cid = t.get("owner")
    if not isinstance(dst, str) or dst in ("home", "mid") or dst.startswith(("country:", "sea:", "port:", "front:")): return False
    if dst in NAVAL_WAYPOINTS or not site_meta(dst): return False
    owner = site_owner(dst)
    if not owner or owner == cid or have_treaty(cid, owner, "non_aggression"): return False
    if t.get("passage"):
        return dst in STRAITS_DATA and bool(strait_policy(dst, cid).get("closed"))
    return True

def _start_site_battle(t, now):
    cid = t["owner"]; dst = t["to"]; owner = site_owner(dst)
    seconds = _site_battle_seconds(t.get("units") or {}, garrison(dst))
    pos = loc_coords(cid, dst) or t.get("to_ll") or (0, 0)
    t["arrival_battle"] = {"phase": "site", "site": dst, "started_at": now.isoformat(),
                           "ends_at": (now + timedelta(seconds=seconds)).isoformat(),
                           "position": list(pos), "duration": seconds}
    t["from_ll"] = list(pos); t["to_ll"] = list(pos); t["from"] = "mid"
    t["start"] = now.isoformat(); t["arrive"] = t["arrival_battle"]["ends_at"]
    site_name = loc_label(dst)
    public = f"⚔️ نبرد بر سر {site_name} میان {cname(cid)} و {cname(owner)} آغاز شد."
    announce("site_battle_started", f"آغاز نبرد در {site_name}", public, [cid, owner])
    private = f"{public}\n⏱ مدت نبرد حدود {_fmt_duration(seconds)} است؛ نتیجه همراه با تلفات اعلام می‌شود."
    notify_country(cid, private); notify_country(owner, private)

def _battle_label(t):
    if (t.get("arrival_battle") or {}).get("phase") == "site":
        return "⚔️ نبرد", loc_label(t.get("to"))
    return "⚔️ نبرد در مسیر", "درگیری"

def _start_ground_march(t, cid, target, ground, now):
    """After winning the port fight, unload ground troops and move them from the port to the capital."""
    ground = {k: int(n) for k, n in (ground or {}).items() if int(n or 0) > 0}
    if not ground:
        return False
    port_id = f"port:{target}:{cid}"
    front_id = f"front:{target}:{cid}"
    port_xy = COUNTRY_PORT_COORDS.get(target, loc_coords(cid, port_id))
    capital_xy = TRADE_COUNTRY_COORDS.get(target)
    seconds = max(TRAVEL_MIN_SECONDS, min(TRAVEL_MAX_SECONDS,
        int(math.ceil(travel_minutes(cid, port_id, front_id, ground) * 60))))
    t["units"] = ground
    t["invasion_target"] = target
    t["from"] = port_id
    t["to"] = front_id
    t["from_ll"] = list(port_xy or (0, 0))
    t["to_ll"] = list(capital_xy or (0, 0))
    t["start"] = now.isoformat()
    t["arrive"] = (now + timedelta(seconds=seconds)).isoformat()
    t["ground_march"] = True
    t.pop("arrival_battle", None)
    t.pop("route_battle", None)
    is_colony = target in occupied_countries and occupied_countries.get(target) != target
    target_label = f"مستعمرهٔ {cname(target)}" if is_colony else cname(target)
    defender_country = occupied_countries.get(target, target)
    msg = f"⚓ بندر {target_label} پس از نبرد دریایی در اختیار ناوگان {cname(cid)} قرار گرفت. کشتی‌های باقی‌مانده در بندر می‌مانند؛ {units_count(ground):,} نیروی زمینی با ناو ترابری از بندر به سمت مرکز {target_label} حرکت کرد و حدود {seconds} ثانیه دیگر به آن می‌رسد."
    announce("ground_march_started", f"حرکت زمینی از بندر {target_label}", msg, [cid, target, defender_country])
    notify_country(cid, msg); notify_country(defender_country, msg)
    return True


def _start_ground_battle(t, now):
    """Start the timed land battle once transported units have reached the capital/front."""
    cid = t.get("owner"); target = t.get("invasion_target")
    if not cid or not target or target not in COUNTRIES:
        return
    seconds = random.randint(30, 60)
    pos = TRADE_COUNTRY_COORDS.get(target) or loc_coords(target, "home") or (0, 0)
    t["ground_march"] = False
    t["arrival_battle"] = {"phase": "land", "started_at": now.isoformat(),
                           "ends_at": (now + timedelta(seconds=seconds)).isoformat(),
                           "position": list(pos), "duration": seconds}
    t["from"] = "mid"
    t["from_ll"] = list(pos); t["to_ll"] = list(pos)
    t["start"] = now.isoformat(); t["arrive"] = t["arrival_battle"]["ends_at"]
    is_colony = target in occupied_countries and occupied_countries.get(target) != target
    target_label = f"مستعمرهٔ {cname(target)}" if is_colony else f"پایتخت {cname(target)}"
    defender_country = occupied_countries.get(target, target)
    msg = f"🪖 نیروهای زمینی {cname(cid)} به {target_label} رسیدند؛ نبرد زمینی آغاز شد. نتیجه در ۳۰ تا ۶۰ ثانیهٔ آینده همراه با تلفات و مدت نبرد اعلام می‌شود."
    announce("land_battle_started", f"آغاز نبرد زمینی در {target_label}", msg, [cid, target, defender_country])
    notify_country(cid, msg); notify_country(defender_country, msg)


def _defense_garrison_units(player, groups, colony=False):
    """Pick defending unit counts. A colony receives one quarter of the occupier's matching home forces."""
    out = {}
    units = player.get("units", {})
    groups = set(groups)
    for unit_id, unit in ARMY_UNITS.items():
        if unit.get("group") not in groups:
            continue
        count = max(0, int(units.get(unit_id, 0) or 0))
        if not count:
            continue
        out[unit_id] = max(1, (count + 3) // 4) if colony else count
    if colony and "naval" in groups and out.get("aircraft_carrier", 0) > 0:
        for unit_id, unit in ARMY_UNITS.items():
            if unit.get("group") == "air":
                count = max(0, int(units.get(unit_id, 0) or 0))
                if count:
                    out[unit_id] = max(1, (count + 3) // 4)
    return out


def _apply_defender_losses(player, engaged_units, surviving_fraction):
    """Apply losses only to the engaged slice; do not erase the rest of the occupier's army."""
    total_lost = 0
    for unit_id, engaged in (engaged_units or {}).items():
        current = max(0, int(player.get("units", {}).get(unit_id, 0) or 0))
        engaged = min(current, max(0, int(engaged or 0)))
        survivors = int(engaged * max(0.0, min(1.0, surviving_fraction)))
        lost = max(0, engaged - survivors)
        player["units"][unit_id] = max(0, current - lost)
        total_lost += lost
    return total_lost


def resolve_ground_arrival_battle(t):
    cid = t.get("owner"); target = t.get("invasion_target")
    _, attacker = get_player_by_country(cid)
    defender_country = occupied_countries.get(target, target)
    _, defender = get_player_by_country(defender_country)
    if not attacker or not defender:
        return
    is_colony = defender_country != target
    force = _unit_group_subset(t.get("units") or {}, "land")
    defender_ground = _defense_garrison_units(defender, {"land"}, colony=is_colony)
    duration = int((t.get("arrival_battle") or {}).get("duration", 30))
    atk = units_power(force, attacker, "attack") * random.uniform(0.92, 1.08)
    dfn = units_power(defender_ground, defender, "defense") * 1.10 * random.uniform(0.92, 1.08)
    front_id = f"front:{target}:{cid}"
    target_label = f"مستعمرهٔ {cname(target)}" if is_colony else f"پایتخت {cname(target)}"

    if not defender_ground or atk > dfn:
        force_before = units_count(force)
        defender_before = units_count(defender_ground)
        survivors = {k: max(1, int(n * 0.65)) for k, n in force.items() if n > 0}
        if is_colony:
            defender_lost = _apply_defender_losses(defender, defender_ground, 0.25)
            defender_after = max(0, defender_before - defender_lost)
        else:
            for k, n in defender_ground.items():
                defender["units"][k] = max(0, int(n * 0.25))
            defender_after = units_count(_unit_group_subset(defender.get("units", {}), "land"))
        previous = site_forces.get(front_id, {}).get("units", {})
        _add_units(previous, survivors)
        site_forces[front_id] = {"owner": cid, "units": previous}
        result = (f"🏆 نبرد زمینی در {target_label} پس از {duration} ثانیه به پیروزی {cname(cid)} رسید؛ "
                  f"مهاجم {force_before-units_count(survivors):,} یگان از دست داد و {units_count(survivors):,} باقی ماند؛ "
                  f"مدافع {defender_before-defender_after:,} یگان از دست داد. قدرت حمله {int(atk)} در برابر دفاع {int(dfn)}.")
        winner = "attacker"
        if is_colony:
            occupy_colony(cid, target, defender_country)
        else:
            occupy_country(cid, target)
    else:
        defender_before = units_count(defender_ground)
        force_before = units_count(force)
        if is_colony:
            defender_lost = _apply_defender_losses(defender, defender_ground, 0.85)
            defender_after = max(0, defender_before - defender_lost)
        else:
            for k, n in defender_ground.items():
                defender["units"][k] = max(0, int(n * 0.85))
            defender_after = units_count(_unit_group_subset(defender.get("units", {}), "land"))
        returned = {k: int(n * 0.20) for k, n in force.items() if int(n * 0.20) > 0}
        _add_units(attacker["units"], returned)
        result = (f"🛡️ نبرد زمینی در {target_label} پس از {duration} ثانیه به پیروزی مدافعان رسید؛ "
                  f"مهاجم {force_before-units_count(returned):,} یگان از دست داد و {units_count(returned):,} به خانه بازگشت؛ "
                  f"مدافع {defender_before-defender_after:,} یگان از دست داد. قدرت حمله {int(atk)} در برابر دفاع {int(dfn)}.")
        winner = "defender"
    push_history("invasion", f"نبرد زمینی در {target_label}", cid, target, winner,
                 f"حمله {int(atk)} در برابر دفاع {int(dfn)}؛ مدت {duration} ثانیه")
    announce("invasion_result", f"نتیجهٔ نبرد زمینی در {target_label}", result, [cid, target, defender_country])
    notify_country(cid, result); notify_country(defender_country, result)
    save_state()


def resolve_country_arrival(t, cid, p, target):
    defender_country = occupied_countries.get(target, target)
    _, defender = get_player_by_country(defender_country)
    if not defender or defender_country == cid:
        _add_units(p["units"], t["units"]); return False
    if not _war_between(cid, defender_country):
        _add_units(p["units"], t["units"])
        msg = f"نیروهای {cname(cid)} به بندر {cname(target)} رسیدند اما جنگ فعالی با مالک آن وجود نداشت؛ نیروها بازگشتند."
        announce("turnback", "بازگشت نیرو", msg, [cid, target, defender_country])
        notify_country(cid, msg); notify_country(defender_country, msg); return False
    is_colony = defender_country != target
    force = dict(t.get("units") or {})
    fleet = _unit_group_subset(force, "naval")
    ground = _unit_group_subset(force, "land")
    # هواگردها تنها در ناوگانی همراه هواپیمابر مؤثرند.
    if fleet.get("aircraft_carrier", 0) > 0:
        fleet.update(_unit_group_subset(force, "air"))
    defender_fleet = _defense_garrison_units(defender, {"naval"}, colony=is_colony)
    fleet_atk = units_power(fleet, p, "attack") * random.uniform(0.92, 1.08)
    fleet_def = units_power(defender_fleet, defender, "defense") * 1.10 * random.uniform(0.92, 1.08)
    duration = int((t.get("arrival_battle") or {}).get("duration", 30))
    target_label = f"بندر مستعمرهٔ {cname(target)}" if is_colony else f"بندر {cname(target)}"
    port_won = not defender_fleet or fleet_atk > fleet_def
    if not port_won:
        defender_before = units_count(defender_fleet)
        attacker_lost = units_count(force)
        if is_colony:
            defender_lost = _apply_defender_losses(defender, defender_fleet, 0.85)
            defender_after = max(0, defender_before - defender_lost)
        else:
            for k, n in defender_fleet.items(): defender["units"][k] = max(0, int(n * 0.85))
            defender_after = units_count(_unit_group_subset(defender.get("units", {}), "naval"))
        end_msg = (f"⚓ نبرد {target_label} پس از {duration} ثانیه به پیروزی مدافعان انجامید؛ "
                   f"عملیات آبی‌ـ‌خاکی {cname(cid)} شکست خورد و {attacker_lost:,} یگان مهاجم از دست رفت؛ "
                   f"مدافع {defender_before-defender_after:,} یگان از دست داد.")
        push_history("port", f"نبرد {target_label}", cid, target, "defender", f"حمله {int(fleet_atk)} در برابر دفاع {int(fleet_def)}؛ مدت {duration} ثانیه")
        announce("port_battle_result", f"نتیجهٔ نبرد {target_label}", end_msg, [cid, target, defender_country])
        notify_country(cid, end_msg); notify_country(defender_country, end_msg); save_state(); return False

    fleet_before = units_count(fleet)
    defender_before = units_count(defender_fleet)
    fleet_survivors = {k: max(0, int(n * 0.75)) for k, n in fleet.items() if n > 0}
    if any(fleet_survivors.values()):
        port_id = f"port:{target}:{cid}"
        old = site_forces.get(port_id, {}).get("units", {})
        _add_units(old, {k: n for k, n in fleet_survivors.items() if n > 0})
        site_forces[port_id] = {"owner": cid, "units": old}
    if defender_fleet:
        if is_colony:
            defender_lost = _apply_defender_losses(defender, defender_fleet, 0.35)
            defender_after = max(0, defender_before - defender_lost)
        else:
            for k, n in defender_fleet.items(): defender["units"][k] = max(0, int(n * 0.35))
            defender_after = units_count(_unit_group_subset(defender.get("units", {}), "naval"))
    else:
        defender_after = 0
    port_msg = (f"✅ نبرد دریایی در {target_label} پس از {duration} ثانیه به پیروزی {cname(cid)} رسید؛ "
                f"ناوگان مهاجم {fleet_before-units_count(fleet_survivors):,} یگان از دست داد و {units_count(fleet_survivors):,} باقی ماند؛ "
                f"مدافع {defender_before-defender_after:,} یگان از دست داد؛ کشتی‌های باقی‌ماندهٔ مهاجم در بندر می‌مانند.")
    push_history("port", f"نبرد {target_label}", cid, target, "attacker", f"حمله {int(fleet_atk)} در برابر دفاع {int(fleet_def)}؛ مدت {duration} ثانیه")
    announce("port_battle_result", f"نتیجهٔ نبرد {target_label}", port_msg, [cid, target, defender_country])
    notify_country(cid, port_msg); notify_country(defender_country, port_msg)
    if not any(ground.values()):
        save_state(); return False
    return _start_ground_march(t, cid, target, ground, utcnow())


def resolve_arrival(t):
    cid = t["owner"]; units = t["units"]; dst = t["to"]
    _, p = get_player_by_country(cid)
    if not p: return False
    ensure_player_fields(p)
    if (t.get("arrival_battle") or {}).get("phase") == "land":
        resolve_ground_arrival_battle(t); return False
    if (t.get("arrival_battle") or {}).get("phase") == "site":
        t["_site_duration"] = int(t["arrival_battle"].get("duration") or 0)
        t.pop("arrival_battle", None)
    if isinstance(dst, str) and dst.startswith("country:"):
        return resolve_country_arrival(t, cid, p, dst.split(":", 1)[1])
    if t["kind"] == "back":
        if dst == "home" or site_owner(dst) != cid:
            _add_units(p["units"], units)
        else:
            g = site_forces.get(dst)
            if not g or g.get("owner") != cid: g = site_forces[dst] = {"owner": cid, "units": {}}
            _add_units(g["units"], units)
        return
    if t.get("passage") and dst in NAVAL_WAYPOINTS:
        _continue_strait_passage(t, units)
        return
    if t.get("passage") and dst in STRAITS_DATA:
        _resolve_strait_passage(t, p)
        return
    if dst == "home":
        _add_units(p["units"], units); return
    meta = site_meta(dst); kind = meta["kind"]; owner = site_owner(dst)
    if owner and owner != cid and have_treaty(cid, owner, "non_aggression"):
        _add_units(p["units"], units)
        announce("turnback", "بازگشت نیرو", f"{cname(cid)} نیروهایش را که به {meta['name']} رسیده بودند بازگرداند؛ دلیل: پیمان عدم تجاوز با {cname(owner)}.", [cid, owner]); return
    if owner == cid:
        g = site_forces.get(dst)
        if not g or g.get("owner") != cid: g = site_forces[dst] = {"owner": cid, "units": {}}
        _add_units(g["units"], units)
    elif not owner:
        divert_transits(dst, cid)
        site_forces[dst] = {"owner": cid, "units": dict(units)}; set_site_owner(dst, cid)
        push_war("occupy", f"{cname(cid)} {meta['name']} را گرفت.", [cid])
        push_history(kind, f"حملهٔ {cname(cid)} به {meta['name']}", cid, None, "attacker", "بی‌صاحب بود")
        push_news("تصرف تنگه" if kind == "strait" else "تصرف منبع", f"{cname(cid)} {meta['name']} را تصرف کرد.", countries=[cid])
        notify_country(cid, f"✅ نیروهای شما به {meta['name']} رسیدند و آن را با موفقیت گرفتند.")
    else:
        _, dfd = get_player_by_country(owner)
        gar = garrison(dst)
        duration = int(t.pop("_site_duration", 0) or 0)
        a_name, d_name, site_name = cname(cid), cname(owner), meta["name"]
        site_word = "تنگه" if kind == "strait" else "منبع"
        f = _site_fight(units, p, gar, dfd, defeat_loss=0.70)
        if f["attacker_wins"]:
            site_forces[dst] = {"owner": cid, "units": f["survivors"]}; set_site_owner(dst, cid)
            result_line = f"{site_name} توسط {a_name} از {d_name} گرفته شد."
            _site_battle_report(cid, owner, f, duration, result_line, f"{a_name} {site_name} را از {d_name} تصرف کرد.",
                                "تصرف تنگه" if kind == "strait" else "تصرف منبع", "capture", kind, f"حملهٔ {a_name} به {site_name}")
        else:
            _add_units(p["units"], f["survivors"])
            gar.clear(); gar.update(f["garrison_after"])
            result_line = f"{site_name} گرفته نشد؛ {d_name} حملهٔ {a_name} را دفع کرد."
            _site_battle_report(cid, owner, f, duration, result_line,
                                f"{d_name} حملهٔ {a_name} به {site_name} را دفع کرد؛ {site_name} گرفته نشد.",
                                f"دفع حمله به {site_word}", "repel", kind, f"حملهٔ {a_name} به {site_name}")

def _transit_position(t, now):
    if t.get("route_battle"):
        return tuple(t["route_battle"].get("position") or t.get("from_ll") or (0, 0))
    a, b = t.get("from_ll"), t.get("to_ll")
    if not a or not b: return None
    st, ar = parse_dt(t.get("start")), parse_dt(t.get("arrive"))
    if not st or not ar: return tuple(a)
    span = max(0.001, (ar - st).total_seconds())
    f = max(0.0, min(1.0, (now - st).total_seconds() / span))
    return geo_interp(a, b, f)

def _active_war_pair(a, b):
    # Movement collisions are combat only after negotiation has expired and the war is actually active.
    return bool(a and b and any(not w.get("resolved") and w.get("status") == "battle"
                                and {w.get("attacker"), w.get("defender")} == {a, b}
                                for w in active_wars.values()))

def _start_route_battle(a, b, now, position):
    bid = str(uuid.uuid4())
    seconds = random.randint(30, 60)
    start = now.isoformat(); end = (now + timedelta(seconds=seconds)).isoformat()
    sea_battle = has_naval_units(a.get("units")) and has_naval_units(b.get("units"))
    front = "naval" if sea_battle else "land"
    for t in (a, b):
        resume = {k: t.get(k) for k in ("from", "to", "from_ll", "to_ll", "start", "arrive", "kind", "dst_free", "origin", "passage", "route_final_dst", "route_remaining_straits", "full_path", "leg", "whole_path")}
        t["route_battle"] = {"id": bid, "front": front, "started_at": start, "ends_at": end, "position": list(position), "resume": resume}
        t["from"] = "mid"; t["to"] = "mid"; t["from_ll"] = list(position); t["to_ll"] = list(position)
        t["start"] = start; t["arrive"] = end
    elapsed_msg = (f"⚓ دو ناوگان دشمن در دریا به هم رسیدند؛ نبرد دریایی آغاز شد و حدود {seconds} ثانیه طول می‌کشد. محل برخورد روی نقشه قرمز است."
                   if sea_battle else f"⚔️ دو نیروی دشمن در مسیر به هم رسیدند؛ نبرد آغاز شد و حدود {seconds} ثانیه طول می‌کشد. محل برخورد روی نقشه قرمز است.")
    announce("route_battle_started", "آغاز نبرد دریایی در مسیر" if sea_battle else "آغاز نبرد در مسیر", elapsed_msg, [a["owner"], b["owner"]])
    notify_country(a["owner"], elapsed_msg); notify_country(b["owner"], elapsed_msg)

def _check_transit_encounters(now):
    changed = False
    movers = [t for t in list(transits) if t.get("kind") == "go" and not t.get("route_battle") and not t.get("arrival_battle") and t.get("to") not in ("home", "mid")]
    # Sample the previous second as well as the current moment. This prevents two fast test-speed
    # fleets from crossing between one-second server ticks without ever being observed together.
    sample_times = [now - timedelta(seconds=1) + timedelta(milliseconds=250 * i) for i in range(5)]
    for i, a in enumerate(movers):
        if a not in transits: continue
        for b in movers[i + 1:]:
            if b not in transits or a["owner"] == b["owner"] or not _active_war_pair(a["owner"], b["owner"]): continue
            closest = None
            closest_distance = float("inf")
            for sample_at in sample_times:
                pa, pb = _transit_position(a, sample_at), _transit_position(b, sample_at)
                if not pa or not pb: continue
                distance = _great_circle_km(pa, pb)
                if distance < closest_distance:
                    closest_distance, closest = distance, (pa, pb)
            if closest and closest_distance <= 450:
                pa, pb = closest
                # Dateline-safe midpoint to keep the encounter marker on the correct side of the globe.
                mid_lon = pa[0] + (((pb[0] - pa[0] + 180) % 360) - 180) / 2
                mid_lat = (pa[1] + pb[1]) / 2
                _start_route_battle(a, b, now, (mid_lon, mid_lat))
                changed = True
                break
    return changed

def _finish_route_battle(battle_id, now):
    members = [t for t in list(transits) if t.get("route_battle", {}).get("id") == battle_id]
    if len(members) < 2:
        for t in members: t.pop("route_battle", None)
        return
    a, b = members[0], members[1]
    _, pa = get_player_by_country(a.get("owner")); _, pb = get_player_by_country(b.get("owner"))
    power_a = units_power(a.get("units", {}), pa, "attack") * random.uniform(0.92, 1.08)
    power_b = units_power(b.get("units", {}), pb, "attack") * random.uniform(0.92, 1.08)
    winner, loser, wp = (a, b, power_a) if power_a >= power_b else (b, a, power_b)
    battle_front = winner["route_battle"].get("front", "land")
    pos = tuple(winner["route_battle"].get("position") or winner.get("from_ll") or (0, 0))
    start_dt = parse_dt(winner["route_battle"].get("started_at"))
    elapsed = max(1, int((now - start_dt).total_seconds())) if start_dt else 30
    # Loser loses the expedition. Winner loses 25%, then resumes its original destination from the meeting point.
    winner_before = units_count(winner.get("units", {}))
    loser_before = units_count(loser.get("units", {}))
    winner_units = {k: max(1, int(n * 0.75)) for k, n in winner.get("units", {}).items() if n > 0}
    winner["units"] = {k:n for k,n in winner_units.items() if n > 0}
    loser_country = loser.get("owner"); winner_country = winner.get("owner")
    transits.remove(loser)
    resume = winner["route_battle"].get("resume") or {}
    for key, val in resume.items(): winner[key] = val
    winner.pop("route_battle", None)
    if not winner["units"]:
        if winner in transits: transits.remove(winner)
    else:
        target = winner.get("to")
        end_ll = loc_coords(winner_country, target)
        if not end_ll and winner.get("to_ll"): end_ll = winner["to_ll"]
        if end_ll:
            winner["from"] = "mid"; winner["from_ll"] = list(pos); winner["to_ll"] = list(end_ll)
            winner["start"] = now.isoformat()
            distance = _great_circle_km(pos, end_ll)
            if has_naval_units(winner.get("units")):
                rate = sea_seconds_per_km()
                seconds = max(1.0, distance * rate)
                if winner.get("route_final_dst"):
                    rest_km = 0.0
                    seq = list(winner.get("route_remaining_straits") or []) + [winner.get("route_final_dst")]
                    pts = [tuple(end_ll)] + [_sea_loc_xy(winner_country, x) for x in seq]
                    if all(pts): rest_km = sum(_great_circle_km(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
                    winner["route_total_arrive"] = (now + timedelta(seconds=seconds + rest_km * rate)).isoformat()
            else:
                seconds = travel_seconds_for_km(distance)
            winner["arrive"] = (now + timedelta(seconds=seconds)).isoformat()
    title = "نبرد دریایی در مسیر" if battle_front == "naval" else "نبرد در مسیر"
    final_target = winner.get("route_final_dst") or winner.get("to")
    msg = (f"🏆 {title} پس از {elapsed} ثانیه پایان یافت؛ {cname(winner_country)} پیروز شد. "
           f"نیروی پیروز {winner_before-units_count(winner.get('units', {})):,} یگان از دست داد و {units_count(winner.get('units', {})):,} باقی ماند؛ "
           f"نیروی {cname(loser_country)} تمام {loser_before:,} یگان اعزام‌شده را از دست داد و از مسیر خارج شد. "
           f"نیروی پیروز به‌سمت {loc_label(final_target)} ادامه می‌دهد.")
    push_history("naval_route" if battle_front == "naval" else "route", title, winner_country, loser_country, "attacker", f"قدرت پیروزی {int(wp)}؛ مدت {elapsed} ثانیه")
    announce("route_battle_result", f"نتیجهٔ {title}", msg, [winner_country, loser_country])
    notify_country(winner_country, msg); notify_country(loser_country, msg)
    save_state()

def _start_arrival_battle(t, now):
    cid = t.get("owner"); target = str(t.get("to", "")).split(":", 1)[1]
    defender_country = occupied_countries.get(target, target)
    is_colony = defender_country != target
    target_label = f"مستعمرهٔ {cname(target)}" if is_colony else cname(target)
    seconds = random.randint(30, 60)
    pos = loc_coords(cid, t.get("to"))
    if not pos: pos = loc_coords(target, "home")
    t["arrival_battle"] = {"phase": "port", "started_at": now.isoformat(), "ends_at": (now + timedelta(seconds=seconds)).isoformat(), "position": list(pos or (0, 0)), "duration": seconds}
    t["from_ll"] = list(pos or (0, 0)); t["to_ll"] = list(pos or (0, 0))
    t["from"] = "mid"; t["start"] = now.isoformat(); t["arrive"] = t["arrival_battle"]["ends_at"]
    msg = f"⚓ نیروی {cname(cid)} به بندر {target_label} رسید؛ نبرد بندر آغاز شد و نتیجه بین ۳۰ تا ۶۰ ثانیهٔ آینده اعلام می‌شود."
    announce("port_battle_started", f"آغاز نبرد در بندر {target_label}", msg, [cid, target, defender_country])
    notify_country(cid, msg); notify_country(defender_country, msg)

def process_transits():
    # حرکت و درگیری فقط در بازهٔ فعال بازی مجاز است؛ پیش از شروع و پس از روز ۳۱ منجمد می‌شود.
    meta = _world_meta()
    started = parse_dt(meta.get("game_started_at"))
    now = utcnow()
    if not started or meta.get("game_finished") or now >= started + timedelta(days=GAME_TOTAL_DAYS):
        return
    changed = _check_transit_encounters(now)
    now = utcnow()
    seen_battles = set()
    for t in list(transits):
        rb = t.get("route_battle")
        if rb:
            bid = rb.get("id")
            if bid and bid not in seen_battles:
                seen_battles.add(bid)
                end = parse_dt(rb.get("ends_at"))
                if end and end <= now:
                    _finish_route_battle(bid, now); changed = True
            continue
    # Process newly-created zero-minute strait legs immediately as well.
    for _ in range(100):
        now = utcnow()
        due = []
        for t in list(transits):
            ar = parse_dt(t.get("arrive"))
            if not ar or ar <= now: due.append(t)
        if not due: break
        due.sort(key=lambda t: t.get("arrive", ""))
        for t in due:
            if t not in transits: continue
            ar = parse_dt(t.get("arrive"))
            if ar and ar > now: continue
            if t.get("ground_march"):
                _start_ground_battle(t, now); changed = True
                continue
            if t.get("arrival_battle"):
                ends = parse_dt(t["arrival_battle"].get("ends_at"))
                if ends and ends > now: continue
                try:
                    continuing = bool(resolve_arrival(t))
                except Exception as e:
                    logging.error("resolve_arrival: %s", e); continuing = False
                if not continuing and t in transits: transits.remove(t)
                changed = True
                continue
            if isinstance(t.get("to"), str) and t["to"].startswith("country:") and t.get("kind") == "go":
                _start_arrival_battle(t, now); changed = True
                continue
            if _site_battle_needed(t):
                _start_site_battle(t, now); changed = True
                continue
            transits.remove(t); changed = True
            try: resolve_arrival(t)
            except Exception as e: logging.error("resolve_arrival: %s", e)
    if changed: save_state()

async def transit_loop():
    while True:
        await asyncio.sleep(1)
        try: await _run_transits_for_all_worlds()
        except Exception as e: logging.error("transit tick: %s", e)

def _route_strait_blockers(cid, route_nodes):
    """مرحلهٔ ۳: پیش از حرکت، تنگه‌هایی از مسیر که عبور از آن‌ها طبق قوانین فعلی بازی ممکن نیست را پیدا می‌کند.
    تنگهٔ بستهٔ دشمن بدون پیمان، گذرگاه نبرد است و مجاز می‌ماند؛ ولی با پیمان عدم تجاوز، عبور ممنوع است
    (قبلاً ناوگان تا خود تنگه می‌رفت و بعد برمی‌گشت). خروجی: متن خطا یا None."""
    for sid in route_nodes or []:
        if sid not in STRAITS_DATA: continue
        owner = site_owner(sid)
        if owner and owner != cid and strait_policy(sid, cid).get("closed") and have_treaty(cid, owner, "non_aggression"):
            return f"{loc_label(sid)} بسته است و به‌دلیل پیمان عدم تجاوز با {cname(owner)} نمی‌توانید از آن عبور کنید."
    return None

async def dispatch_forces(request):
    uid = get_auth_user_id(request)
    if not uid: return _bad("unauthorized", 401)
    process_transits()
    data = await read_json(request)
    src = data.get("from"); dst = data.get("to")
    p = _me(uid); cid = p.get("country")
    if not cid or p.get("is_eliminated"): return _bad("کشوری ندارید.")
    if src == dst: return _bad("مبدأ و مقصد یکی است.")
    if dst != "home" and not site_meta(dst): return _bad("مقصد نامعتبر است.")
    if src != "home" and (not site_meta(src) or site_owner(src) != cid): return _bad("این مکان در اختیار شما نیست.")
    target_country = dst.split(":", 1)[1] if isinstance(dst, str) and dst.startswith("country:") else None
    target_owner = occupied_countries.get(target_country, target_country) if target_country else None
    if target_country:
        if target_country == cid or target_owner == cid:
            return _bad("نمی‌توانید به کشور یا مستعمرهٔ خودتان حمله کنید.")
        if target_country not in COUNTRIES:
            return _bad("کشور مقصد معتبر نیست.")
        if not _war_between(cid, target_owner):
            return _bad("برای حمله به کشور اصلی یا مستعمرهٔ آن، ابتدا علیه کشور مالک اعلان جنگ کنید.")
    pool = p["units"] if src == "home" else garrison(src)
    units = {}
    for k, v in (data.get("units") or {}).items():
        try: n = int(v)
        except (TypeError, ValueError): continue
        if k in ARMY_UNITS and n > 0: units[k] = n
    if not units: return _bad("هیچ یگانی انتخاب نشده.")
    for k, n in units.items():
        if pool.get(k, 0) < n: return _bad("تعداد انتخابی بیشتر از موجودی آن مکان است.")
    owner = target_owner if target_country else (site_owner(dst) if dst != "home" else None)
    if owner and owner != cid and have_treaty(cid, owner, "non_aggression"):
        return _bad("با این کشور پیمان عدم تجاوز دارید.")

    if dst != "home":
        combined = dict(units)
        if owner == cid:
            for k, n in garrison(dst).items(): combined[k] = combined.get(k, 0) + n
        zone = "sea" if target_country else site_zone(dst)
        # ناو ترابری بدون محموله نمی‌تواند برای حمله یا تصرف برود.
        sent_ground = units.get("infantry", 0) + units.get("tank", 0)
        if owner != cid and units.get("transport_ship", 0) > 0 and sent_ground < 1:
            return _bad("ناو ترابری بدون محموله نمی‌تواند برای حمله یا تصرف برود؛ حداقل یک پیاده‌نظام یا تانک همراهش بفرست.")
        errs = dispatch_rule_errors(combined, zone, ground=sent_ground)
        if errs: return _bad(errs[0])
        if target_country:
            ground_count = units.get("infantry", 0) + units.get("tank", 0)
            if ground_count and units.get("transport_ship", 0) < 1:
                return _bad("برای فرستادن پیاده‌نظام یا تانک به کشور دشمن، ناو ترابری لازم است.")
            if not has_naval_units(units):
                return _bad("اعزام به کشور دشمن دریایی است؛ ناو جنگی یا ناو ترابری انتخاب کنید.")
        if is_mine(dst) and owner != cid and (units.get("infantry", 0) + units.get("tank", 0)) < 1:
            return _bad("برای تصرف معدن باید ارتش (پیاده‌نظام یا تانک) با ناو ترابری اعزام شود؛ ناو و زیردریایی به‌تنهایی کافی نیست.")
    if src != "home":  # با رفتن این یگان‌ها، نیروهای باقی‌مانده نباید بی‌پشتیبان بمانند
        zs = site_zone(src)
        after = {k: pool.get(k, 0) - units.get(k, 0) for k in pool}
        # نیروی زمینیِ باقی‌مانده بدون ناو ترابری می‌تواند به‌عنوان نگهبان بماند؛ فقط پشتیبانی هواپیماها بررسی می‌شود.
        if not dispatch_rule_errors(pool, zs, ground=0) and dispatch_rule_errors(after, zs, ground=0):
            return _bad("با خروج این یگان‌ها، نیروهای باقی‌مانده در این موضع بدون پشتیبان (ناو ترابری / ناو هواپیمابر / سوخت‌رسان) می‌مانند.")

    naval = has_naval_units(units)
    plan = plan_sea_voyage(cid, src, dst, target_country) if naval else None
    route_straits = list(plan["nodes"]) if plan else []
    toll_due = 0
    for sid in route_straits:
        if sid in NAVAL_WAYPOINTS: continue
        sid_owner = site_owner(sid)
        policy = strait_policy(sid, cid)
        if sid_owner and sid_owner != cid and not policy["closed"]:
            toll_due += max(0, int(policy.get("toll", 0)))
    # تنگهٔ بسته مانع فرستادن نیرو نیست: اگر مسیر دیگری نباشد، نیرو همان مسیر را می‌رود و هنگام رسیدن به تنگه
    # با نگهبانان آن می‌جنگد (_resolve_strait_passage): با پیروزی تنگه را می‌گیرد و به مسیر ادامه می‌دهد؛ با شکست نابود می‌شود.
    blocked_msg = _route_strait_blockers(cid, route_straits)
    if blocked_msg: return _bad(blocked_msg)
    if p.get("money", 0) < toll_due:
        return _bad(f"برای عوارض مسیر دریایی خزانه کافی نیست؛ عوارض موردنیاز {toll_due:,}$ و موجودی شما {p.get('money', 0):,}$ است.")

    for k, n in units.items(): pool[k] -= n
    # ناوها از روی گذرگاه‌ها و تنگه‌های واقعی مسیر دریایی می‌روند؛ هر مرحله به نسبت طولش زمان می‌گیرد.
    first_target = route_straits[0] if route_straits else dst
    passage = bool(route_straits)
    total_minutes = (plan["seconds"] / 60.0) if plan else travel_minutes(cid, src, dst, units)
    if plan and passage and plan["km"] > 1e-6:
        minutes = total_minutes * (plan["leg_km"][0] / plan["km"])
    else:
        minutes = total_minutes
    total_arrive = (utcnow() + timedelta(minutes=total_minutes)).isoformat()
    full_path = plan["points"] if (plan and passage) else None
    start_transit(cid, src, first_target, units, minutes, "go",
                  dst_free=(first_target != "home" and not site_owner(first_target)), origin=src,
                  passage=passage, route_final_dst=dst if passage else None,
                  route_remaining_straits=route_straits[1:] if passage else None,
                  route_total_arrive=total_arrive if passage else None,
                  full_path=full_path, leg=0)
    if dst == "home":
        announce("return", "بازگشت نیرو", f"{cname(cid)} از {loc_label(src)} نیروهایش را به خانه فرستاد.", [cid])
    else:
        target = f"به {loc_label(dst)}" if owner == cid else f"برای {loc_label(dst)}"
        if src == "home":
            announce("send", "اعزام نیرو", f"{cname(cid)} {target} نیرو فرستاد.", [cid] + ([owner] if owner and owner != cid else []))
        else:
            announce("send", "اعزام نیرو", f"{cname(cid)} از {loc_label(src)} نیروهایش را {target} فرستاد.", [cid] + ([owner] if owner and owner != cid else []))
    secs = max(0, int(math.ceil(total_minutes * 60)))
    eta = fmt_duration_fa(secs)
    # هشدار به صاحب موضع (سکو، تنگه، معدن، ماهیگیری): بدون ذکر تعداد و نوع نیرو
    if dst != "home" and not target_country and owner and owner != cid:
        notify_country(owner, f"🚨 هشدار: {cname(cid)} به {loc_label(dst)} نیرو فرستاده است و حدود {eta} دیگر به آنجا می‌رسد.")
    if minutes <= 0:
        process_transits()
    save_state()
    if minutes <= 0:
        msg = "نیروها رسیدند؛ وضعیت عبور و درگیری بررسی شد."
    else:
        msg = f"نیروها به راه افتادند؛ زمان رسیدن: حدود {eta}."
    return web.json_response({"success": True, "outcome": "sent", "message": msg,
                              "eta_seconds": secs, "eta_text": eta,
                              "player": serialize_player(p)})

async def get_map_transits(request):
    """مسیر نیروهای در حال حرکت برای همهٔ بازیکنان (بدون تعداد نیرو)."""
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    process_transits()
    out = []
    for t in transits:
        cid = t["owner"]
        rb = t.get("route_battle")
        resume = (rb or {}).get("resume") or {}
        fr = resume.get("from_ll") if rb else t.get("from_ll")
        to = resume.get("to_ll") if rb else t.get("to_ll")
        fr = fr or loc_coords(cid, t["from"]); to = to or loc_coords(cid, t["to"])
        if not fr or not to: continue
        fp = None if rb else t.get("full_path")
        out.append({"id": t["id"], "country": cid, "from_ll": list(fr), "to_ll": list(to),
                    "path": fp, "leg": int(t.get("leg") or 0), "whole_path": bool(t.get("whole_path")) and not rb,
                    "battle_ll": list((rb or t.get("arrival_battle") or {}).get("position") or []) or None, "kind": t["kind"],
                    "from_name": _battle_label(t)[0] if (t.get("route_battle") or t.get("arrival_battle")) else ("میانهٔ راه" if t["from"] == "mid" else loc_label(t["from"])),
                    "to_name": _battle_label(t)[1] if (t.get("route_battle") or t.get("arrival_battle")) else loc_label(t["to"]),
                    "start": (t.get("route_battle") or t.get("arrival_battle") or {}).get("started_at", t["start"]),
                    "arrive": (t.get("route_battle") or t.get("arrival_battle") or {}).get("ends_at", t["arrive"]),
                    "battle": bool(t.get("route_battle") or t.get("arrival_battle"))})
    return web.json_response({"transits": out, "now": utcnow().isoformat()})

async def recall_forces(request):
    uid = get_auth_user_id(request)
    if not uid: return _bad("unauthorized", 401)
    process_transits()
    data = await read_json(request)
    p = _me(uid); cid = p.get("country")
    t = next((x for x in transits if x["id"] == data.get("id") and x["owner"] == cid), None)
    if not t: return _bad("این نیرو دیگر در راه نیست.")
    if t["kind"] != "go": return _bad("این نیرو در حال بازگشت است.")
    if t.get("route_battle") or t.get("arrival_battle"): return _bad("در زمان نبرد امکان بازگرداندن نیرو وجود ندارد.")
    _turn_back(t, utcnow())
    save_state()
    return web.json_response({"success": True, "message": "نیروها از میانهٔ راه برمی‌گردند.", "player": serialize_player(p)})

async def get_war_log(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    p = _me(uid); cid = p.get("country")
    mine = [h for h in war_history if h.get("attacker") == cid or h.get("defender") == cid]
    wins = sum(1 for h in mine if (h["winner"] == "attacker" and h["attacker"] == cid)
               or (h["winner"] == "defender" and h["defender"] == cid))
    return web.json_response({"events": list(reversed(war_events)), "history": list(reversed(mine)),
                              "stats": {"fights": len(mine), "wins": wins, "losses": len(mine) - wins}})

def active_scans(p):
    now = utcnow(); sa = p.setdefault("scan_active", {})
    for k, exp in list(sa.items()):
        e = parse_dt(exp)
        if not e or e <= now: del sa[k]
    return sa

def site_scan_view(site_id):
    owner = site_owner(site_id)
    if not owner: return {"owner": None, "power": 0}
    op = get_player_by_country(owner)[1]
    return {"owner": owner, "power": int(round(units_power(garrison(site_id), op)))}

def country_scan_view(cid):
    _, tp = get_player_by_country(cid)
    if not tp: return None
    ensure_player_fields(tp); recompute_army(tp); rates = compute_rates(tp)
    home = {k: n for k, n in tp["units"].items() if n > 0}
    locs = [{"id": "home", "name": "خانه", "units": home, "count": sum(home.values())}]
    for sid in site_forces:
        if site_owner(sid) == cid:
            g = {k: n for k, n in garrison(sid).items() if n > 0}
            if g: locs.append({"id": sid, "name": site_meta(sid)["name"], "units": g, "count": sum(g.values())})
    return {"country": cid, "income": int(rates["net_income"]), "power": tp.get("army", 0), "locations": locs}

async def sat_get_scans(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    p = _me(uid); sa = active_scans(p); sites = {}; countries = {}
    for key, exp in sa.items():
        t, _, ident = key.partition(":")
        if t == "s":
            v = site_scan_view(ident); v["expires_at"] = exp; sites[ident] = v
        elif t == "c":
            v = country_scan_view(ident)
            if v: v["expires_at"] = exp; countries[ident] = v
    return web.json_response({"scans": p.get("scans", 0), "satellite_built": get_infra_level(p, "satellite") > 0,
                              "sites": sites, "countries": countries})

async def sat_launch(request):
    uid = get_auth_user_id(request)
    if not uid: return _bad("unauthorized", 401)
    p = _me(uid)
    if get_infra_level(p, "satellite") <= 0: return _bad("ابتدا «ماهواره» را در زیرساخت › استراتژی بسازید.")
    if p.get("money", 0) < SAT_LAUNCH_COST: return _bad("پول کافی نیست.")
    p["money"] -= SAT_LAUNCH_COST; p["scans"] = p.get("scans", 0) + SAT_SCANS
    save_state()
    return web.json_response({"success": True, "message": f"ماهواره پرتاب شد. {SAT_SCANS} اسکن اضافه شد.",
                              "completion_message": done_message("پرتاب ماهواره"), "player": serialize_player(p)})

async def sat_scan_site(request):
    uid = get_auth_user_id(request)
    if not uid: return _bad("unauthorized", 401)
    data = await read_json(request); site_id = data.get("site_id")
    p = _me(uid); cid = p.get("country")
    if get_infra_level(p, "satellite") <= 0: return _bad("ابتدا ماهواره را بسازید.")
    if not site_meta(site_id): return _bad("مکان نامعتبر است.")
    owner = site_owner(site_id)
    if not owner or owner == cid: return _bad("این مکان بی‌صاحب یا مال خودتان است و اسکن نمی‌خواهد.")
    sa = active_scans(p); key = "s:" + site_id
    if key in sa:
        return web.json_response({"success": True, "message": "اسکن این مکان هنوز فعال است.", "player": serialize_player(p)})
    if p.get("scans", 0) < 1: return _bad("اسکن باقی نمانده. ماهواره را دوباره پرتاب کنید.")
    p["scans"] -= 1; sa[key] = (utcnow() + timedelta(hours=SCAN_HOURS)).isoformat()
    save_state()
    return web.json_response({"success": True, "message": "اسکن انجام شد و ۲۴ ساعت زنده است.",
                              "completion_message": done_message(f"اسکن {site_meta(site_id)['name']}"), "player": serialize_player(p)})

async def sat_scan_country(request):
    uid = get_auth_user_id(request)
    if not uid: return _bad("unauthorized", 401)
    data = await read_json(request); target = data.get("country")
    p = _me(uid); cid = p.get("country")
    if get_infra_level(p, "satellite") <= 0: return _bad("ابتدا ماهواره را بسازید.")
    if target not in COUNTRIES or target == cid: return _bad("کشور نامعتبر است.")
    if get_player_by_country(target)[1] is None: return _bad("این کشور بازیکن ندارد.")
    sa = active_scans(p); key = "c:" + target
    if key in sa:
        return web.json_response({"success": True, "message": "اسکن این کشور هنوز فعال است.", "player": serialize_player(p)})
    if p.get("scans", 0) < 1: return _bad("اسکن باقی نمانده. ماهواره را دوباره پرتاب کنید.")
    if p.get("money", 0) < COUNTRY_SCAN_COST: return _bad("پول کافی نیست.")
    p["scans"] -= 1; p["money"] -= COUNTRY_SCAN_COST
    sa[key] = (utcnow() + timedelta(hours=SCAN_HOURS)).isoformat()
    save_state()
    return web.json_response({"success": True, "message": "اسکن کشور انجام شد و ۲۴ ساعت زنده است.",
                              "completion_message": done_message(f"اسکن {cname(target)}"), "player": serialize_player(p)})

# =========================================================
# اعلان پایان فعالیت: تأیید نمایش
# =========================================================
async def ack_activity_notices(request):
    """کلاینت پس از نمایش واقعی اعلان، شناسهٔ آن را می‌فرستد تا از پروندهٔ بازیکن حذف شود (نمایش یک‌باره)."""
    uid = get_auth_user_id(request)
    if not uid: return _bad("unauthorized", 401)
    data = await read_json(request)
    ids = data.get("ids")
    if not isinstance(ids, list): return _bad("invalid_ids")
    wanted = {str(i) for i in ids[:100]}
    p = _me(uid)
    before = len(p["activity_notices"])
    p["activity_notices"] = [n for n in p["activity_notices"] if not (isinstance(n, dict) and n.get("id") in wanted)]
    return web.json_response({"success": True, "removed": before - len(p["activity_notices"])})

# =========================================================
# API Announcements
# =========================================================
async def get_announcements(request):
    uid = get_auth_user_id(request)
    current_cid = players.get(uid, {}).get("country") if uid else None
    result = []
    comments_migrated = False
    for a in announcements[-50:]:
        reactions = a.get("reactions", {})
        support = [c for c, r in reactions.items() if r == "support"]
        accuse = [c for c, r in reactions.items() if r == "accuse"]
        # Give older replies stable identifiers so they can be replied to recursively.
        for cm in a.setdefault("comments", []):
            if not cm.get("id"):
                cm["id"] = str(uuid.uuid4()); comments_migrated = True
            if "parent_id" not in cm:
                cm["parent_id"] = None; comments_migrated = True
        result.append({"id": a["id"], "from_country": a["from_country"], "text": a["text"],
                       "created_at": a["created_at"], "support": support, "accuse": accuse,
                       "image": a.get("image"),
                       "my_reaction": reactions.get(current_cid) if current_cid else None,
                       "is_mine": bool(current_cid and current_cid == a.get("from_country")),
                       "comments": a.get("comments", []),
                       "comments_count": len(a.get("comments", []))})
    if comments_migrated:
        save_state()
    result.reverse()
    return web.json_response(result)

async def get_announcement_status(request):
    uid = get_auth_user_id(request)
    if not uid:
        return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    if uid not in players:
        players[uid] = create_player(uid)
    p = players[uid]
    if not p.get("country"):
        return web.json_response({"success": False, "error": "no_country",
                                  "message": "ابتدا کشور خود را انتخاب کنید."}, status=400)
    now = utcnow()
    today = _announcement_day(now)
    anns = p.setdefault("announcements", {})
    used_list = anns.get(today, [])
    # Clean malformed legacy values defensively while preserving the stored timestamps.
    if not isinstance(used_list, list):
        used_list = []
        anns[today] = used_list
    used = len(used_list)
    next_number = used + 1 if used < 4 else None
    cooldown = _announcement_cooldown_seconds(used_list, now) if used < 4 else 0
    return web.json_response({"success": True, "count": used, "limit": 4,
                              "next_number": next_number,
                              "next_cost": ANN_COSTS.get(next_number, 0) if next_number else None,
                              "costs": {str(k): v for k, v in ANN_COSTS.items()},
                              "cooldown_seconds": cooldown,
                              "reset_seconds": _announcement_reset_seconds(now),
                              "can_publish": used < 4 and cooldown <= 0})

async def _broadcast_announcement_notification(cid, author_uid=None, recipients=None):
    """ارسال اعلان کوتاه بیانیه به دیگر بازیکنان؛ نویسنده اعلان خودش را نمی‌گیرد."""
    if cid not in COUNTRIES:
        return
    country_name = COUNTRIES[cid]["name"]
    text = (f"{_world_tag()}📢 بیانیهٔ جدید\nکشور «{country_name}» بیانیه‌ای منتشر کرد.\n"
            "متن بیانیه فقط در بخش «ارتباطات ← بیانیه‌ها» قابل مشاهده است.")
    # ارسال مستقیم (نه از صف _tg_send): این تابع به‌صورت تسک پس‌زمینه اجرا می‌شود و صف
    # درخواست تا آن لحظه خالی شده است، پس پیام‌ها از طریق صف هرگز ارسال نمی‌شدند.
    # recipients باید هنگام انتشار و در دنیای همان بیانیه ساخته شده باشد؛ این تسک بعداً اجرا می‌شود
    # و ممکن است دنیای فعال تا آن موقع عوض شده باشد.
    if recipients is None:
        recipients = _world_recipients(author_uid)
    items = [(int(uid), text, None) for uid in recipients]
    try:
        sent, failed = await _flush_tg_outbox(items)
        logging.info("announcement notification: sent=%s failed=%s", sent, failed)
    except Exception as e:
        logging.warning("announcement notification failed: %s", e)

async def _broadcast_strait_notification(text, uids=None):
    """Send public strait-policy changes to every registered player; the bot middleware adds the game button."""
    semaphore = asyncio.Semaphore(8)
    tag = _world_tag()   # همین‌جا و در دنیای فعال گرفته می‌شود
    async def send_to(uid):
        async with semaphore:
            try:
                await bot.send_message(int(uid), f"{tag}⚓ خبر تنگه\n{text}\n\nبرای دیدن موقعیت و تنظیمات، نقشهٔ بازی را باز کنید.")
            except Exception as e:
                logging.warning("strait notification failed for %s: %s", uid, e)
    targets = list(uids) if uids is not None else list(players.keys())
    await asyncio.gather(*(send_to(uid) for uid in targets), return_exceptions=True)

def _schedule_strait_broadcast(text):
    try:
        # فهرست گیرنده‌ها همین‌جا و در دنیای فعال ثبت می‌شود تا با جابه‌جایی دنیا اشتباه نشود.
        uids = [uid for uid, pl in players.items() if pl.get("country") and not pl.get("is_eliminated")]
        asyncio.get_running_loop().create_task(_broadcast_strait_notification(text, uids))
    except RuntimeError:
        logging.warning("strait notification skipped: no active event loop")

ANN_IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".jfif", ".gif"}

def _announcement_images(cid):
    """همهٔ تصاویر بیانیهٔ یک کشور را از web/images/announcements برمی‌گرداند.
    پشتیبانی: پوشهٔ <cid>/ با هر تعداد عکس، و فایل‌های <cid>.ext یا <cid>_N.ext یا <cid>-N.ext"""
    from urllib.parse import quote as _q
    if cid not in COUNTRIES:
        return []
    base = os.path.join(WEB_DIR, "images", "announcements")
    found = []
    try:
        sub = os.path.join(base, cid)
        if os.path.isdir(sub):
            for f in sorted(os.listdir(sub)):
                if os.path.splitext(f)[1].lower() in ANN_IMG_EXTS:
                    found.append(f"{cid}/{f}")
        if os.path.isdir(base):
            for f in sorted(os.listdir(base)):
                stem, ext = os.path.splitext(f)
                if ext.lower() not in ANN_IMG_EXTS or not os.path.isfile(os.path.join(base, f)):
                    continue
                if stem == cid or stem.startswith(cid + "_") or stem.startswith(cid + "-"):
                    found.append(f)
    except OSError as e:
        logging.warning("announcement images listing failed: %s", e)
    return [{"id": rel, "url": "/images/announcements/" + "/".join(_q(part) for part in rel.split("/"))} for rel in found]

async def get_announcement_images(request):
    uid = get_auth_user_id(request)
    if not uid:
        return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    cid = players.get(uid, {}).get("country")
    if not cid:
        return web.json_response({"success": False, "error": "no_country",
                                  "message": "ابتدا کشور خود را انتخاب کنید."}, status=400)
    return web.json_response({"success": True, "images": _announcement_images(cid)})

async def create_announcement(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); text = (data.get("text") or "").strip()[:20000]
    if not text: return web.json_response({"success": False, "error": "empty", "message": "متن بیانیه را بنویسید."}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]; cid = p.get("country")
    if not cid: return web.json_response({"success": False, "error": "no_country", "message": "ابتدا کشور خود را انتخاب کنید."}, status=400)
    # انتخاب تصویر اجباری است و باید یکی از تصاویر همین کشور باشد.
    chosen_image = str(data.get("image") or "").strip()
    allowed_images = {img["id"]: img["url"] for img in _announcement_images(cid)}
    if not chosen_image:
        return web.json_response({"success": False, "error": "image_required",
                                  "message": "برای انتشار بیانیه باید یک تصویر انتخاب کنید."}, status=400)
    if chosen_image not in allowed_images:
        return web.json_response({"success": False, "error": "invalid_image",
                                  "message": "تصویر انتخاب‌شده معتبر نیست."}, status=400)
    now = utcnow()
    today = _announcement_day(now)
    anns = p.setdefault("announcements", {})
    today_list = anns.get(today, [])
    if not isinstance(today_list, list):
        today_list = []
    if len(today_list) >= 4:
        return web.json_response({"success": False, "error": "daily_limit",
                                  "reset_seconds": _announcement_reset_seconds(now),
                                  "message": "سهمیهٔ امروز تمام شده است؛ پس از نیمه‌شب دوباره فعال می‌شود."}, status=400)
    cooldown = _announcement_cooldown_seconds(today_list, now)
    if cooldown > 0:
        mins = max(1, (cooldown + 59) // 60)
        return web.json_response({"success": False, "error": "cooldown",
                                  "retry_after_seconds": cooldown,
                                  "message": f"برای انتشار بیانیهٔ بعدی {mins} دقیقه دیگر صبر کنید."}, status=400)
    cost = ANN_COSTS.get(len(today_list) + 1, 400_000)
    if p.get("money", 0) < cost:
        return web.json_response({"success": False, "error": "not_enough_money",
                                  "message": f"هزینهٔ این بیانیه {cost:,} دلار است."}, status=400)
    p["money"] -= cost
    published_at = utcnow().isoformat()
    today_list.append(published_at); anns[today] = today_list
    ann = {"id": str(uuid.uuid4()), "from_country": cid, "text": text,
           "created_at": published_at, "reactions": {}, "comments": [],
           "image": allowed_images[chosen_image]}
    announcements.append(ann)
    # متن کامل بیانیه هرگز وارد خبرهای عمومی/اعلان‌ها نمی‌شود.
    push_news("بیانیه", f"کشور «{COUNTRIES[cid]['name']}» بیانیه‌ای منتشر کرد؛ متن فقط در بخش بیانیه‌هاست.")
    save_state()
    try:
        # گیرندگان همین‌جا و فقط از بازیکنان همین دنیا ثبت می‌شوند.
        ann_recipients = _world_recipients(uid)
        asyncio.get_running_loop().create_task(_broadcast_announcement_notification(cid, uid, ann_recipients))
    except RuntimeError:
        logging.warning("announcement notification skipped: no active event loop")
    return web.json_response({"success": True, "announcement": ann, "cost": cost,
                              "remaining_today": max(0, 4 - len(today_list))})

async def react_announcement(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); ann_id = data.get("announcement_id"); r = data.get("reaction")
    if r not in ("support", "accuse"):
        return web.json_response({"success": False, "error": "invalid"}, status=400)
    if uid not in players or not players[uid].get("country"):
        return web.json_response({"success": False, "error": "no_country", "message": "ابتدا کشور خود را انتخاب کنید."}, status=400)
    cid = players[uid].get("country")
    for a in announcements:
        if a["id"] == ann_id:
            reactions = a.setdefault("reactions", {})
            if cid in reactions:
                return web.json_response({"success": False, "error": "already_reacted",
                                          "message": "واکنش شما قبلاً برای همیشه ثبت شده و قابل تغییر یا حذف نیست."}, status=409)
            reactions[cid] = r
            save_state()
            owner_uid, _ = get_player_by_country(a.get("from_country"))
            if owner_uid and owner_uid != uid:
                country_name = COUNTRIES.get(cid, {}).get("name", cid)
                if r == "support":
                    note = f"✅ کشور «{country_name}» از بیانیهٔ شما حمایت کرد."
                else:
                    note = f"❌ کشور «{country_name}» بیانیهٔ شما را محکوم کرد."
                await notify_user(owner_uid, note)
            return web.json_response({"success": True, "reaction": r, "immutable": True})
    return web.json_response({"success": False, "error": "not_found"}, status=404)

async def comment_announcement(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request)
    ann_id = data.get("announcement_id")
    text = (data.get("text") or "").strip()[:5000]
    parent_id = data.get("parent_comment_id") or None
    if not text: return web.json_response({"success": False, "error": "empty", "message": "متن پاسخ را بنویسید."}, status=400)
    if not parent_id is None:
        parent_id = str(parent_id)
    if uid not in players or not players[uid].get("country"):
        return web.json_response({"success": False, "error": "no_country", "message": "ابتدا کشور خود را انتخاب کنید."}, status=400)
    cid = players[uid].get("country")
    for a in announcements:
        if a["id"] == ann_id:
            comments = a.setdefault("comments", [])
            for cm in comments:
                if not cm.get("id"):
                    cm["id"] = str(uuid.uuid4())
                if "parent_id" not in cm:
                    cm["parent_id"] = None
            if parent_id and not any(str(cm.get("id")) == parent_id for cm in comments):
                return web.json_response({"success": False, "error": "parent_not_found",
                                          "message": "پاسخی که می‌خواهید به آن جواب دهید پیدا نشد؛ گفتگو را تازه کنید."}, status=400)
            comment = {"id": str(uuid.uuid4()), "parent_id": parent_id, "from_country": cid,
                       "text": text, "at": utcnow().isoformat()}
            comments.append(comment)
            save_state()
            return web.json_response({"success": True, "comment": comment})
    return web.json_response({"success": False, "error": "not_found"}, status=404)

async def get_announcement_detail(request):
    aid = request.query.get("id")
    for a in announcements:
        if a["id"] == aid: return web.json_response(a)
    return web.json_response({"error": "not_found"}, status=404)

# =========================================================
# API Unions
# =========================================================
def _public_union(u):
    """اطلاعات عمومی اتحادیه؛ پیام‌ها و درخواست‌های عضویت خصوصی می‌مانند."""
    members = list(u.get("members", []))
    return {"id": u["id"], "name": u.get("name", "اتحادیه"),
            "leader_country": u.get("leader_country"), "members": members,
            "member_count": len(members), "created_at": u.get("created_at")}

async def get_union(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    cid = players.get(uid, {}).get("country")
    public_unions = [_public_union(u) for u in sorted(unions.values(), key=lambda x: x.get("created_at", ""), reverse=True)]
    current = next((u for u in unions.values() if cid and cid in u.get("members", [])), None)
    if current:
        payload = {**_public_union(current), "messages": current.get("messages", [])}
        is_leader = current.get("leader_country") == cid
        if is_leader:
            payload["join_requests"] = list(current.get("requests", []))
        return web.json_response({"union": payload, "is_leader": is_leader,
                                  "unions": public_unions, "invites": [], "requested_union_ids": []})

    invites = []
    requested = []
    for u in unions.values():
        if cid and cid in u.get("invites", []):
            invites.append({"union_id": u["id"], "name": u["name"], "leader": u["leader_country"]})
        if cid and cid in u.get("requests", []):
            requested.append(u["id"])
    return web.json_response({"union": None, "invites": invites, "unions": public_unions,
                              "requested_union_ids": requested})

async def create_union(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); name = (data.get("name") or "").strip()[:40]
    if not name: return web.json_response({"success": False, "error": "no_name"}, status=400)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    if not cid: return web.json_response({"success": False, "error": "no_country"}, status=400)
    for u in unions.values():
        if cid in u.get("members", []):
            return web.json_response({"success": False, "error": "already_member"}, status=400)
    u_id = str(uuid.uuid4())
    unions[u_id] = {"id": u_id, "name": name, "leader_country": cid, "members": [cid],
                    "messages": [], "invites": [], "requests": [], "created_at": utcnow().isoformat()}
    push_news("اتحادیه", f"{COUNTRIES[cid]['name']} اتحادیه «{name}» را ساخت.")
    save_state()
    return web.json_response({"success": True, "union_id": u_id})

async def invite_union(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); u_id = data.get("union_id"); target = data.get("target")
    if target not in COUNTRIES: return web.json_response({"success": False, "error": "invalid"}, status=400)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    u = unions.get(u_id)
    if not u: return web.json_response({"success": False, "error": "no_union"}, status=404)
    if u["leader_country"] != cid: return web.json_response({"success": False, "error": "not_leader"}, status=403)
    if target in u.get("members", []): return web.json_response({"success": False, "error": "already_member"}, status=400)
    if any(target in other.get("members", []) for other in unions.values() if other["id"] != u_id):
        return web.json_response({"success": False, "error": "in_other"}, status=400)
    u.setdefault("invites", [])
    newly_invited = target not in u["invites"]
    if newly_invited: u["invites"].append(target)
    if newly_invited:
        notify_country(target, f"🤝 {COUNTRIES[cid]['name']} شما را به اتحادیه «{u.get('name', 'اتحادیه')}» دعوت می‌کند.\n"
                               "برای قبول یا رد، وارد بازی شوید و در بخش ارتباطات ← اتحادیه تصمیم بگیرید.")
    save_state()
    return web.json_response({"success": True})

async def respond_union_invite(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); u_id = data.get("union_id"); accept = bool(data.get("accept"))
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    u = unions.get(u_id)
    if not u or cid not in u.get("invites", []):
        return web.json_response({"success": False, "error": "no_invite"}, status=400)
    if accept and any(cid in other.get("members", []) for other in unions.values() if other["id"] != u_id):
        return web.json_response({"success": False, "error": "in_other"}, status=400)
    u["invites"].remove(cid)
    if accept and cid not in u.setdefault("members", []):
        u["members"].append(cid)
        push_news("اتحادیه", f"{COUNTRIES[cid]['name']} به اتحادیه «{u.get('name', 'اتحادیه')}» پیوست.")
        for other in unions.values():
            if other["id"] == u_id: continue
            if cid in other.get("requests", []): other["requests"].remove(cid)
            if cid in other.get("invites", []): other["invites"].remove(cid)
    save_state()
    return web.json_response({"success": True})

async def request_union_membership(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    if not cid: return web.json_response({"success": False, "error": "no_country"}, status=400)
    data = await read_json(request); u_id = data.get("union_id")
    u = unions.get(u_id)
    if not u: return web.json_response({"success": False, "error": "no_union"}, status=404)
    if any(cid in other.get("members", []) for other in unions.values()):
        return web.json_response({"success": False, "error": "already_member"}, status=400)
    if cid in u.get("members", []): return web.json_response({"success": False, "error": "already_member"}, status=400)
    # هر کشور فقط یک درخواست عضویت فعال داشته باشد تا درخواست‌های قدیمی معلق نمانند.
    for other in unions.values():
        if other["id"] != u_id and cid in other.get("requests", []):
            other["requests"].remove(cid)
    requests = u.setdefault("requests", [])
    newly_requested = cid not in requests
    if newly_requested: requests.append(cid)
    if newly_requested:
        notify_country(u.get("leader_country"), f"📨 {COUNTRIES[cid]['name']} می‌خواهد به اتحادیه «{u.get('name', 'اتحادیه')}» بپیوندد.\n"
                                               "برای قبول یا رد، وارد بازی شوید و در بخش ارتباطات ← اتحادیه ← مدیریت تصمیم بگیرید.")
    save_state()
    return web.json_response({"success": True, "pending": True})

async def respond_union_request(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    data = await read_json(request); u_id = data.get("union_id"); target = data.get("target")
    accept = bool(data.get("accept"))
    u = unions.get(u_id)
    if not u: return web.json_response({"success": False, "error": "no_union"}, status=404)
    if u.get("leader_country") != cid:
        return web.json_response({"success": False, "error": "not_leader"}, status=403)
    if target not in u.setdefault("requests", []):
        return web.json_response({"success": False, "error": "no_request"}, status=400)
    if accept and any(target in other.get("members", []) for other in unions.values() if other["id"] != u_id):
        return web.json_response({"success": False, "error": "in_other"}, status=400)
    u["requests"].remove(target)
    if accept and target not in u.setdefault("members", []):
        u["members"].append(target)
        push_news("اتحادیه", f"{COUNTRIES[target]['name']} به اتحادیه «{u.get('name', 'اتحادیه')}» پیوست.")
        if target in u.setdefault("invites", []): u["invites"].remove(target)
        for other in unions.values():
            if other["id"] == u_id: continue
            if target in other.get("requests", []): other["requests"].remove(target)
            if target in other.get("invites", []): other["invites"].remove(target)
    save_state()
    return web.json_response({"success": True})

async def kick_union_member(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    data = await read_json(request); u_id = data.get("union_id"); target = data.get("target")
    u = unions.get(u_id)
    if not u: return web.json_response({"success": False, "error": "no_union"}, status=404)
    if u.get("leader_country") != cid:
        return web.json_response({"success": False, "error": "not_leader"}, status=403)
    if target == cid: return web.json_response({"success": False, "error": "cannot_kick_self"}, status=400)
    if target not in u.get("members", []): return web.json_response({"success": False, "error": "not_member"}, status=400)
    u["members"].remove(target)
    save_state()
    return web.json_response({"success": True})

async def leave_union(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    for u in list(unions.values()):
        if cid in u.get("members", []):
            # اگر مالک خارج شود، اتحادیه حذف می‌شود تا بدون مالک نماند.
            if u.get("leader_country") == cid:
                del unions[u["id"]]
                push_news("اتحادیه", f"اتحادیه «{u.get('name', 'اتحادیه')}» با خروج مالک منحل شد.")
            else:
                u["members"].remove(cid)
            save_state(); return web.json_response({"success": True})
    return web.json_response({"success": False, "error": "not_member"}, status=400)

async def send_union_message(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); text = (data.get("text") or "").strip()[:500]
    if not text: return web.json_response({"success": False, "error": "empty"}, status=400)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    for u in unions.values():
        if cid in u.get("members", []):
            u.setdefault("messages", []).append({"from_country": cid, "text": text, "at": utcnow().isoformat()})
            if len(u["messages"]) > 200: del u["messages"][:50]
            save_state(); return web.json_response({"success": True})
    return web.json_response({"success": False, "error": "not_member"}, status=400)

# =========================================================
# API Private messages
# =========================================================
async def send_pm(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request); target = data.get("target"); text = (data.get("text") or "").strip()[:500]
    if target not in COUNTRIES or not text:
        return web.json_response({"success": False, "error": "invalid"}, status=400)
    if uid not in players: return web.json_response({"success": False, "error": "no_player"}, status=400)
    cid = players[uid].get("country")
    if not cid or target == cid:
        return web.json_response({"success": False, "error": "invalid"}, status=400)
    msg = {"from": cid, "to": target, "text": text, "at": utcnow().isoformat()}
    private_messages.setdefault(cid, {}).setdefault(target, []).append(msg)
    private_messages.setdefault(target, {}).setdefault(cid, []).append(msg)
    # فرستنده پیام خودش را دیده است
    pm_read.setdefault(cid, {})[target] = len(private_messages[cid][target])
    save_state()
    try: notify_country(target, f"📩 از کشور {_lname(cid)} یک پیغام خصوصی آمد.\nبرای خواندن: ارتباطات ← پیام خصوصی")
    except Exception as e: logging.warning("pm notify failed: %s", e)
    return web.json_response({"success": True})

def _pm_unread(cid, other):
    msgs = private_messages.get(cid, {}).get(other, [])
    seen = pm_read.get(cid, {}).get(other, 0)
    return sum(1 for m in msgs[seen:] if m.get("from") == other)

async def get_pm(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    target = request.query.get("target")
    if uid not in players: return web.json_response({"messages": [], "conversations": [], "unread_total": 0})
    cid = players[uid].get("country")
    if not cid: return web.json_response({"messages": [], "conversations": [], "unread_total": 0})
    if target:
        msgs = private_messages.get(cid, {}).get(target, [])
        pm_read.setdefault(cid, {})[target] = len(msgs)
        return web.json_response({"messages": msgs, "with": target})
    convs = []
    for other, msgs in private_messages.get(cid, {}).items():
        if not msgs: continue
        last = msgs[-1]
        convs.append({"with": other, "last": last.get("text", ""), "last_from": last.get("from"),
                      "at": last.get("at"), "unread": _pm_unread(cid, other)})
    convs.sort(key=lambda c: c.get("at") or "", reverse=True)
    return web.json_response({"conversations": convs, "unread_total": sum(c["unread"] for c in convs)})

# =========================================================
# API Market — international trade
# =========================================================
TRADE_COUNTRY_COORDS = {  # پایتخت هر کشور (نقطهٔ خانه برای نیروهای زمینی)
    "germany": (13.40, 52.52), "france": (2.35, 48.86), "italy": (12.50, 41.90),
    "britain": (-0.13, 51.51), "ussr": (37.62, 55.75), "usa": (-77.04, 38.90),
    "china": (116.40, 39.90), "japan": (139.69, 35.69),
    "saudi": (46.72, 24.63), "iran": (51.39, 35.69), "turkey": (32.86, 39.93),
    "venezuela": (-66.90, 10.48), "egypt": (31.24, 30.04),
}
# فقط همسایهٔ مستقیم؛ کشور واسطه برای تجارت زمینی استفاده نمی‌شود.
LAND_NEIGHBORS = {
    frozenset(("germany", "france")), frozenset(("germany", "ussr")),
    frozenset(("germany", "italy")), frozenset(("france", "italy")),
    frozenset(("ussr", "china")),
    # همسایگی زمینی ۱۹۳۶ کشورهای جدید (با قلمروهای مستعمراتی بریتانیا/فرانسه/ایتالیا)
    frozenset(("turkey", "ussr")), frozenset(("iran", "ussr")), frozenset(("turkey", "iran")),
    frozenset(("turkey", "france")), frozenset(("egypt", "britain")), frozenset(("egypt", "italy")),
    frozenset(("saudi", "britain")), frozenset(("iran", "britain")), frozenset(("venezuela", "britain")),
}
# مسیرهای دریایی ساده‌شدهٔ بازی. [] یعنی مسیر مستقیم و بدون تنگه.
SEA_ROUTE_HINTS = {
    frozenset(("germany", "britain")): [["dover"], []],
    frozenset(("france", "britain")): [["dover"], []],
    frozenset(("italy", "britain")): [["gibraltar", "dover"], ["gibraltar"], []],
    frozenset(("germany", "italy")): [["gibraltar"], []],
    frozenset(("france", "italy")): [["gibraltar"], []],
    frozenset(("germany", "china")): [["suez", "malacca"], ["gibraltar", "suez", "malacca"], []],
    frozenset(("france", "china")): [["suez", "malacca"], ["gibraltar", "suez", "malacca"], []],
    frozenset(("italy", "china")): [["suez", "malacca"], []],
    frozenset(("britain", "china")): [["suez", "malacca"], ["gibraltar", "suez", "malacca"], []],
    frozenset(("ussr", "japan")): [["korea"], ["taiwan"], []],
    frozenset(("china", "japan")): [["taiwan"], ["korea"], []],
    frozenset(("usa", "japan")): [["panama"], []],
    frozenset(("usa", "china")): [["panama", "malacca"], ["malacca"], []],
    frozenset(("usa", "germany")): [["panama", "gibraltar"], ["panama", "suez"], []],
    frozenset(("usa", "france")): [["panama", "gibraltar"], ["panama", "suez"], []],
    frozenset(("usa", "italy")): [["panama", "gibraltar"], ["panama", "suez"], []],
    frozenset(("usa", "britain")): [["panama", "gibraltar"], []],
    frozenset(("usa", "ussr")): [["panama", "gibraltar"], ["panama", "suez"], []],
}
TRADE_COST_PER_1000KM_PER_1000_UNITS = {"land": 900, "sea": 1500, "air": 4200}
TRADE_SEA_COST_PER_KM = 10    # کرایهٔ حمل دریایی: هر کیلومتر مسیر واقعی دریایی ۱۰ دلار (مستقل از مقدار کالا)


def _trade_distance_km(a, b):
    from math import radians, sin, cos, asin, sqrt
    if a not in TRADE_COUNTRY_COORDS or b not in TRADE_COUNTRY_COORDS: return 1000.0
    lon1, lat1 = TRADE_COUNTRY_COORDS[a]; lon2, lat2 = TRADE_COUNTRY_COORDS[b]
    r = 6371.0
    dlon, dlat = radians(lon2-lon1), radians(lat2-lat1)
    x = sin(dlat/2)**2 + cos(radians(lat1))*cos(radians(lat2))*sin(dlon/2)**2
    return r * 2 * asin(sqrt(max(0, min(1, x))))


def _trade_travel_seconds(a, b, mode, distance):
    """ناوهای تجاری از مسیر واقعی دریایی می‌روند؛ زمینی و هوایی بر اساس فاصلهٔ مستقیم."""
    if mode == "sea":
        plan = plan_sea_voyage(a, "home", f"country:{b}", b)
        if plan: return int(round(plan["seconds"]))
    return int(round(travel_seconds_for_km(distance)))


def _land_open(cid):
    _, p = get_player_by_country(cid)
    return bool((p or {}).get("land_trade_open", True))


def _war_between(a, b):
    if not a or not b: return False
    return any({w.get("attacker"), w.get("defender")} == {a, b}
               for w in active_wars.values() if not w.get("resolved"))


def _infra_ready(country, infra_id):
    _, p = get_player_by_country(country)
    return bool(p and get_infra_level(p, infra_id) > 0)


def _trade_sea_plan(a, b, traveler):
    """مسیر واقعی دریایی کشتی تجاری از بندر a تا بندر b؛ اگر یکی از تنگه‌های مسیر برای traveler بسته باشد، حمل دریایی ممکن نیست."""
    geo = _sea_geometry(a, "home", f"country:{b}", b, traveler)
    if not geo: return None
    if any(strait_policy(sid, traveler).get("closed", False) for sid in geo["straits"]):
        return None
    geo = dict(geo)
    geo["seconds"] = sea_travel_seconds(geo["km"])
    return geo


def _no_route_message(a, b, traveler, default):
    """اگر تنها مانع حمل دریایی تنگهٔ بسته (بدون مسیر جایگزین) باشد، علت را صریح می‌گوید."""
    if _infra_ready(a, "naval_port") and _infra_ready(b, "naval_port"):
        geo = _sea_geometry(a, "home", f"country:{b}", b, traveler)
        if geo and geo.get("via_closed"):
            names = [STRAITS_DATA[sid]["name"] for sid in geo["straits"] if strait_policy(sid, traveler).get("closed", False)]
            return "حمل دریایی ممکن نیست؛ تنگهٔ بسته: " + "، ".join(names or ["نامشخص"])
    return default


def _route_candidates(a, b, traveler_cid=None):
    key = frozenset((a, b))
    out = []
    if key in LAND_NEIGHBORS and _land_open(a) and _land_open(b):
        out.append({"mode": "land", "straits": []})
    # دریایی: هر دو طرف باید بندر داشته باشند؛ مسیر و تنگه‌ها از مسیر واقعی دریایی به‌دست می‌آیند.
    if _infra_ready(a, "naval_port") and _infra_ready(b, "naval_port"):
        plan = _trade_sea_plan(a, b, traveler_cid or b)
        if plan: out.append({"mode": "sea", "straits": plan["straits"], "plan": plan})
    # هوایی: هر دو طرف فرودگاه داشته باشند.
    if _infra_ready(a, "air_airport") and _infra_ready(b, "air_airport"):
        out.append({"mode": "air", "straits": []})
    return out


def _price_route(a, b, amount, traveler, r):
    """هزینهٔ تفکیک‌شدهٔ یک مسیر: کرایه حمل (بر اساس طول واقعی مسیر) + عوارض فقط تنگه‌هایی که در مسیر هستند."""
    mode = r["mode"]; plan = r.get("plan")
    if mode == "sea" and plan:
        km = float(plan["km"]); seconds = plan["seconds"]; straits = list(plan["straits"])
    else:
        km = max(100.0, _trade_distance_km(a, b)); seconds = travel_seconds_for_km(km); straits = []
    km = max(100.0, km)
    if mode == "sea":
        freight = int(round(km * TRADE_SEA_COST_PER_KM))
    else:
        freight = int(round((max(1, amount) / 1000.0) * (km / 1000.0) * TRADE_COST_PER_1000KM_PER_1000_UNITS[mode]))
    items = []
    for sid in straits:
        if sid not in STRAITS_DATA: continue
        pol = strait_policy(sid, traveler)
        items.append({"id": sid, "name": STRAITS_DATA[sid]["name"], "cost": max(0, int(pol.get("toll", 0) or 0)),
                      "owner": strait_holdings.get(sid)})
    toll = sum(i["cost"] for i in items)
    return {"mode": mode, "straits": [i["id"] for i in items],
            "distance_km": int(round(km)),
            "straight_km": int(round(max(100.0, _trade_distance_km(a, b)))),
            "travel_seconds": int(round(seconds)),
            "freight_cost": freight, "toll": toll, "strait_costs": items,
            "transport_cost": freight + toll}


def _route_quote(a, b, amount, preferred_mode=None):
    if _war_between(a, b):
        return None, "در زمان جنگ، تجارت مستقیم بین دو کشور تحریم است."
    routes = _route_candidates(a, b, traveler_cid=b)
    if not routes:
        return None, _no_route_message(a, b, b, "هیچ مسیر قابل استفاده‌ای بین دو کشور وجود ندارد.")
    quotes = [_price_route(a, b, amount, b, r) for r in routes]
    if preferred_mode:
        same = [q for q in quotes if q["mode"] == preferred_mode]
        if not same: return None, (_no_route_message(a, b, b, "این نوع حمل برای این معامله ممکن نیست.") if preferred_mode == "sea" else "این نوع حمل برای این معامله ممکن نیست.")
        return min(same, key=lambda x: x["transport_cost"]), None
    # ارزان‌ترین مسیر مجاز انتخاب می‌شود.
    return min(quotes, key=lambda x: x["transport_cost"]), None


def _route_options(a, b, amount, traveler_cid=None):
    if _war_between(a, b): return [], "در زمان جنگ، تجارت مستقیم بین دو کشور تحریم است."
    traveler = traveler_cid or b
    routes = _route_candidates(a, b, traveler_cid=traveler)
    if not routes: return [], _no_route_message(a, b, traveler, "هیچ مسیر قابل استفاده‌ای بین دو کشور وجود ندارد.")
    return [_price_route(a, b, amount, traveler, r) for r in routes], None


def _listing_view(l):
    side = l.get("side", "sell")
    if side == "sell":
        return {**l, "side":"sell", "country":l["seller"], "resource":l["sell_resource"],
                "amount":l["sell_amount"], "price_resource":l["want_resource"], "price_amount":l["want_amount"]}
    return {**l, "side":"buy", "country":l["buyer"], "resource":l["buy_resource"],
            "amount":l["buy_amount"], "price_resource":l["offer_resource"], "price_amount":l["offer_amount"]}


async def get_market_shipments(request):
    """کالاهای در راه: ورودی‌ها (برای من) و خروجی‌ها (فروخته‌شده و در مسیر خریدار)، همراه ساعت سرور."""
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    p = players.get(uid)
    cid = (p or {}).get("country")
    out = []
    changed = False
    for pl in list(players.values()):
        if not isinstance(pl, dict) or not pl.get("pending_deliveries"): continue
        before = len(pl["pending_deliveries"])
        process_deliveries(pl)  # رسیده‌ها همین‌جا به موجودی اضافه می‌شوند تا وضعیت با واقعیت یکی باشد
        if len(pl["pending_deliveries"]) != before: changed = True
    if changed: save_state()
    if cid:
        for pl in players.values():
            if not isinstance(pl, dict): continue
            owner = pl.get("country")
            for d in pl.get("pending_deliveries") or []:
                to_c = d.get("to") or owner
                if to_c != cid and d.get("from") != cid: continue
                out.append({"id": d.get("id"), "resource": d.get("resource"), "amount": int(d.get("amount", 0) or 0),
                            "from": d.get("from"), "to": to_c, "mode": d.get("mode"), "straits": d.get("straits") or [],
                            "start": d.get("start"), "arrive": d.get("arrive"),
                            "direction": "in" if to_c == cid else "out"})
    out.sort(key=lambda x: x.get("arrive") or "")
    return web.json_response({"shipments": out, "now": utcnow().isoformat()})


async def get_market(request):
    rows = []
    viewer_cid = request.query.get("country")
    for l in market_listings.values():
        if l.get("status") != "open": continue
        v = _listing_view(l)
        owner_cid = v["country"]
        if viewer_cid and viewer_cid in COUNTRIES and viewer_cid != owner_cid:
            if v["side"] == "sell":
                origin_cid, dest_cid = owner_cid, viewer_cid
            else:
                origin_cid, dest_cid = viewer_cid, owner_cid
            qs, err = _route_options(origin_cid, dest_cid, v["amount"], traveler_cid=dest_cid)
            v["routes"] = qs; v["route_error"] = err
        else:
            v["routes"] = []
        rows.append(v)
    sanctions = [{"by": by, "target": target} for by, targets in market_sanctions.items() for target in (targets or [])]
    return web.json_response({"listings": rows, "sanctions": sanctions,
                              "my_sanctions": list(market_sanctions.get(viewer_cid, [])) if viewer_cid else [],
                              "trade_modes":{"land":True,"sea":True,"air":True}})


async def set_market_sanction(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request)
    target = data.get("target")
    action = str(data.get("action", "sanction"))
    p = players.get(uid)
    cid = p.get("country") if p else None
    if not cid: return web.json_response({"success": False, "message": "ابتدا کشور خود را انتخاب کنید."}, status=400)
    if target not in COUNTRIES or target == cid:
        return web.json_response({"success": False, "message": "کشور مقصد معتبر نیست."}, status=400)
    blocked = set(market_sanctions.get(cid, []) or [])
    if action == "lift":
        blocked.discard(target)
        if blocked: market_sanctions[cid] = sorted(blocked)
        else: market_sanctions.pop(cid, None)
        push_news("رفع تحریم بازار", f"{COUNTRIES[cid]['name']} تحریم بازار علیه {COUNTRIES[target]['name']} را برداشت.")
        msg = "تحریم بازار برداشته شد."
    elif action == "sanction":
        blocked.add(target); market_sanctions[cid] = sorted(blocked)
        push_news("تحریم بازار جهانی", f"{COUNTRIES[cid]['name']} کشور {COUNTRIES[target]['name']} را از خرید در بازار جهانی محروم کرد.", "warning")
        msg = "تحریم ثبت شد؛ کشور هدف دیگر نمی‌تواند از بازار جهانی خرید کند."
    else:
        return web.json_response({"success": False, "message": "عملیات نامعتبر است."}, status=400)
    save_state()
    return web.json_response({"success": True, "message": msg, "sanctions": [{"by": by, "target": tg} for by, vals in market_sanctions.items() for tg in vals]})


async def create_listing(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success":False,"error":"unauthorized"}, status=401)
    data = await read_json(request); side = data.get("side", "sell")
    try:
        amount = int(data.get("amount", 0)); price_amount = int(data.get("price_amount", 0))
    except (TypeError, ValueError):
        return web.json_response({"success":False,"error":"invalid_amount","message":"مقدارها باید عدد صحیح باشند."}, status=400)
    resource = data.get("resource"); price_resource = data.get("price_resource")
    if resource not in RESOURCE_NAMES or (price_resource != "money" and price_resource not in RESOURCE_NAMES):
        return web.json_response({"success":False,"error":"invalid_res","message":"کالا و چیزی که در ازای آن می‌خواهید را انتخاب کنید."}, status=400)
    if side not in ("sell", "buy") or amount <= 0 or price_amount <= 0:
        return web.json_response({"success":False,"error":"invalid_amount","message":"هر دو مقدار باید عدد صحیح بزرگ‌تر از صفر باشند."}, status=400)
    if uid not in players: players[uid] = create_player(uid)
    p = players[uid]
    if not p.get("country"):
        return web.json_response({"success":False,"error":"no_country","message":"ابتدا کشور خود را انتخاب کنید."}, status=400)
    ensure_player_fields(p); accrue_player(p)
    cid = p.get("country")
    if side == "sell":
        available = int(p["resources"].get(resource, 0))
        if available < amount:
            return web.json_response({"success":False,"error":"not_enough_res","field":"amount","available":available,
                "message":f"موجودی شما {available:,} واحد {RESOURCE_NAMES[resource]} است."}, status=400)
        # Reserve the listed goods. Cancelling the order returns this escrow.
        p["resources"][resource] = p["resources"].get(resource, 0) - amount
        l = {"id":str(uuid.uuid4()),"side":"sell","seller":cid,"sell_resource":resource,"sell_amount":amount,
             "want_resource":price_resource,"want_amount":price_amount,"status":"open","escrowed":True,
             "created_at":utcnow().isoformat()}
    else:
        # Buy offers escrow the offered money/resource so the order cannot be posted twice with the same balance.
        available = int(p.get("money", 0)) if price_resource == "money" else int(p["resources"].get(price_resource, 0))
        if available < price_amount:
            label = "دلارِ خزانه" if price_resource == "money" else RESOURCE_NAMES[price_resource]
            return web.json_response({"success":False,"error":"not_enough_res" if price_resource != "money" else "not_enough_money",
                "field":"price_amount","available":available,
                "message":f"موجودی شما {available:,} {label} است."}, status=400)
        if price_resource == "money": p["money"] = p.get("money", 0) - price_amount
        else: p["resources"][price_resource] = p["resources"].get(price_resource, 0) - price_amount
        l = {"id":str(uuid.uuid4()),"side":"buy","buyer":cid,"buy_resource":resource,"buy_amount":amount,
             "offer_resource":price_resource,"offer_amount":price_amount,"status":"open","escrowed":True,
             "created_at":utcnow().isoformat()}
    market_listings[l["id"]] = l; save_state()
    return web.json_response({"success":True,"listing_id":l["id"]})


async def cancel_listing(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success":False,"error":"unauthorized"}, status=401)
    data = await read_json(request); lid = data.get("listing_id")
    p = players.get(uid); cid = p.get("country") if p else None
    l = market_listings.get(lid)
    owner = l.get("seller") if l and l.get("side", "sell") == "sell" else (l.get("buyer") if l else None)
    if not l: return web.json_response({"success":False,"error":"not_found","message":"آگهی پیدا نشد."}, status=404)
    if owner != cid: return web.json_response({"success":False,"error":"not_owner","message":"این آگهی متعلق به شما نیست."}, status=403)
    # Only newly escrowed listings need a refund; legacy listings were not deducted at creation.
    if l.get("escrowed") and p:
        ensure_player_fields(p)
        if l.get("side", "sell") == "sell":
            key = l["sell_resource"]
            p["resources"][key] = p["resources"].get(key, 0) + int(l.get("sell_amount", 0))
        else:
            key = l.get("offer_resource", "money"); value = int(l.get("offer_amount", 0))
            if key == "money": p["money"] = p.get("money", 0) + value
            else: p["resources"][key] = p["resources"].get(key, 0) + value
    del market_listings[lid]; save_state()
    return web.json_response({"success":True})


async def accept_listing(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success":False,"error":"unauthorized"}, status=401)
    data = await read_json(request); lid = data.get("listing_id")
    if uid not in players: players[uid] = create_player(uid)
    actor = players[uid]; actor_cid = actor.get("country"); l = market_listings.get(lid)
    if not l or l.get("status") != "open": return web.json_response({"success":False,"error":"closed","message":"این آگهی دیگر فعال نیست."}, status=400)
    side = l.get("side", "sell")
    owner_cid = l.get("seller") if side == "sell" else l.get("buyer")
    if owner_cid == actor_cid: return web.json_response({"success":False,"error":"self_buy","message":"نمی‌توانید آگهی کشور خودتان را قبول کنید."}, status=400)

    # Direction is important: for a sell order the owner sells to the visitor;
    # for a buy order the visitor sells to the owner.
    seller_cid = owner_cid if side == "sell" else actor_cid
    buyer_cid = actor_cid if side == "sell" else owner_cid
    # کشور تحریم‌شده در هیچ آگهی خریدی نمی‌تواند خریدار باشد.
    blockers = [by for by, targets in market_sanctions.items() if buyer_cid in (targets or [])]
    if blockers:
        names = "، ".join(COUNTRIES.get(by, {}).get("name", by) for by in blockers)
        return web.json_response({"success": False, "error": "sanctioned", "message": f"خرید این کشور به‌دلیل تحریم بازار ممکن نیست (تحریم‌کننده: {names})."}, status=403)
    _, seller = get_player_by_country(seller_cid); _, buyer = get_player_by_country(buyer_cid)
    if not seller or not buyer: return web.json_response({"success":False,"error":"player_gone","message":"یکی از کشورها دیگر بازیکن فعال ندارد."}, status=400)
    ensure_player_fields(seller); ensure_player_fields(buyer)
    accrue_player(seller); accrue_player(buyer)

    resource = l["sell_resource"] if side == "sell" else l["buy_resource"]
    amount = int(l["sell_amount"] if side == "sell" else l["buy_amount"])
    pay_res = l["want_resource"] if side == "sell" else l["offer_resource"]
    pay_amount = int(l["want_amount"] if side == "sell" else l["offer_amount"])
    escrowed = bool(l.get("escrowed"))
    payment_escrowed = side == "buy" and escrowed
    goods_escrowed = side == "sell" and escrowed

    route, route_err = _route_quote(seller_cid, buyer_cid, amount, data.get("mode"))
    if route_err: return web.json_response({"success":False,"error":"no_route","message":route_err}, status=400)
    try: expected_total = int(data.get("expected_total")) if data.get("expected_total") is not None else None
    except (TypeError, ValueError): expected_total = None
    if expected_total is not None and expected_total != route["transport_cost"]:
        return web.json_response({"success":False,"error":"price_changed",
            "message":f"هزینه حمل و عوارض تغییر کرده است (اکنون {route['transport_cost']:,}$). لطفاً دوباره بررسی و تأیید کنید."}, status=409)
    if not goods_escrowed and seller["resources"].get(resource, 0) < amount:
        return web.json_response({"success":False,"error":"seller_no_res","message":f"فروشنده فقط {seller['resources'].get(resource,0):,} واحد {RESOURCE_NAMES[resource]} دارد."}, status=400)

    if pay_res == "money":
        required_now = route["transport_cost"] + (0 if payment_escrowed else pay_amount)
        if buyer.get("money", 0) < required_now:
            return web.json_response({"success":False,"error":"not_enough_money",
                "message":f"خزانه برای معامله و حمل کافی نیست؛ موجودی {buyer.get('money',0):,}$، مبلغ معامله {0 if payment_escrowed else pay_amount:,}$ و حمل {route['transport_cost']:,}$ است."}, status=400)
    else:
        if not payment_escrowed and buyer["resources"].get(pay_res, 0) < pay_amount:
            return web.json_response({"success":False,"error":"not_enough_res","message":f"موجودی {RESOURCE_NAMES[pay_res]} برای پرداخت کافی نیست."}, status=400)
        if buyer.get("money", 0) < route["transport_cost"]:
            return web.json_response({"success":False,"error":"not_enough_money","message":f"هزینه حمل {route['transport_cost']:,}$ است و خزانه کافی نیست."}, status=400)

    if pay_res == "money":
        if not payment_escrowed: buyer["money"] -= pay_amount
        seller["money"] = seller.get("money", 0) + pay_amount
    else:
        if not payment_escrowed: buyer["resources"][pay_res] -= pay_amount
        seller["resources"][pay_res] = seller["resources"].get(pay_res, 0) + pay_amount
    buyer["money"] -= route["transport_cost"]

    if not goods_escrowed:
        seller["resources"][resource] = seller["resources"].get(resource, 0) - amount
    # کالا فوراً نمی‌رسد؛ زمان حمل بر اساس فاصله (۱ دقیقه تا ۳ ساعت) محاسبه می‌شود.
    travel_s = int(route.get("travel_seconds") or _trade_travel_seconds(seller_cid, buyer_cid, route.get("mode"), route.get("distance_km", 0)))
    arrive_at = utcnow() + timedelta(seconds=travel_s)
    buyer.setdefault("pending_deliveries", []).append({
        "id": str(uuid.uuid4()), "resource": resource, "amount": amount, "from": seller_cid, "to": buyer_cid,
        "mode": route.get("mode"), "straits": [s_.get("id") for s_ in route.get("strait_costs", [])], "start": utcnow().isoformat(), "arrive": arrive_at.isoformat()})
    l["status"] = "filled"; l["actor"] = actor_cid; l["route"] = route; l["filled_at"] = utcnow().isoformat()
    for s in route.get("strait_costs", []):
        owner = s.get("owner")
        if owner:
            _, sp = get_player_by_country(owner)
            if sp: sp["money"] = sp.get("money", 0) + s["cost"]
    push_news("معامله بازار جهانی", f"{COUNTRIES[buyer_cid]['name']} {amount:,} {RESOURCE_NAMES[resource]} را از {COUNTRIES[seller_cid]['name']} خرید؛ مسیر {route['mode']}، هزینه حمل {route['transport_cost']:,}$ (کرایه {route.get('freight_cost',0):,}$ + عوارض {route.get('toll',0):,}$) و زمان حمل حدود {fmt_duration_fa(travel_s)}.")
    save_state()
    return web.json_response({"success":True,"route":route,"transport_cost":route["transport_cost"],
                              "eta_seconds": travel_s, "eta_text": fmt_duration_fa(travel_s)})


async def set_strait_settings(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success":False,"error":"unauthorized"}, status=401)
    data = await read_json(request); sid = data.get("site_id")
    if sid not in STRAITS_DATA: return web.json_response({"success":False,"error":"invalid_site"}, status=400)
    cid = players.get(uid,{}).get("country")
    if strait_holdings.get(sid) != cid: return web.json_response({"success":False,"error":"not_owner","message":"فقط مالک تنگه می‌تواند تنظیمات آن را تغییر دهد."}, status=403)
    info = STRAITS_DATA[sid]
    rules = info.setdefault("country_rules", {})
    if not isinstance(rules, dict): rules = info["country_rules"] = {}

    country_id = data.get("country_id")

    # ---- پنل ساده: سه عمل بستن / عوارض / رایگان (عمومی یا اختصاصی یک کشور) ----
    action = data.get("action")
    if action in ("close", "toll", "free"):
        owner_name, sname = COUNTRIES[cid]["name"], info["name"]
        amount = 0
        if action == "toll":
            try: amount = int(data.get("toll"))
            except (TypeError, ValueError): amount = 0
            if amount <= 0:
                return web.json_response({"success": False, "error": "invalid_toll",
                                          "message": "مبلغ عوارض باید عدد صحیح و بزرگ‌تر از صفر باشد."}, status=400)

        def _after(old_toll, old_closed):
            if action == "close": return old_toll, True
            if action == "free": return 0, False
            return amount, False

        def _reply(msg, changed):
            return web.json_response({"success": True, "changed": changed, "message": msg,
                                      "toll": int(info.get("toll", 0) or 0), "closed": bool(info.get("closed", False)),
                                      "country_rules": rules})

        if country_id:
            if country_id not in COUNTRIES or country_id == cid:
                return web.json_response({"success": False, "error": "invalid_country", "message": "کشور انتخاب‌شده معتبر نیست."}, status=400)
            cn = COUNTRIES[country_id]["name"]
            cur = strait_policy(sid, country_id)
            new_toll, new_closed = _after(cur["toll"], cur["closed"])
            if (new_toll, new_closed) == (cur["toll"], cur["closed"]):
                return _reply("این وضعیت از قبل برای این کشور فعال است.", False)
            rule = dict(rules.get(country_id) or {})
            if action == "close": rule["closed"] = True
            else: rule["toll"], rule["closed"] = new_toll, False
            rules[country_id] = rule
            if action == "close":
                text = f"کشور {owner_name} {sname} را برای کشور {cn} بست."
            elif action == "free":
                text = f"کشور {owner_name} عبور کشور {cn} از {sname} را رایگان کرد."
            elif cur["toll"] > 0 and not cur["closed"]:
                text = f"کشور {owner_name} عوارض عبور کشور {cn} از {sname} را از {cur['toll']:,}$ به {amount:,}$ تغییر داد."
            else:
                text = f"کشور {owner_name} عوارض عبور کشور {cn} از {sname} را {amount:,}$ تعیین کرد."
            push_news("قانون ویژهٔ تنگه", text)
        else:
            old_toll, old_closed = int(info.get("toll", 0) or 0), bool(info.get("closed", False))
            new_toll, new_closed = _after(old_toll, old_closed)
            if (new_toll, new_closed) == (old_toll, old_closed):
                return _reply("این وضعیت از قبل فعال است.", False)
            info["toll"], info["closed"] = new_toll, new_closed
            if action == "close":
                text = f"کشور {owner_name} {sname} را بست."
            elif action == "free":
                text = f"کشور {owner_name} عبور از {sname} را رایگان کرد."
            elif old_toll > 0 and not old_closed:
                text = f"کشور {owner_name} عوارض عبور از {sname} را از {old_toll:,}$ به {amount:,}$ تغییر داد."
            else:
                text = f"کشور {owner_name} عوارض عبور از {sname} را {amount:,}$ تعیین کرد."
            push_news("تغییر وضعیت تنگه", text)
        save_state()                      # پیام فقط پس از ثبت موفق تغییر ارسال می‌شود
        _schedule_strait_broadcast(text)
        return _reply(text, True)

    if data.get("clear_country_rule"):
        if country_id not in COUNTRIES:
            return web.json_response({"success":False,"error":"invalid_country","message":"کشور انتخاب‌شده معتبر نیست."}, status=400)
        existed = rules.pop(country_id, None)
        if existed is None:
            return web.json_response({"success":True,"toll":int(info.get("toll",0) or 0),"closed":bool(info.get("closed",False)),"country_rules":rules,"message":"برای این کشور استثنایی ثبت نشده بود."})
        text = f"{COUNTRIES[cid]['name']} قانون ویژهٔ عبور از {info['name']} برای {COUNTRIES[country_id]['name']} را حذف کرد؛ قانون عمومی دوباره اعمال می‌شود."
        push_news("تغییر عوارض تنگه", text)
        _schedule_strait_broadcast(text)
        save_state()
        return web.json_response({"success":True,"toll":int(info.get("toll",0) or 0),"closed":bool(info.get("closed",False)),"country_rules":rules})

    try:
        toll = max(0, int(data.get("toll", info.get("toll", 0)) or 0))
    except (TypeError, ValueError):
        return web.json_response({"success":False,"error":"invalid_toll","message":"مبلغ عوارض باید عدد صحیح و غیرمنفی باشد."}, status=400)
    closed = bool(data.get("closed", info.get("closed", False)))

    if country_id:
        if country_id not in COUNTRIES:
            return web.json_response({"success":False,"error":"invalid_country","message":"کشور انتخاب‌شده معتبر نیست."}, status=400)
        old_rule = dict(rules.get(country_id) or {})
        rules[country_id] = {"toll": toll, "closed": closed}
        phrases = []
        if old_rule.get("toll") != toll:
            phrases.append("عوارض را رایگان کرد" if toll == 0 else f"عوارض را {toll:,}$ تعیین کرد")
        if old_rule.get("closed") != closed:
            phrases.append("عبور را بست" if closed else "عبور را باز کرد")
        if not phrases: phrases.append("قانون ویژهٔ عبور را ذخیره کرد")
        text = f"{COUNTRIES[cid]['name']} برای کشور {COUNTRIES[country_id]['name']} در {info['name']} {' و '.join(phrases)}؛ شرایط سایر کشورها تغییر نکرد."
        push_news("قانون ویژهٔ تنگه", text)
        _schedule_strait_broadcast(text)
    else:
        old_toll, old_closed = int(info.get("toll", 0) or 0), bool(info.get("closed", False))
        info["toll"] = toll; info["closed"] = closed
        phrases = []
        if old_toll != toll:
            phrases.append("عوارض عبور را برای همه رایگان کرد" if toll == 0 else f"عوارض عمومی عبور را {toll:,}$ تعیین کرد")
        if old_closed != closed:
            phrases.append("تنگه را برای همه کشورها بست" if closed else "تنگه را برای همه کشورها باز کرد")
        if not phrases: phrases.append("تنظیمات عمومی تنگه را ذخیره کرد")
        text = f"{COUNTRIES[cid]['name']} {' و '.join(phrases)}: {info['name']}. استثناهای هر کشور، در صورت وجود، جداگانه اعمال می‌شوند."
        push_news("تغییر عوارض تنگه", text)
        _schedule_strait_broadcast(text)

    save_state()
    return web.json_response({"success":True,"toll":int(info.get("toll",0) or 0),"closed":bool(info.get("closed",False)),"country_rules":rules})

async def set_border_settings(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success":False,"error":"unauthorized"}, status=401)
    if uid not in players: players[uid]=create_player(uid)
    p=players[uid];
    if not p.get("country"): return web.json_response({"success":False,"error":"no_country"}, status=400)
    open_=bool((await read_json(request)).get("open",True)); p["land_trade_open"]=open_
    push_news("مرز زمینی", f"{COUNTRIES[p['country']]['name']} مرزهای تجارت زمینی را {'باز' if open_ else 'بسته'} کرد.")
    save_state(); return web.json_response({"success":True,"open":open_})

# =========================================================
# API News / Rankings
# =========================================================
async def get_news(request):
    # برای ردیف‌های قدیمی بیانیه نیز متن قبلی را از خبر/اعلان پنهان می‌کنیم.
    rows = []
    for item in reversed(news_feed):
        row = dict(item)
        title = str(row.get("title", ""))
        if "بیانیه" in title:
            old_text = str(row.get("text", ""))
            prefix = old_text.split(":", 1)[0].strip() if ":" in old_text else ""
            if prefix and len(prefix) <= 80 and not prefix.startswith("کشور"):
                row["text"] = f"کشور «{prefix}» بیانیه‌ای منتشر کرد؛ متن فقط در بخش بیانیه‌ها قابل مشاهده است."
            else:
                row["text"] = "بیانیه‌ای منتشر شد؛ متن فقط در بخش بیانیه‌ها قابل مشاهده است."
            row["title"] = "بیانیه"
        if not row.get("countries"):
            det = _detect_news_countries(row.get("title"), row.get("text"))
            if det: row["countries"] = det
        rows.append(row)
    return web.json_response(rows or [
        {"title": "سال ۱۹۳۶", "text": "جهان در آستانه یک بحران بزرگ قرار دارد."}])

def compute_rankings():
    rows = []
    for uid, p in players.items():
        cid = p.get("country")
        if not cid or p.get("is_eliminated"):
            continue
        ensure_player_fields(p); recompute_army(p); rates = compute_rates(p)
        eco = max(0, int(rates["net_income"] // 1000)); mil = p.get("army", 0)
        dev = sum(p.get("infra_levels", {}).values()) * 50
        terr = (sum(1 for o in map_holdings.values() if o == cid)
                + sum(1 for o in strait_holdings.values() if o == cid)
                + 5 * sum(1 for o in occupied_countries.values() if o == cid))
        rows.append({"country": cid, "name": COUNTRIES[cid]["name"], "flag": COUNTRIES[cid]["flag"],
                     "economy": eco, "military": mil, "territory": terr,
                     "development": dev, "is_eliminated": False})
    weights = {"economy": 35, "military": 30, "territory": 20, "development": 15}
    maxima = {key: max([row[key] for row in rows] + [0]) for key in weights}
    for row in rows:
        row["overall"] = round(sum(weights[key] * row[key] / maxima[key] for key in weights if maxima[key] > 0), 1)
    rows.sort(key=lambda row: row["overall"], reverse=True)
    for i, row in enumerate(rows): row["rank"] = i + 1
    meta = _world_meta()
    winner = meta.get("winner") or {}
    if meta.get("game_finished") and winner:
        for row in rows:
            row["winner"] = row["country"] == winner.get("country")
    return rows

async def get_rankings(request):
    return web.json_response(compute_rankings())

# =========================================================
# Health / Debug
# =========================================================
# =========================================================
# Loans (وام بین کشورها)
# =========================================================
def _game_window():
    started = parse_dt(_world_meta().get("game_started_at"))
    if not started: return None, None
    return started, started + timedelta(days=GAME_TOTAL_DAYS)

def loan_rate_for_hours(hours):
    steps = int(hours // LOAN_INTEREST_STEP_HOURS)
    return min(steps * LOAN_INTEREST_PER_STEP, LOAN_MAX_HOURS // LOAN_INTEREST_STEP_HOURS * LOAN_INTEREST_PER_STEP)

def loan_max_hours_now():
    _, end = _game_window()
    if not end: return float(LOAN_MAX_HOURS)
    left = (end - timedelta(seconds=LOAN_END_MARGIN_SECONDS) - utcnow()).total_seconds() / 3600
    return max(0.0, min(float(LOAN_MAX_HOURS), left))

def loan_lending_open():
    """(open, reason)"""
    start, end = _game_window()
    if not start: return False, "بازی هنوز شروع نشده است."
    now = utcnow()
    if now >= end - timedelta(seconds=LOAN_END_MARGIN_SECONDS):
        return False, "وام‌دهی بسته شده است؛ جنگ جهانی نزدیک است."
    return True, ""

def _is_vip(p): return bool(p and p.get("vip"))

def _active_debt(cid):
    for l in loans.values():
        if l["borrower"] == cid and l["status"] in ("active", "overdue"): return l
    return None

def _loan_fee_rates(lender_p, borrower_p, hours):
    if hours < LOAN_INTEREST_STEP_HOURS: return 0.0, 0.0   # وام زیر ۱۲ ساعت بدون کارمزد
    return (0.0 if _is_vip(lender_p) else LOAN_FEE), (0.0 if _is_vip(borrower_p) else LOAN_FEE)

def _daily_income(p):
    ensure_player_fields(p); recompute_army(p)
    return max(0.0, compute_rates(p)["net_income"])

def loan_lender_cap(p): return int(_daily_income(p) * LOAN_CAP_FRACTION)

def _loan_check(lender_cid, borrower_cid, amount, hours, ignore_pending_id=None):
    """اعتبارسنجی کامل؛ پیام خطا یا None."""
    ok, why = loan_lending_open()
    if not ok: return why
    if lender_cid == borrower_cid: return "نمی‌توانید به خودتان وام بدهید."
    lu, lp = get_player_by_country(lender_cid); bu, bp = get_player_by_country(borrower_cid)
    if not lp or lp.get("is_eliminated"): return "کشور وام‌دهنده معتبر نیست."
    if not bp or bp.get("is_eliminated"): return "کشور وام‌گیرنده معتبر نیست."
    if _active_debt(lender_cid): return "تا تسویه وام فعلی‌تان نمی‌توانید وام بدهید."
    if _active_debt(borrower_cid): return "این کشور هم‌اکنون یک وام تسویه‌نشده دارد."
    if amount <= 0: return "مبلغ نامعتبر است."
    maxh = loan_max_hours_now()
    if hours <= 0 or hours > maxh + 1e-9: return f"مهلت باید حداکثر {maxh:.1f} ساعت باشد."
    accrue_player(lp); accrue_player(bp)
    cap = loan_lender_cap(lp)
    if amount > cap: return f"مبلغ از سقف هر وام ({cap:,}$) بیشتر است."
    if lp.get("money", 0) < amount: return "موجودی خزانه برای این وام کافی نیست."
    repay = amount * (1 + loan_rate_for_hours(hours))
    ability = bp.get("money", 0) + _daily_income(bp) * hours / 24
    if ability < repay: return "وام‌گیرنده با خزانه و درآمدش نمی‌تواند در این مهلت بازپرداخت کند."
    return None

def _lname(cid): return f"{COUNTRIES[cid]['flag']} {COUNTRIES[cid]['name']}" if cid in COUNTRIES else "—"

async def notify_user(uid, text):
    try: await _tg_send(uid, text)
    except Exception as e: logging.warning("notify_user %s: %s", uid, e)

def _credit_lender(l, amount):
    """بازگشت پول به وام‌دهنده (کارمزد ۵٪ از دریافت)."""
    _, lp = get_player_by_country(l["lender"])
    if lp is None: return
    lp["money"] = lp.get("money", 0) + amount * (1 - l.get("fee_lender", 0))

def _apply_payment(l, amount):
    amount = min(amount, l["remaining"])
    if amount <= 0: return 0
    _credit_lender(l, amount)
    l["remaining"] = max(0.0, l["remaining"] - amount)
    l["paid"] = l.get("paid", 0) + amount
    if l["remaining"] <= 0.5:
        l["remaining"] = 0.0; l["status"] = "settled"; l["settled_at"] = utcnow().isoformat()
        push_news("تسویه وام", f"{_lname(l['borrower'])} وام خود از {_lname(l['lender'])} را تسویه کرد.")
    return amount

def loan_garnish(player, available):
    """وام معوق: تا تسویه، درآمد وام‌گیرنده به وام‌دهنده می‌رسد. مقدار برداشت‌شده را برمی‌گرداند."""
    cid = player.get("country")
    if not cid or available <= 0: return 0
    l = _active_debt(cid)
    if not l or l["status"] != "overdue": return 0
    return _apply_payment(l, available)

def _purge_cancelled_loans():
    """وام‌های لغوشده (cancelled و cancelled_*) کلاً از حافظه و دفتر حذف می‌شوند."""
    dead = [k for k, l in loans.items() if str(l.get("status", "")).startswith("cancelled")]
    for k in dead: del loans[k]
    return bool(dead)

def loan_tick():
    if _purge_cancelled_loans(): save_state()
    meta = _world_meta()
    started = parse_dt(meta.get("game_started_at"))
    if not started or meta.get("game_finished") or utcnow() >= started + timedelta(days=GAME_TOTAL_DAYS):
        return
    now = utcnow(); changed = False
    _, end = _game_window()
    lending_ok, _why = loan_lending_open()
    for l in list(loans.values()):
        if l["status"] == "pending":
            created = parse_dt(l["created_at"])
            if (created and now - created > timedelta(hours=LOAN_PENDING_TTL_HOURS)) or not lending_ok:
                l["status"] = "expired"; l["closed_at"] = now.isoformat(); changed = True
        elif l["status"] == "active":
            due = parse_dt(l["due_at"])
            if due and now >= due:
                _, bp = get_player_by_country(l["borrower"])
                if bp is not None: accrue_player(bp)
                pay = min(bp.get("money", 0) if bp else 0, l["remaining"])
                if bp is not None: bp["money"] = bp.get("money", 0) - pay
                _apply_payment(l, pay)
                if l["status"] != "settled":
                    l["status"] = "overdue"
                    push_news("وام معوق", f"{_lname(l['borrower'])} نتوانست وام خود را کامل بپردازد؛ درآمدش تا تسویه به {_lname(l['lender'])} می‌رسد.", "warning")
                changed = True
    if changed: save_state()

def _loan_view(l, my_cid):
    ts = l.get("settled_at") or l.get("closed_at") or l.get("accepted_at") or l["created_at"]
    v = {"id": l["id"], "lender": l["lender"], "borrower": l["borrower"],
         "lender_name": COUNTRIES[l["lender"]]["name"], "lender_flag": COUNTRIES[l["lender"]]["flag"],
         "borrower_name": COUNTRIES[l["borrower"]]["name"], "borrower_flag": COUNTRIES[l["borrower"]]["flag"],
         "amount": l["amount"], "hours": l["hours"], "rate": round(l["rate"] * 100),
         "repay": l["repay"], "remaining": l.get("remaining", l["repay"]), "early": l["early"],
         "status": l["status"], "at": ts, "due_at": l.get("due_at"),
         "role": "lender" if l["lender"] == my_cid else ("borrower" if l["borrower"] == my_cid else None)}
    v["can_accept"] = l["status"] == "pending" and l["borrower"] == my_cid
    v["can_cancel"] = l["status"] == "pending" and l["lender"] == my_cid
    v["can_repay"] = l["status"] == "active" and l["borrower"] == my_cid and l["early"]
    return v

async def get_loans(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    p = _me(uid); cid = p.get("country")
    if not cid: return web.json_response({"error": "no_country"}, status=400)
    loan_tick(); accrue_player(p)
    is_open, reason = loan_lending_open()
    debt = _active_debt(cid)
    block = reason if not is_open else ("تا تسویه وام فعلی‌تان نمی‌توانید وام بدهید." if debt else "")
    opts = []
    for ouid, op in players.items():
        oc = op.get("country")
        if oc and oc != cid and not op.get("is_eliminated"):
            opts.append({"id": oc, "name": COUNTRIES[oc]["name"], "flag": COUNTRIES[oc]["flag"],
                         "busy": _active_debt(oc) is not None})
    rows = sorted(loans.values(), key=lambda x: x["created_at"], reverse=True)
    return web.json_response({
        "now": utcnow().isoformat(), "my_country": cid, "lending_open": is_open and not debt,
        "block_reason": block, "cap": loan_lender_cap(p), "max_hours": round(loan_max_hours_now(), 2),
        "vip": _is_vip(p), "countries": opts, "owes": debt["remaining"] if debt else 0,
        "mine": [_loan_view(l, cid) for l in rows if cid in (l["lender"], l["borrower"])][:60],
        "book": [_loan_view(l, cid) for l in rows][:100]})

async def propose_loan(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "message": "unauthorized"}, status=401)
    p = _me(uid); cid = p.get("country")
    if not cid: return _bad("ابتدا کشور انتخاب کنید.")
    data = await read_json(request); to = data.get("to")
    try: amount = int(float(data.get("amount", 0))); hours = float(data.get("hours", 0))
    except Exception: return _bad("مقدار نامعتبر است.")
    if to not in COUNTRIES: return _bad("کشور وام‌گیرنده را انتخاب کنید.")
    loan_tick()
    err = _loan_check(cid, to, amount, hours)
    if err: return _bad(err)
    rate = loan_rate_for_hours(hours)
    lid = str(uuid.uuid4())
    loans[lid] = {"id": lid, "lender": cid, "borrower": to, "amount": amount, "hours": hours,
                  "rate": rate, "repay": round(amount * (1 + rate)), "remaining": round(amount * (1 + rate)),
                  "early": bool(data.get("early")), "status": "pending", "created_at": utcnow().isoformat()}
    save_state()
    bu, _ = get_player_by_country(to)
    if bu: await notify_user(bu, f"💰 {_lname(cid)} پیشنهاد وام {amount:,}$ با مهلت {hours:g} ساعت و بازپرداخت {loans[lid]['repay']:,}$ داد. از بخش وام پاسخ دهید.")
    return web.json_response({"success": True, "message": "پیشنهاد وام ارسال شد."})

async def respond_loan(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "message": "unauthorized"}, status=401)
    p = _me(uid); cid = p.get("country"); data = await read_json(request)
    l = loans.get(data.get("loan_id"))
    if not l or l["status"] != "pending": return _bad("پیشنهاد معتبر نیست.", 404)
    if l["borrower"] != cid: return _bad("این پیشنهاد برای شما نیست.", 403)
    if not data.get("accept"):
        l["status"] = "declined"; l["closed_at"] = utcnow().isoformat(); save_state()
        lu, _ = get_player_by_country(l["lender"])
        if lu: await notify_user(lu, f"❌ {_lname(cid)} پیشنهاد وام شما را رد کرد.")
        return web.json_response({"success": True, "message": "پیشنهاد رد شد."})
    err = _loan_check(l["lender"], cid, l["amount"], l["hours"])
    if err: return _bad(err)
    _, lp = get_player_by_country(l["lender"]); bp = p
    fee_l, fee_b = _loan_fee_rates(lp, bp, l["hours"])
    now = utcnow()
    lp["money"] -= l["amount"]
    bp["money"] = bp.get("money", 0) + l["amount"] * (1 - fee_b)
    l.update({"status": "active", "accepted_at": now.isoformat(),
              "due_at": (now + timedelta(hours=l["hours"])).isoformat(),
              "fee_lender": fee_l, "fee_borrower": fee_b, "remaining": l["repay"]})
    push_news("وام جدید", f"{_lname(l['lender'])} به {_lname(cid)} مبلغ {l['amount']:,}$ وام داد.")
    save_state()
    lu, _ = get_player_by_country(l["lender"])
    if lu: await notify_user(lu, f"✅ {_lname(cid)} وام {l['amount']:,}$ را پذیرفت.")
    return web.json_response({"success": True, "message": f"وام دریافت شد (کارمزد {fee_b*100:g}٪)."})

async def cancel_loan(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "message": "unauthorized"}, status=401)
    p = _me(uid); cid = p.get("country"); data = await read_json(request)
    l = loans.get(data.get("loan_id"))
    if not l or l["status"] != "pending": return _bad("پیشنهاد معتبر نیست.", 404)
    if l["lender"] != cid: return _bad("این پیشنهاد مال شما نیست.", 403)
    del loans[l["id"]]; save_state()
    return web.json_response({"success": True, "message": "پیشنهاد لغو شد."})

async def repay_loan(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "message": "unauthorized"}, status=401)
    p = _me(uid); cid = p.get("country"); data = await read_json(request)
    l = loans.get(data.get("loan_id"))
    if not l or l["status"] != "active": return _bad("وام فعالی پیدا نشد.", 404)
    if l["borrower"] != cid: return _bad("این وام مال شما نیست.", 403)
    if not l["early"]: return _bad("این وام فقط سر موعد قابل بازپرداخت است.")
    accrue_player(p)
    if p.get("money", 0) < l["remaining"]: return _bad("موجودی خزانه برای بازپرداخت کافی نیست.")
    p["money"] -= l["remaining"]; _apply_payment(l, l["remaining"]); save_state()
    return web.json_response({"success": True, "message": "وام تسویه شد."})

async def vip_command(message: types.Message):
    if not ADMIN_ID or message.from_user.id != ADMIN_ID: return
    parts = (message.text or "").split()
    if len(parts) < 2: await message.answer("/vip <user_id> [on|off] [world_id]"); return
    try: tid = int(parts[1])
    except ValueError: await message.answer("user_id نامعتبر"); return
    on, wid = True, "1"
    for tok in parts[2:]:
        if tok.lower() == "off": on = False
        elif tok.lower() == "on": on = True
        elif tok.isdigit(): wid = str(int(tok))
        else: await message.answer("/vip <user_id> [on|off] [world_id]"); return
    if wid not in worlds_registry: await message.answer("دنیا پیدا نشد"); return
    found = False
    async with WORLD_SWITCH_LOCK:
        previous = str(active_world_id)
        _persist_active_world_memory()
        try:
            if _activate_world(wid) and tid in players:
                players[tid]["vip"] = on
                save_state()
                found = True
        finally:
            _persist_active_world_memory()
            _activate_world(previous if previous in worlds_registry else "1")
    if not found: await message.answer("بازیکن پیدا نشد"); return
    await message.answer(f"VIP {'فعال' if on else 'غیرفعال'} شد برای {tid} (دنیا {wid})")

# =========================================================
# Stats (آمار کشور: رفاه و امنیت)
# =========================================================
async def welfare_tick():
    import random
    meta = _world_meta()
    started = parse_dt(meta.get("game_started_at"))
    if not started or meta.get("game_finished") or utcnow() >= started + timedelta(days=GAME_TOTAL_DAYS):
        return
    now = utcnow(); changed = False
    for uid_, p in players.items():
        cid = p.get("country")
        if not cid or not p.get("started_at") or p.get("is_eliminated"): continue
        ensure_player_fields(p)
        pens = p.get("welfare_penalties")
        if pens:   # پاک‌کردن خسارت‌های تمام‌شده
            alive = [x for x in pens if (parse_dt(x.get("until")) or now) > now]
            if len(alive) != len(pens): p["welfare_penalties"] = alive; changed = True
        nxt = parse_dt(p.get("welfare_next_at"))
        if nxt is None:
            p["welfare_next_at"] = (now + timedelta(hours=random.uniform(1, WELFARE_EVENT_MAX_H - 2))).isoformat()
            changed = True; continue
        if now < nxt: continue
        p["welfare_next_at"] = (now + timedelta(hours=random.uniform(WELFARE_EVENT_MIN_H, WELFARE_EVENT_MAX_H))).isoformat()
        changed = True
        gross = welfare_gross(p)
        if gross <= 0: continue                                            # رفاهی نیست که آسیب ببیند
        risks = COUNTRY_RISKS.get(cid, [])
        keys = list(WELFARE_EVENTS)
        key = random.choices(keys, weights=[3 if k in risks else 1 for k in keys])[0]
        ev = WELFARE_EVENTS[key]
        lvl = min(get_infra_level(p, ev["bld"]), len(INFRASTRUCTURE[ev["bld"]]["levels"]))
        # هرچه رفاه بالاتر باشد احتمال وقوع رویداد کمتر می‌شود (تا ۱۵٪ شانس پایه)
        chance = ev["chance"] * max(0.15, 1 - 0.85 * gross / WELFARE_MAX)
        if random.random() > chance: continue
        drop = max(1.0, ev["drop"] * (1 - 0.12 * lvl))                    # ساختمان مرتبط افت را کم می‌کند
        cur_pen = welfare_penalty_now(p)
        eff = max(0.0, min(drop, gross - cur_pen))                        # نه زیرِ صفر
        if eff < 0.05: continue
        hours = ev.get("hours", 2)
        until = now + timedelta(hours=hours)
        p.setdefault("welfare_penalties", []).append({"key": key, "amt": round(eff, 2), "until": until.isoformat()})
        bname = INFRASTRUCTURE[ev["bld"]]["name"]
        hlabel = f"{hours:g}"
        text = f"{ev['icon']} {ev['name']} — رفاه {eff:.1f} واحد موقتاً کم شد (حدود {hlabel} ساعت) ({bname} سطح {lvl} از 5)"
        evs = p.setdefault("welfare_events", [])
        evs.append({"at": now.isoformat(), "text": text, "key": key, "drop": round(eff, 2), "until": until.isoformat()})
        del evs[:-30]
        await notify_user(uid_, f"{ev['icon']} {ev['name']} در کشور شما رخ داد!\nرفاه و امنیت کشور {eff:.1f}٪ موقتاً کاهش یافت و حدود {hlabel} ساعت دیگر به حالت عادی برمی‌گردد.")
    if changed: save_state()

async def get_stats(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    p = _me(uid); cid = p.get("country")
    if not cid: return web.json_response({"error": "no_country"}, status=400)
    rates = compute_rates(p)
    gross, pen = welfare_gross(p), welfare_penalty_now(p)
    bonus = max(0.0, gross - pen)
    eco_base = rates["economy_income"]
    blds = []
    for bid, item in INFRASTRUCTURE.items():
        if item.get("group") != "welfare": continue
        blds.append({"id": bid, "name": item["name"], "icon": item["icon"],
                     "level": min(get_infra_level(p, bid), len(item["levels"])), "max_level": len(item["levels"])})
    upkeep_items = []
    group_titles = {"power": "برق", "manpower": "نیروی انسانی", "resource": "منابع", "land": "نیروی زمینی",
                    "naval": "نیروی دریایی", "air": "نیروی هوایی", "missile": "موشکی", "strategy": "استراتژیک", "welfare": "رفاه و امنیت"}
    for bid, item in INFRASTRUCTURE.items():
        lv = min(get_infra_level(p, bid), len(item["levels"]))
        if lv <= 0: continue
        cost = infra_upkeep(item, lv)
        if cost <= 0: continue
        upkeep_items.append({"id": bid, "name": item["name"], "icon": item.get("icon", "🏗️"),
                             "group": group_titles.get(item.get("group"), "زیرساخت"), "amount": cost})
    for bid, item in ECONOMY.items():
        lv = min(get_infra_level(p, bid), len(item["levels"]))
        cost = infra_upkeep(item, lv)
        if lv <= 0 or cost <= 0: continue
        upkeep_items.append({"id": bid, "name": item["name"], "icon": item.get("icon", "💼"),
                             "group": "اقتصاد", "amount": cost})
    upkeep_items.sort(key=lambda x: x["amount"], reverse=True)
    return web.json_response({
        "now": utcnow().isoformat(), "bonus": round(bonus, 1), "gross": round(gross, 1),
        "penalty": round(min(pen, gross), 1), "max": WELFARE_MAX, "eco_base": eco_base,
        "extra_income": int(round(rates["welfare_extra_income"])), "buildings": blds,
        "income_base": rates["base_income"], "income_economy": rates["economy_income"],
        "income_map": rates["map_income"], "income_straits": rates["strait_income"],
        "income_occupation": rates["occupation_income"],
        "income_before_welfare": rates["income_before_welfare"],
        "welfare_extra_income": rates["welfare_extra_income"],
        "season": rates.get("season"), "season_income_pct": rates.get("season_income_pct", 0),
        "season_income_loss": rates.get("season_income_loss", 0),
        "season_consumption_extra": rates.get("season_consumption_extra", {}),
        "season_consumption_pct": rates.get("season_consumption_pct", {}),
        "total_income": rates["gross_income"], "daily_upkeep": rates["daily_upkeep"],
        "net_income": rates["net_income"], "upkeep_items": upkeep_items,
        "risks": [WELFARE_EVENTS[k]["name"] for k in COUNTRY_RISKS.get(cid, [])],
        "events": list(reversed(p.get("welfare_events", [])))[:20]})

async def health(request):
    return web.json_response({"status": "ok", "players": len(players)})

def _strict_telegram_uid(request):
    """Admin APIs only accept a valid Telegram WebApp signature without creating a player in the selected world."""
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    user = verify_init_data(init_data)
    try:
        return int(user["id"]) if user and user.get("id") else None
    except (TypeError, ValueError, KeyError):
        return None


def _admin_denied(request):
    uid = _strict_telegram_uid(request)
    if uid is None:
        return web.json_response({"success": False, "error": "telegram_auth_required", "message": "از داخل تلگرام وارد شوید."}, status=401)
    if uid != ADMIN_ID:
        return web.json_response({"success": False, "error": "forbidden", "message": "دسترسی به پنل مدیریت ندارید."}, status=403)
    return None


def _admin_player_row(uid, p):
    ensure_player_fields(p)
    rates = compute_rates(p)
    cid = p.get("country")
    return {
        "user_id": int(uid), "country": cid,
        "country_name": COUNTRIES.get(cid, {}).get("name", "بدون کشور"),
        "country_flag": COUNTRIES.get(cid, {}).get("flag", "🌐"),
        "telegram_first_name": str(p.get("telegram_first_name", "") or ""),
        "telegram_last_name": str(p.get("telegram_last_name", "") or ""),
        "telegram_name": " ".join(x for x in [str(p.get("telegram_first_name", "") or "").strip(), str(p.get("telegram_last_name", "") or "").strip()] if x),
        "telegram_username": str(p.get("telegram_username", "") or ""),
        "telegram_language_code": str(p.get("telegram_language_code", "") or ""),
        "last_seen_at": p.get("last_seen_at"),
        "is_online": bool(parse_dt(p.get("last_seen_at")) and (utcnow() - parse_dt(p.get("last_seen_at"))).total_seconds() <= 120),
        "started_at": p.get("started_at"),
        "infra_levels": dict(p.get("infra_levels", {}) or {}), "units": dict(p.get("units", {}) or {}),
        "economy_levels": {key: int((p.get("infra_levels", {}) or {}).get(key, 0) or 0) for key in ECONOMY},
        "building_catalog": {key: {"name": item.get("name", key), "group": "economy" if key in ECONOMY else "infrastructure",
                                    "max_level": len(item.get("levels", []))}
                             for key, item in {**INFRASTRUCTURE, **ECONOMY}.items()},
        "army_catalog": {key: {"name": item.get("name", key), "group": item.get("group", "")}
                         for key, item in ARMY_UNITS.items()},
        "army_units": dict(p.get("units", {}) or {}),
        "money": int(p.get("money", 0) or 0), "manpower": int(p.get("manpower", 0) or 0),
        "resources": {k: int((p.get("resources") or {}).get(k, 0) or 0) for k in RESOURCE_NAMES},
        "daily_income": int(round(rates.get("net_income", 0) or 0)),
        "army": int(p.get("army", 0) or 0), "vip": bool(p.get("vip")),
        "is_eliminated": bool(p.get("is_eliminated")), "started": bool(p.get("started_at")),
        "owned_sites": [{"id": sid, "name": info.get("name", sid), "type": info.get("type", "resource"),
                          "production": int(info.get("production", 0) or 0)}
                         for sid, info in MAP_RESOURCES.items() if map_holdings.get(sid) == cid],
        "owned_straits": [{"id": sid, "name": info.get("name", sid), "toll": int(info.get("toll", 0) or 0)}
                           for sid, info in STRAITS_DATA.items() if strait_holdings.get(sid) == cid],
        "garrisons": [{"id": sid, "name": (MAP_RESOURCES.get(sid) or STRAITS_DATA.get(sid) or {}).get("name", sid),
                       "units": dict((garrison_data or {}).get("units", {}) or {}),
                       "owner": (garrison_data or {}).get("owner")}
                      for sid, garrison_data in site_forces.items() if (garrison_data or {}).get("owner") == cid],
        "loans": [{"id": l.get("id"), "lender": l.get("lender"), "borrower": l.get("borrower"),
                   "amount": int(l.get("amount", 0) or 0), "remaining": int(l.get("remaining", 0) or 0),
                   "status": l.get("status", "unknown")}
                  for l in loans.values() if cid and cid in (l.get("lender"), l.get("borrower"))],
        "market_listings": [{"id": l.get("id"), "side": l.get("side", "sell"), "status": l.get("status", "unknown"),
                             "resource": l.get("sell_resource") if l.get("side", "sell") == "sell" else l.get("buy_resource"),
                             "amount": int(l.get("sell_amount", 0) if l.get("side", "sell") == "sell" else l.get("buy_amount", 0) or 0)}
                            for l in market_listings.values() if cid and cid in (l.get("seller"), l.get("buyer"))],
        "wars": [{"id": w.get("id"), "attacker": w.get("attacker"), "defender": w.get("defender"),
                  "status": w.get("status"), "reason": w.get("reason", "")}
                 for w in war_declarations.values() if cid and cid in (w.get("attacker"), w.get("defender"))],
        "started_at": p.get("started_at"), "last_update": p.get("last_update"),
    }


async def admin_overview(request):
    denied = _admin_denied(request)
    if denied: return denied
    rows = []
    for uid, p in players.items():
        try:
            accrue_player(p)
            rows.append(_admin_player_row(uid, p))
        except Exception as exc:
            logging.warning("admin overview player %s: %s", uid, exc)
    rows.sort(key=lambda item: (item.get("country") is None, item.get("country_name", ""), item["user_id"]))
    taken = len({r["country"] for r in rows if r.get("country")} | set(occupied_countries.keys()))
    total_money = sum(r["money"] for r in rows)
    if rows: save_state()
    recent = []
    for item in list(reversed(news_feed[-15:])):
        recent.append({"title": str(item.get("title", "خبر")), "text": str(item.get("text", "")),
                       "at": item.get("at", ""), "category": item.get("category", "general")})
    now = utcnow()
    active_cutoff = now - timedelta(minutes=15)
    active_count = 0
    for row in rows:
        seen = parse_dt(row.get("last_seen_at")) if row.get("last_seen_at") else None
        if seen and seen >= active_cutoff:
            active_count += 1
    return web.json_response({"success": True, "world_id": int(active_world_id), "world_name": worlds_registry.get(str(active_world_id), {}).get("name", f"دنیای {active_world_id}"), "players": rows, "countries_taken": taken,
                              "total_money": total_money,
                              "total_daily_income": sum(int(r.get("daily_income", 0) or 0) for r in rows),
                              "vip_count": sum(1 for r in rows if r.get("vip")),
                              "eliminated_count": sum(1 for r in rows if r.get("is_eliminated")),
                              "countryless_count": sum(1 for r in rows if not r.get("country")),
                              "active_count": active_count,
                              "recent_news": recent, "admin_audit": list(reversed(admin_audit[-60:]))})


async def admin_update_player(request):
    denied = _admin_denied(request)
    if denied: return denied
    data = await read_json(request)
    try: target_uid = int(data.get("user_id"))
    except (TypeError, ValueError): return web.json_response({"success": False, "message": "شناسهٔ بازیکن نامعتبر است."}, status=400)
    p = players.get(target_uid)
    if not p: return web.json_response({"success": False, "message": "بازیکن پیدا نشد."}, status=404)
    field = str(data.get("field", ""))
    allowed_numeric = {"money", "manpower", "food", "steel", "uranium", "oil"}
    if field in allowed_numeric:
        try: value = int(data.get("value"))
        except (TypeError, ValueError): return web.json_response({"success": False, "message": "مقدار عددی معتبر وارد کن."}, status=400)
        if value < 0 or value > 1_000_000_000_000_000:
            return web.json_response({"success": False, "message": "مقدار باید بین صفر و سقف مجاز باشد."}, status=400)
        accrue_player(p)
        if field == "money": p["money"] = value
        elif field == "manpower": p["manpower"] = value
        else:
            ensure_player_fields(p)
            p.setdefault("resources", {})[field] = value
    elif field == "country":
        value = str(data.get("value") or "").strip() or None
        if value and value not in COUNTRIES:
            return web.json_response({"success": False, "message": "کشور انتخاب‌شده معتبر نیست."}, status=400)
        if value and any(int(other_uid) != target_uid and other.get("country") == value for other_uid, other in players.items()):
            return web.json_response({"success": False, "message": "این کشور در اختیار بازیکن دیگری است."}, status=409)
        p["country"] = value
        if value and not p.get("started_at"): p["started_at"] = utcnow().isoformat()
    elif field in ("vip", "is_eliminated"):
        value = data.get("value")
        if not isinstance(value, bool): return web.json_response({"success": False, "message": "وضعیت ارسالی نامعتبر است."}, status=400)
        p[field] = value
    else:
        return web.json_response({"success": False, "message": "این نوع تغییر مجاز نیست."}, status=400)
    log_admin_action("ویرایش بازیکن", target_uid, f"field={field}; value={value}")
    save_state()
    logging.info("ADMIN %s updated player=%s field=%s", ADMIN_ID, target_uid, field)
    return web.json_response({"success": True, "message": "تغییرات بازیکن ذخیره شد.", "player": _admin_player_row(target_uid, p)})


async def admin_player_adjust(request):
    denied = _admin_denied(request)
    if denied: return denied
    data = await read_json(request)
    try:
        target_uid = int(data.get("user_id")); amount = int(data.get("amount"))
    except (TypeError, ValueError):
        return web.json_response({"success": False, "message": "شناسه و مقدار معتبر وارد کن."}, status=400)
    field = str(data.get("field", ""))
    operation = str(data.get("operation", "add"))
    resource_fields = {"money", "manpower", "food", "steel", "uranium", "oil"}
    if not (field in resource_fields or field.startswith("unit:") or field.startswith("building:")):
        return web.json_response({"success": False, "message": "مورد انتخاب‌شده معتبر نیست."}, status=400)
    if amount <= 0 or amount > 1_000_000_000_000_000 or operation not in {"add", "subtract"}:
        return web.json_response({"success": False, "message": "مقدار یا نوع عملیات معتبر نیست."}, status=400)
    p = players.get(target_uid)
    if not p:
        return web.json_response({"success": False, "message": "بازیکن پیدا نشد."}, status=404)
    delta = amount if operation == "add" else -amount
    if field in resource_fields:
        if field == "money":
            accrue_player(p)
            current = int(p.get("money", 0) or 0)
            next_value = current + delta
            if next_value < 0: return web.json_response({"success": False, "message": "خزانه برای این کسر کافی نیست."}, status=409)
            p["money"] = next_value
        elif field == "manpower":
            current = int(p.get("manpower", 0) or 0)
            next_value = current + delta
            if next_value < 0: return web.json_response({"success": False, "message": "نیروی انسانی برای این کسر کافی نیست."}, status=409)
            p["manpower"] = next_value
        else:
            ensure_player_fields(p)
            resources = p.setdefault("resources", {})
            current = int(resources.get(field, 0) or 0)
            next_value = current + delta
            if next_value < 0: return web.json_response({"success": False, "message": "موجودی منبع برای این کسر کافی نیست."}, status=409)
            resources[field] = next_value
    elif field.startswith("unit:"):
        unit_key = field.split(":", 1)[1]
        if unit_key not in ARMY_UNITS:
            return web.json_response({"success": False, "message": "یگان انتخاب‌شده معتبر نیست."}, status=400)
        ensure_player_fields(p)
        units = p.setdefault("units", {})
        next_value = int(units.get(unit_key, 0) or 0) + delta
        if next_value < 0: return web.json_response({"success": False, "message": "تعداد این یگان برای کسر کافی نیست."}, status=409)
        if next_value > 1_000_000_000: return web.json_response({"success": False, "message": "تعداد یگان از سقف مجاز بیشتر است."}, status=400)
        units[unit_key] = next_value
        recompute_army(p)
    else:
        building_key = field.split(":", 1)[1]
        catalog = {**INFRASTRUCTURE, **ECONOMY}
        if building_key not in catalog:
            return web.json_response({"success": False, "message": "ساختمان انتخاب‌شده معتبر نیست."}, status=400)
        ensure_player_fields(p)
        levels = p.setdefault("infra_levels", {})
        current = int(levels.get(building_key, 0) or 0)
        next_value = current + delta
        max_level = len(catalog[building_key].get("levels", []))
        if next_value < 0 or next_value > max_level:
            return web.json_response({"success": False, "message": f"سطح مجاز این ساختمان بین صفر و {max_level} است."}, status=409)
        levels[building_key] = next_value
    log_admin_action("تغییر سریع موجودی", target_uid, f"{field} {operation} {amount}; new={next_value}")
    save_state()
    return web.json_response({"success": True, "message": "موجودی با موفقیت به‌روزرسانی شد.", "player": _admin_player_row(target_uid, p)})

async def admin_player_message(request):
    denied = _admin_denied(request)
    if denied: return denied
    data = await read_json(request)
    try: target_uid = int(data.get("user_id"))
    except (TypeError, ValueError): return web.json_response({"success": False, "message": "شناسهٔ بازیکن نامعتبر است."}, status=400)
    message_text = str(data.get("text", "")).strip()[:1200]
    if not message_text: return web.json_response({"success": False, "message": "متن پیام را بنویس."}, status=400)
    if target_uid not in players: return web.json_response({"success": False, "message": "بازیکن پیدا نشد."}, status=404)
    p = players[target_uid]
    display_name = " ".join(x for x in [str(p.get("telegram_first_name", "") or "").strip(), str(p.get("telegram_last_name", "") or "").strip()] if x)
    out_text = f"✉️ پیام مدیریت FRONT-LINE 1936\n\n{message_text}"
    world_key = str(request.query.get("world_id", "1"))
    ok_response = web.json_response({"success": True, "message": f"پیام برای {display_name or target_uid} ارسال شد."})
    async def _deliver(resp):
        # ارسال تلگرام بعد از رها شدن قفل؛ لاگ در دنیای درست با قفل کوتاه ثبت می‌شود.
        try:
            await bot.send_message(chat_id=target_uid, text=out_text)
        except Exception as exc:
            async with _in_world(world_key):
                log_admin_action("ارسال پیام ناموفق", target_uid, str(exc))
                save_state()
            return web.json_response({"success": False, "message": "ارسال پیام ناموفق بود؛ ممکن است کاربر ربات را مسدود کرده باشد."}, status=502)
        async with _in_world(world_key):
            log_admin_action("ارسال پیام مستقیم", target_uid, message_text[:300])
            save_state()
        return resp
    _after_lock(_deliver)
    return ok_response

async def admin_bulk_adjust(request):
    denied = _admin_denied(request)
    if denied: return denied
    data = await read_json(request)
    field = str(data.get("field", "")); operation = str(data.get("operation", "add"))
    scope = str(data.get("scope", "all")); target_country = str(data.get("country", ""))
    try: amount = int(data.get("amount"))
    except (TypeError, ValueError): return web.json_response({"success": False, "message": "مقدار عددی معتبر وارد کن."}, status=400)
    if field not in {"money", "manpower", "food", "steel", "uranium", "oil"} or operation not in {"add", "subtract"}:
        return web.json_response({"success": False, "message": "نوع عملیات یا منبع معتبر نیست."}, status=400)
    if amount <= 0 or amount > 1_000_000_000_000:
        return web.json_response({"success": False, "message": "مقدار باید مثبت و کمتر از سقف مجاز باشد."}, status=400)
    if scope == "country" and target_country not in COUNTRIES:
        return web.json_response({"success": False, "message": "کشور انتخاب‌شده معتبر نیست."}, status=400)
    targets = [(uid, p) for uid, p in players.items() if scope == "all" or p.get("country") == target_country]
    changed = skipped = 0
    for uid, p in targets:
        if field == "money":
            accrue_player(p)
        bucket = p.setdefault("resources", {}) if field in RESOURCE_NAMES else p
        key = field if field in RESOURCE_NAMES else field
        current = int(bucket.get(key, 0) or 0)
        value = current + amount if operation == "add" else current - amount
        if value < 0:
            skipped += 1; continue
        bucket[key] = value; changed += 1
    log_admin_action("تغییر گروهی موجودی", None, f"scope={scope}:{target_country}; field={field}; operation={operation}; amount={amount}; changed={changed}; skipped={skipped}")
    save_state()
    return web.json_response({"success": True, "message": "تغییر گروهی انجام شد.", "changed": changed, "skipped": skipped})

async def admin_broadcast_global(request):
    denied = _admin_denied(request)
    if denied: return denied
    data = await read_json(request)
    title = str(data.get("title", "")).strip()[:100]
    body = str(data.get("text", "")).strip()[:1200]
    scope = str(data.get("scope", "all"))
    if not title or not body:
        return web.json_response({"success": False, "message": "عنوان و متن پیام الزامی است."}, status=400)
    if scope == "world":
        wid = str(data.get("world_id", "")).strip()
        if wid not in worlds_registry:
            return web.json_response({"success": False, "message": "دنیای انتخاب‌شده وجود ندارد."}, status=404)
        targets = [wid]
    else:
        targets = sorted(worlds_registry.keys(), key=lambda x: int(x))
    recipients, tag = [], ""
    for wid in targets:
        async with _in_world(wid):
            push_news(title, body, "info")
            log_admin_action("ارسال پیام سراسری", None, f"world={wid}; {title}: {body[:200]}")
            if scope == "world": tag = _world_tag()
            recipients.extend(_world_recipients())
            save_state()
    unique = list(dict.fromkeys(recipients))
    text = f"{tag}📣 {title}\n\n{body}"
    sent, failed = await _flush_tg_outbox([(u, text, None) for u in unique], delay=0.035)
    return web.json_response({"success": True, "message": "پیام ارسال شد.", "sent": sent, "failed": failed, "worlds": len(targets)})

async def admin_broadcast(request):
    denied = _admin_denied(request)
    if denied: return denied
    data = await read_json(request)
    title = str(data.get("title", "")).strip()[:100]
    body = str(data.get("text", "")).strip()[:1200]
    if not title or not body:
        return web.json_response({"success": False, "message": "عنوان و متن خبر الزامی است."}, status=400)
    push_news(title, body, "info")
    log_admin_action("ارسال خبر عمومی", None, f"{title}: {body[:250]}")
    save_state()
    recipients = _world_recipients()
    text = f"{_world_tag()}📣 {title}\n\n{body}"
    async def _send_all(resp):
        sent, failed = await _flush_tg_outbox([(u, text, None) for u in recipients], delay=0.035)
        return web.json_response({"success": True, "message": "خبر در بازی ثبت شد.", "sent": sent, "failed": failed})
    _after_lock(_send_all)
    return web.json_response({"success": True, "message": "خبر در بازی ثبت شد.", "sent": 0, "failed": 0})

# =========================================================
# Web Server
# =========================================================
# =========================================================
# ریست بازیکن و پیام‌های سازمان ملل
# =========================================================
UN_MESSAGE_LIMIT = 1000
UN_MESSAGE_KEEP = 500

def _player_display_name(p):
    full = " ".join(x for x in [str(p.get("telegram_first_name", "") or "").strip(),
                                str(p.get("telegram_last_name", "") or "").strip()] if x)
    if full: return full
    uname = str(p.get("telegram_username", "") or "").strip()
    return ("@" + uname) if uname else ""

def reset_player_in_world(uid):
    # بازیکن را از دنیای فعال کاملاً حذف می‌کند و همهٔ ردپای کشورش را پاک می‌کند.
    p = players.get(uid)
    if not p: return False
    cid = p.get("country")
    if cid:
        for k, o in list(map_holdings.items()):
            if o == cid: del map_holdings[k]
        for k, o in list(strait_holdings.items()):
            if o == cid:
                del strait_holdings[k]; reset_strait_policy(k)
        for k, g in list(site_forces.items()):
            if g.get("owner") == cid: del site_forces[k]
        transits[:] = [t for t in transits if t.get("owner") != cid]
        now_iso = utcnow().isoformat()
        for l in loans.values():
            if cid in (l.get("lender"), l.get("borrower")) and l.get("status") in ("pending", "active", "overdue"):
                l["status"] = "cancelled_reset"; l["closed_at"] = now_iso
        for l in market_listings.values():
            if l.get("status") == "open" and cid in (l.get("seller"), l.get("buyer")):
                l["status"] = "cancelled_reset"
        for u_id, u in list(unions.items()):
            if u.get("leader_country") == cid:
                del unions[u_id]; continue
            for key in ("members", "invites", "requests"):
                if cid in u.get(key, []): u[key].remove(cid)
        for pr in diplomacy_proposals.values():
            if pr.get("status") == "pending" and cid in (pr.get("from_country"), pr.get("to_country")):
                pr["status"] = "cancelled"
        active_treaties[:] = [t for t in active_treaties if cid not in (t.get("country_a"), t.get("country_b"))]
        for wid_, w in list(war_declarations.items()):
            if cid in (w.get("attacker"), w.get("defender")):
                w["resolved"] = True; w["status"] = "resolved"
                active_wars.pop(wid_, None)
        for colony, occ in list(occupied_countries.items()):
            if occ == cid:
                del occupied_countries[colony]
                occupied_assets.pop(colony, None); occupation_yields.pop(colony, None)
        market_sanctions.pop(cid, None)
        for by in list(market_sanctions):
            if cid in (market_sanctions[by] or []):
                market_sanctions[by] = [x for x in market_sanctions[by] if x != cid]
                if not market_sanctions[by]: del market_sanctions[by]
    del players[uid]
    return True

async def admin_reset_player(request):
    denied = _admin_denied(request)
    if denied: return denied
    data = await read_json(request)
    try: target = int(data.get("user_id"))
    except (TypeError, ValueError):
        return web.json_response({"success": False, "message": "شناسهٔ بازیکن نامعتبر است."}, status=400)
    p = players.get(target)
    if not p:
        return web.json_response({"success": False, "message": "بازیکن در این دنیا پیدا نشد."}, status=404)
    label = _player_display_name(p) or str(target)
    country_name = COUNTRIES.get(p.get("country"), {}).get("name", "بدون کشور")
    world_name = _world_meta().get("name", f"دنیای {active_world_id}")
    reset_player_in_world(target)
    text = (f"♻️ ریست شدید\nمدیریت بازی شما را از «{world_name}» حذف کرد و بازی شما از ابتدا شروع می‌شود. "
            "هنگام ورود دوباره، دنیا و کشور را از نو انتخاب کنید.")
    reset_notices[str(target)] = text
    log_admin_action("ریست بازیکن", target, f"world={active_world_id}; country={country_name}; name={label}")
    await _tg_send(target, text)
    save_state()
    return web.json_response({"success": True, "message": f"بازیکن «{label}» ریست شد و از «{world_name}» حذف گردید."})

async def send_un_message(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"success": False, "error": "unauthorized"}, status=401)
    data = await read_json(request)
    text = str(data.get("text") or "").strip()[:UN_MESSAGE_LIMIT]
    if not text: return _bad("متن پیام را بنویسید.")
    p = _me(uid)
    cid = p.get("country")
    if not cid or p.get("is_eliminated"):
        return _bad("برای ارسال پیام باید در این دنیا کشور داشته باشید.")
    mine = [m for m in un_messages if m.get("user_id") == uid and m.get("from") != "admin"]
    if mine:
        last = parse_dt(mine[-1].get("at"))
        if last and (utcnow() - last).total_seconds() < 3:
            return _bad("لطفاً چند ثانیه صبر کنید.", 429)
    meta = _world_meta()
    world_name = meta.get("name", f"دنیای {active_world_id}")
    msg = {"id": str(uuid.uuid4()), "world_id": int(active_world_id), "world_name": world_name,
           "country": cid, "country_name": COUNTRIES[cid]["name"], "user_id": int(uid),
           "user_name": _player_display_name(p), "username": str(p.get("telegram_username", "") or ""),
           "text": text, "at": utcnow().isoformat()}
    un_messages.append(msg)
    del un_messages[:-UN_MESSAGE_KEEP]
    save_state()
    try:
        await notify_admin(f"📨 پیام جدید به سازمان ملل\n🌍 {world_name}\n{COUNTRIES[cid]['flag']} {COUNTRIES[cid]['name']} · "
                           f"{msg['user_name'] or 'بدون نام'} ({uid})\n\n{text[:500]}")
    except Exception as e:
        logging.warning("un notify: %s", e)
    return web.json_response({"success": True, "message": "پیام برای مدیریت سازمان ملل ارسال شد."})

async def get_un_mine(request):
    uid = get_auth_user_id(request)
    if not uid: return web.json_response({"error": "unauthorized"}, status=401)
    cid = _me(uid).get("country")
    rows = [{"id": m.get("id"), "text": m.get("text", ""), "at": m.get("at"),
             "from": "admin" if m.get("from") == "admin" else "me"}
            for m in un_messages
            if (m.get("from") != "admin" and m.get("user_id") == uid)
            or (m.get("from") == "admin" and cid and m.get("country") == cid)][-50:]
    return web.json_response({"messages": rows})

async def admin_un_messages(request):
    """پیام‌های سازمان ملل فقط برای دنیای انتخاب‌شده (world_scoped)."""
    denied = _admin_denied(request)
    if denied: return denied
    wname = _world_meta().get("name", f"دنیای {active_world_id}")
    rows = []
    for m in un_messages:
        if isinstance(m, dict):
            rows.append({**m, "from": "admin" if m.get("from") == "admin" else "player",
                         "world_id": int(active_world_id), "world_name": wname})
    rows.sort(key=lambda m: m.get("at") or "")
    return web.json_response({"success": True, "messages": rows[-400:], "total": len(rows)})

async def admin_un_reply(request):
    denied = _admin_denied(request)
    if denied: return denied
    data = await read_json(request)
    cid = str(data.get("country") or "").strip()
    text = str(data.get("text") or "").strip()[:UN_MESSAGE_LIMIT]
    if cid not in COUNTRIES: return _bad("کشور نامعتبر است.")
    if not text: return _bad("متن پیام را بنویس.")
    recipients = [int(u) for u, pl in list(players.items())
                  if isinstance(pl, dict) and pl.get("country") == cid and not pl.get("is_eliminated")]
    if not recipients: return _bad("این کشور در این دنیا بازیکن فعال ندارد.", 404)
    world_name = _world_meta().get("name", f"دنیای {active_world_id}")
    msg = {"id": str(uuid.uuid4()), "world_id": int(active_world_id), "world_name": world_name,
           "country": cid, "country_name": COUNTRIES[cid]["name"], "from": "admin",
           "user_id": 0, "user_name": "سازمان ملل", "username": "", "text": text,
           "at": utcnow().isoformat()}
    un_messages.append(msg)
    del un_messages[:-UN_MESSAGE_KEEP]
    log_admin_action("پاسخ سازمان ملل", None, f"world={active_world_id}; country={cid}; {text[:200]}")
    out = f"{_world_tag()}🌐 پیام سازمان ملل\n\n{text}"
    async def _deliver(resp):
        await _flush_tg_outbox([(u, out, None) for u in recipients], delay=0.035)
        return resp
    _after_lock(_deliver)
    return web.json_response({"success": True, "message": "پیام برای کشور ارسال شد.", "item": msg})

WEB_DIR = os.path.join("web")

NO_CACHE = {"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"}
async def index(request): return web.FileResponse(os.path.join(WEB_DIR, "index.html"), headers=NO_CACHE)
async def style(request): return web.FileResponse(os.path.join(WEB_DIR, "style.css"), headers=NO_CACHE)
async def app_js(request): return web.FileResponse(os.path.join(WEB_DIR, "app.js"), headers=NO_CACHE)

async def create_web_app():
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_get("/", index)
    app.router.add_get("/style.css", style)
    app.router.add_get("/app.js", app_js)
    app.router.add_static("/images/", path=os.path.join(WEB_DIR, "images"), name="images")
    app.router.add_static("/fonts/", path=os.path.join(WEB_DIR, "fonts"), name="fonts")

    app.router.add_get("/api/worlds", get_worlds)
    app.router.add_get("/api/admin/global", admin_global)
    for path, h in [
        ("/api/player", get_player), ("/api/countries", get_countries),
        ("/api/army-units", get_army_units),
        ("/api/wars", get_wars), ("/api/map-sites", get_map_sites),
        ("/api/announcements", get_announcements), ("/api/announcements/status", get_announcement_status), ("/api/announcements/images", get_announcement_images), ("/api/announcement", get_announcement_detail),
        ("/api/union", get_union), ("/api/pm", get_pm), ("/api/market", get_market), ("/api/market/shipments", get_market_shipments),
        ("/api/diplomacy", get_diplomacy), ("/api/loans", get_loans), ("/api/stats", get_stats), ("/api/news", get_news), ("/api/rankings", get_rankings),
        ("/api/war/forces", get_forces), ("/api/map/transits", get_map_transits), ("/api/war/log", get_war_log), ("/api/satellite/scans", sat_get_scans),
        ("/api/admin/overview", admin_overview),
        ("/api/admin/wars", admin_wars), ("/api/admin/communications", admin_communications), ("/api/admin/un-messages", admin_un_messages), ("/api/un/mine", get_un_mine), ("/health", health)]:
        app.router.add_get(path, h if path == "/health" else world_scoped(h))

    for path, h in [
        ("/api/select-country", select_country), ("/api/upgrade-infra", upgrade_infra),
        ("/api/upgrade-economy", upgrade_economy), ("/api/train-unit", train_unit),
        ("/api/war/declare", declare_war), ("/api/war/peace", war_peace),
        ("/api/map/capture", capture_site), ("/api/war/dispatch", dispatch_forces), ("/api/war/recall", recall_forces),
        ("/api/satellite/launch", sat_launch), ("/api/satellite/scan-site", sat_scan_site),
        ("/api/satellite/scan-country", sat_scan_country),
        ("/api/activity-notices/ack", ack_activity_notices),
        ("/api/announcements/create", create_announcement),
        ("/api/announcements/react", react_announcement),
        ("/api/announcements/comment", comment_announcement),
        ("/api/union/create", create_union), ("/api/union/invite", invite_union),
        ("/api/union/respond", respond_union_invite), ("/api/union/request", request_union_membership),
        ("/api/union/request/respond", respond_union_request), ("/api/union/kick", kick_union_member),
        ("/api/union/leave", leave_union), ("/api/union/message", send_union_message),
        ("/api/pm/send", send_pm),
        ("/api/market/create", create_listing), ("/api/market/cancel", cancel_listing),
        ("/api/market/accept", accept_listing), ("/api/market/sanction", set_market_sanction), ("/api/strait/settings", set_strait_settings),
        ("/api/propose-treaty", propose_treaty), ("/api/respond-treaty", respond_treaty),
        ("/api/loans/propose", propose_loan), ("/api/loans/respond", respond_loan),
        ("/api/loans/cancel", cancel_loan), ("/api/loans/repay", repay_loan),
        ("/api/border/settings", set_border_settings), ("/api/admin/player/update", admin_update_player),
        ("/api/admin/player/adjust", admin_player_adjust), ("/api/admin/player/message", admin_player_message),
        ("/api/admin/bulk-adjust", admin_bulk_adjust), ("/api/admin/broadcast", admin_broadcast),
        ("/api/admin/war/review", admin_review_war), ("/api/admin/un/reply", admin_un_reply),
        ("/api/admin/player/reset", admin_reset_player), ("/api/un/send", send_un_message), ("/api/guide/seen", mark_guide_seen)]:
        app.router.add_post(path, world_scoped(h))
    app.router.add_post("/api/admin/worlds/create", admin_create_world)
    app.router.add_post("/api/admin/worlds/delete", admin_delete_world)
    app.router.add_post("/api/admin/worlds/rename", admin_rename_world)
    app.router.add_post("/api/admin/broadcast-global", admin_broadcast_global)
    app.router.add_post("/api/admin/world/start", world_scoped(admin_start_world))
    app.router.add_post("/api/admin/world/registration", world_scoped(admin_set_world_registration))

    app.router.add_route("OPTIONS", "/{tail:.*}", lambda r: web.Response())
    return app

async def start_web_server():
    app = await create_web_app()
    runner = web.AppRunner(app); await runner.setup()
    port = int(os.getenv("PORT", "10000"))
    site = web.TCPSite(runner, "0.0.0.0", port); await site.start()
    logging.info("WEB SERVER STARTED | port=%s", port)


async def _announce_season_transition_if_needed():
    meta = _world_meta()
    if not parse_dt(meta.get("game_started_at")) or meta.get("game_finished"):
        return
    info = get_game_time(at_time=utcnow())
    season = info.get("season")
    if not season or season == "در انتظار شروع" or season == meta.get("last_announced_season"):
        return
    effects = SEASON_EFFECTS.get(season, SEASON_EFFECTS["بهار"])
    message = (
        f"🌦️ فصل {season} آغاز شد (روز {info.get('day')}/{GAME_TOTAL_DAYS}). "
        + SEASON_HINTS.get(season, "")
    )
    meta["last_announced_season"] = season
    push_news(f"آغاز فصل {season}", message, "warning" if season in ("پاییز", "زمستان") else "info")
    push_war("season_changed", message, [])
    await notify_world_players(message)


async def _run_ticks_for_all_worlds():
    """تیک ۳۰ ثانیه‌ای: جنگ، فصل، رفاه و وام. قفل فقط مدت محاسبه نگه داشته می‌شود."""
    with _tg_outbox_scope():
        async with WORLD_SWITCH_LOCK:
            previous = str(active_world_id)
            _persist_active_world_memory()
            for wid in sorted(worlds_registry.keys(), key=lambda x: int(x)):
                _activate_world(wid)
                try:
                    finalize_world_if_due()
                    await check_wars_tick()
                    await _announce_season_transition_if_needed()
                    await welfare_tick()
                    loan_tick()
                    for _pl in list(players.values()):
                        if not isinstance(_pl, dict): continue
                        # دقیقاً در لحظهٔ پایان زمان، حتی اگر بازیکن آفلاین باشد، اعلان ثبت می‌شود.
                        if _pl.get("country") and not _pl.get("is_eliminated"): process_deliveries(_pl)
                        process_build_queue(_pl)
                        process_factory_queues(_pl)
                except Exception as exc:
                    logging.error("world tick (%s): %s", wid, exc)
                finally:
                    _persist_active_world_memory()
            _activate_world(previous if previous in worlds_registry else "1")
            save_state()


# =========================================================
# پایان فعالیت‌های خانه + ارسال پیام تلگرام به بازیکن (حتی وقتی بازی/ربات بسته است)
# =========================================================
ACTIVITY_LOOP_SECONDS = 2
_TG_PERMANENT_ERRORS = {"TelegramForbiddenError", "TelegramBadRequest", "TelegramUnauthorizedError", "TelegramNotFound"}

def _players_of_world(wid):
    if str(wid) == str(active_world_id):
        return players
    return (world_states.get(str(wid)) or {}).get("players") or {}

def _world_has_due_activity(wid, now):
    for pl in _players_of_world(wid).values():
        if not isinstance(pl, dict): continue
        for job in pl.get("build_queue") or []:
            end = parse_dt(job.get("end")) if isinstance(job, dict) else None
            if end and end <= now: return True
    return False

def _tg_entry_ready(entry, now):
    nxt = parse_dt(entry.get("next_try")) if isinstance(entry, dict) else None
    return not (nxt and nxt > now)

def _activity_work_due(now):
    for wid in list(worlds_registry.keys()):
        if _world_has_due_activity(wid, now): return True
        for pl in _players_of_world(wid).values():
            if isinstance(pl, dict) and any(_tg_entry_ready(e, now) for e in (pl.get("tg_outbox") or [])):
                return True
    return False

def _collect_tg_pending(now):
    pending = []
    for wid in sorted(worlds_registry.keys(), key=lambda x: int(x)):
        for uid_, pl in _players_of_world(wid).items():
            if not isinstance(pl, dict): continue
            for e in pl.get("tg_outbox") or []:
                if isinstance(e, dict) and e.get("id") and _tg_entry_ready(e, now):
                    pending.append((str(wid), uid_, e["id"], e.get("text") or ""))
    return pending

async def _send_tg_pending(pending):
    """ارسال واقعی؛ خارج از WORLD_SWITCH_LOCK. خروجی: [(wid, uid, entry_id, ok, permanent, retry_after)]."""
    results = []
    for wid, uid_, eid, text in pending:
        ok = permanent = False; retry_after = None
        try:
            await bot.send_message(chat_id=uid_, text=text)
            ok = True
        except Exception as exc:
            name = type(exc).__name__
            permanent = name in _TG_PERMANENT_ERRORS
            retry_after = getattr(exc, "retry_after", None)
            logging.warning("activity telegram notice failed for %s (%s): %s", uid_, name, exc)
        results.append((wid, uid_, eid, ok, permanent, retry_after))
        await asyncio.sleep(0.05)
    return results

def _apply_tg_results(results):
    """نتیجهٔ ارسال را در پروندهٔ بازیکن ثبت می‌کند (زیر قفل). ارسال موفق ⇒ حذف از صف و ثبت در tg_done."""
    changed = False; now = utcnow()
    for wid, uid_, eid, ok, permanent, retry_after in results:
        pl = _players_of_world(wid).get(uid_)
        if not isinstance(pl, dict): continue
        box = pl.setdefault("tg_outbox", [])
        entry = next((e for e in box if isinstance(e, dict) and e.get("id") == eid), None)
        if entry is None: continue
        if ok or permanent or int(entry.get("attempts", 0)) + 1 >= TG_OUTBOX_MAX_ATTEMPTS:
            box.remove(entry)
            done = pl.setdefault("tg_done", []); done.append(eid)
            del done[:-TG_DONE_KEEP]
        else:
            attempts = int(entry.get("attempts", 0)) + 1
            delay = float(retry_after) if retry_after else min(300, 5 * (2 ** attempts))
            entry["attempts"] = attempts
            entry["next_try"] = (now + timedelta(seconds=delay)).isoformat()
        changed = True
    return changed

async def _run_activity_tick():
    """تیک سریع (هر چند ثانیه): پایان فعالیت‌های خانه را در لحظهٔ پایان ثبت و پیام تلگرام آن را یک‌بار می‌فرستد.
    اگر کاری سررسید نشده باشد، قفل گرفته نمی‌شود."""
    now = utcnow()
    if not _activity_work_due(now):
        return
    pending = []
    async with WORLD_SWITCH_LOCK:
        previous = str(active_world_id)
        _persist_active_world_memory()
        changed = False
        try:
            for wid in sorted(worlds_registry.keys(), key=lambda x: int(x)):
                if not _world_has_due_activity(wid, now): continue
                _activate_world(wid)
                try:
                    for _pl in list(players.values()):
                        if not isinstance(_pl, dict): continue
                        if process_build_queue(_pl): changed = True
                except Exception as exc:
                    logging.error("activity tick (%s): %s", wid, exc)
                finally:
                    _persist_active_world_memory()
        finally:
            _activate_world(previous if previous in worlds_registry else "1")
        pending = _collect_tg_pending(utcnow())
        if changed: save_state()      # ثبت پایان فعالیت پیش از ارسال پیام؛ با ریستارت دوباره ثبت نمی‌شود
    if not pending:
        return
    results = await _send_tg_pending(pending)
    async with WORLD_SWITCH_LOCK:
        _persist_active_world_memory()
        if _apply_tg_results(results):
            save_state()              # اعلان ارسال‌شده بلافاصله ذخیره می‌شود تا با ریستارت تکرار نشود

async def activity_loop():
    while True:
        await asyncio.sleep(ACTIVITY_LOOP_SECONDS)
        try: await _run_activity_tick()
        except Exception as e: logging.error("activity loop: %s", e)


def _worlds_with_transits():
    result = []
    for wid in sorted(worlds_registry.keys(), key=lambda x: int(x)):
        ts = transits if str(wid) == str(active_world_id) else (world_states.get(str(wid)) or {}).get("transits")
        if ts:
            result.append(wid)
    return result


async def _run_transits_for_all_worlds():
    """تیک ۱ ثانیه‌ای: فقط حرکت و نبرد؛ دنیای بدون transit کاملاً رد می‌شود."""
    if not _worlds_with_transits():
        return
    async with WORLD_SWITCH_LOCK:
        wids = _worlds_with_transits()
        if not wids:
            return
        previous = str(active_world_id)
        _persist_active_world_memory()
        try:
            for wid in wids:
                _activate_world(wid)
                try:
                    process_transits()
                except Exception as exc:
                    logging.error("transit tick (%s): %s", wid, exc)
                finally:
                    _persist_active_world_memory()
        finally:
            _activate_world(previous if previous in worlds_registry else "1")


async def war_tick_loop():
    while True:
        await asyncio.sleep(30)
        try: await _run_ticks_for_all_worlds()
        except Exception as e: logging.error("war/world tick: %s", e)

dp.message.register(vip_command, Command("vip"))

async def main():
    logging.info("FRONT-LINE 1936 GAME STARTING...")
    load_state()
    asyncio.create_task(autosave_loop())
    asyncio.create_task(war_tick_loop())
    asyncio.create_task(transit_loop())
    asyncio.create_task(activity_loop())
    await start_web_server()
    await bot.delete_webhook(drop_pending_updates=True)
    try:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="🎮 بازی", web_app=WebAppInfo(url=WEB_APP_URL)))
        logging.info("MENU BUTTON SET")
    except Exception as e:
        logging.warning("set_chat_menu_button failed: %s", e)
    logging.info("BOT POLLING STARTED")
    await dp.start_polling(bot, drop_pending_updates=True, handle_signals=False)

if __name__ == "__main__":
    try: asyncio.run(main())
    except (KeyboardInterrupt, SystemExit): save_state()
