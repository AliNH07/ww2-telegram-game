import asyncio
import logging

from aiohttp import web
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import (
    Message,
    WebAppInfo,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    CallbackQuery,
)

from config import BOT_TOKEN


# =========================================================
# تنظیمات
# =========================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)

WEB_APP_URL = "https://ww2-telegram-game.onrender.com"
ADMIN_ID = 8900923747

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


# =========================================================
# صفحه شروع ربات
# =========================================================

@dp.message(CommandStart())
async def start_command(message: Message):
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🎮 ورود به بازی",
                    web_app=WebAppInfo(url=WEB_APP_URL),
                )
            ]
        ]
    )

    await message.answer(
        "🌍 <b>جنگ جهانی دوم</b>\n\n"
        "به بازی استراتژیک جنگ جهانی دوم خوش آمدید.\n\n"
        "در این بازی می‌توانید کشور خود را انتخاب کنید، "
        "اقتصاد بسازید، ارتش تشکیل دهید، با سایر کشورها مذاکره کنید "
        "و وارد جنگ شوید.\n\n"
        "⚠️ انتخاب کشور دائمی است تا زمانی که کشور شما در بازی حذف یا اشغال شود.\n\n"
        "برای شروع روی دکمه زیر بزنید:",
        reply_markup=keyboard,
        parse_mode="HTML",
    )


# =========================================================
# دریافت پیام‌های وب‌اپ
# =========================================================

@dp.message(F.web_app_data)
async def web_app_data_handler(message: Message):
    """
    در صورت ارسال Telegram.WebApp.sendData()
    این قسمت اطلاعات را دریافت می‌کند.
    """

    try:
        data = message.web_app_data.data

        logging.info(
            "WebApp data received from user %s: %s",
            message.from_user.id,
            data,
        )

        await message.answer(
            "✅ اطلاعات شما دریافت شد."
        )

    except Exception:
        logging.exception("WebApp data error")


# =========================================================
# درخواست تأیید جنگ توسط ادمین
# =========================================================

async def send_war_approval_request(
    war_id: str,
    attacker_name: str,
    defender_name: str,
    attacker_forces: dict,
):
    """
    ارسال درخواست اعلام جنگ برای ادمین/سازمان ملل.
    """

    land = attacker_forces.get("land", 0)
    naval = attacker_forces.get("naval", 0)
    air = attacker_forces.get("air", 0)

    text = (
        "🌐 <b>درخواست تأیید اعلام جنگ</b>\n\n"
        f"⚔️ مهاجم: <b>{attacker_name}</b>\n"
        f"🛡️ مدافع: <b>{defender_name}</b>\n\n"
        "نیروهای اعزامی:\n"
        f"🪖 زمینی: {land:,}\n"
        f"⚓ دریایی: {naval:,}\n"
        f"✈️ هوایی: {air:,}\n\n"
        f"🆔 شناسه جنگ: <code>{war_id}</code>\n\n"
        "آیا این جنگ تأیید شود؟"
    )

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ تأیید جنگ",
                    callback_data=f"war_approve:{war_id}",
                ),
                InlineKeyboardButton(
                    text="❌ رد جنگ",
                    callback_data=f"war_reject:{war_id}",
                ),
            ]
        ]
    )

    try:
        await bot.send_message(
            ADMIN_ID,
            text,
            reply_markup=keyboard,
            parse_mode="HTML",
        )

        return True

    except Exception:
        logging.exception(
            "Could not send war approval request"
        )
        return False


# =========================================================
# پاسخ ادمین به درخواست جنگ
# =========================================================

async def handle_war_decision(
    callback: CallbackQuery,
    approved: bool,
    war_id: str,
):
    """
    تصمیم ادمین را به API اصلی بازی منتقل می‌کند.
    """

    if callback.from_user.id != ADMIN_ID:
        await callback.answer(
            "⛔ شما اجازه انجام این کار را ندارید.",
            show_alert=True,
        )
        return

    action = "approve" if approved else "reject"

    url = (
        f"{WEB_APP_URL}/api/war/admin/{action}"
        f"?war_id={war_id}"
        f"&admin_id={ADMIN_ID}"
    )

    try:
        session = await get_http_session()

        async with session.post(url) as response:
            result = await response.json()

        if result.get("success"):
            if approved:
                await callback.message.edit_text(
                    "✅ <b>جنگ تأیید شد.</b>\n\n"
                    f"🆔 جنگ: <code>{war_id}</code>\n\n"
                    "دوره آماده‌سازی و مذاکره ۲۴ ساعته آغاز شد.",
                    parse_mode="HTML",
                )

                await callback.answer(
                    "جنگ تأیید شد."
                )

            else:
                await callback.message.edit_text(
                    "❌ <b>اعلام جنگ رد شد.</b>\n\n"
                    f"🆔 جنگ: <code>{war_id}</code>",
                    parse_mode="HTML",
                )

                await callback.answer(
                    "اعلام جنگ رد شد."
                )

        else:
            await callback.answer(
                result.get(
                    "message",
                    "خطا در پردازش درخواست."
                ),
                show_alert=True,
            )

    except Exception:
        logging.exception(
            "War decision error"
        )

        await callback.answer(
            "خطا در ارتباط با سرور بازی.",
            show_alert=True,
        )


@dp.callback_query(F.data.startswith("war_approve:"))
async def approve_war(callback: CallbackQuery):
    war_id = callback.data.split(":", 1)[1]

    await handle_war_decision(
        callback=callback,
        approved=True,
        war_id=war_id,
    )


@dp.callback_query(F.data.startswith("war_reject:"))
async def reject_war(callback: CallbackQuery):
    war_id = callback.data.split(":", 1)[1]

    await handle_war_decision(
        callback=callback,
        approved=False,
        war_id=war_id,
    )


# =========================================================
# ارسال اعلان عمومی
# =========================================================

async def broadcast_message(
    user_ids: list[int],
    text: str,
):
    """
    ارسال اعلان به بازیکنان فعال.
    """

    success = 0
    failed = 0

    for user_id in user_ids:

        try:
            await bot.send_message(
                user_id,
                text,
                parse_mode="HTML",
            )

            success += 1

            # جلوگیری از ارسال بیش از حد سریع
            await asyncio.sleep(0.05)

        except Exception:
            failed += 1

            logging.warning(
                "Could not send message to %s",
                user_id,
            )

    return {
        "success": success,
        "failed": failed,
    }


# =========================================================
# HTTP session برای ارتباط bot با backend
# =========================================================

_http_session = None


async def get_http_session():
    global _http_session

    if _http_session is None:
        import aiohttp

        _http_session = aiohttp.ClientSession()

    return _http_session


# =========================================================
# Health Check
# =========================================================

async def health(request):
    return web.json_response(
        {
            "status": "ok",
            "service": "ww2-telegram-game",
            "bot": "online",
        }
    )


# =========================================================
# Root
# =========================================================

async def root(request):
    return web.FileResponse(
        "index.html"
    )


# =========================================================
# اجرای سرور
# =========================================================

async def start_web_server():

    app = web.Application()

    # -----------------------------
    # صفحات اصلی
    # -----------------------------

    app.router.add_get(
        "/",
        root,
    )

    app.router.add_get(
        "/health",
        health,
    )

    # -----------------------------
    # فایل‌های Frontend
    # -----------------------------

    app.router.add_static(
        "/images/",
        "images",
    )

    app.router.add_get(
        "/style.css",
        lambda request: web.FileResponse(
            "style.css"
        ),
    )

    app.router.add_get(
        "/app.js",
        lambda request: web.FileResponse(
            "app.js"
        ),
    )

    # -----------------------------
    # API
    # -----------------------------
    #
    # API اصلی بازی در همین سرویس
    # توسط backend بازی مدیریت می‌شود.
    #
    # این مسیرها برای اتصال frontend
    # و bot آماده هستند.
    #

    runner = web.AppRunner(app)

    await runner.setup()

    site = web.TCPSite(
        runner,
        host="0.0.0.0",
        port=8080,
    )

    await site.start()

    logging.info(
        "Web server started on port 8080"
    )

    return runner


# =========================================================
# اجرای Bot + Web Server
# =========================================================

async def main():

    logging.info(
        "Starting WW2 Telegram Game..."
    )

    web_runner = await start_web_server()

    try:

        logging.info(
            "Telegram bot polling started."
        )

        await dp.start_polling(bot)

    finally:

        await bot.session.close()

        if _http_session:
            await _http_session.close()

        await web_runner.cleanup()


# =========================================================
# ENTRY POINT
# =========================================================

if __name__ == "__main__":
    try:
        asyncio.run(main())

    except KeyboardInterrupt:
        logging.info(
            "Application stopped."
        )
