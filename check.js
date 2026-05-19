require('dotenv').config();
const { chromium } = require("playwright");

const TARGET_NUMBER = process.env.TARGET_NUMBER;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TARGET_NUMBER || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error("Missing required env variables.");
}

async function notify(message) {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
        }),
    });

    if (!res.ok) {
        throw new Error(`Telegram notification failed: ${res.status} ${await res.text()}`);
    }
}

async function handleServiceUnavailableModal(page) {
    const modalText = page.getByText("На жаль, поки що не вийде вибрати номер");

    if (await modalText.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log("Kyivstar number selection service is unavailable.");

        await page.screenshot({
            path: "kyivstar-service-unavailable.png",
            fullPage: true,
        });

        await notify(
            "⚠️ Kyivstar number selection service is currently unavailable. Check later."
        );

        return true;
    }

    return false;
}

async function checkKyivstar() {
    const browser = await chromium.launch({ headless: true });

    try {
        const page = await browser.newPage();

        await page.goto("https://shop.kyivstar.ua/pick-number", {
            waitUntil: "networkidle",
            timeout: 60000,
        });

        if (await handleServiceUnavailableModal(page)) {
            return;
        }

        const normalizedNumber = TARGET_NUMBER.replace(/\D/g, "");
        await page.getByText("Який номер бажаєте").scrollIntoViewIfNeeded();

        const searchInput = page
            .locator("section, div")
            .filter({ hasText: "Який номер бажаєте" })
            .locator("input")
            .first();

        await searchInput.fill(normalizedNumber);

        await page.getByRole("button", { name: /Підібрати номер/i }).click();

        await page.waitForTimeout(5000);

        if (await handleServiceUnavailableModal(page)) {
            return;
        }

        const bodyText = await page.locator("body").innerText();

        if (bodyText.includes(TARGET_NUMBER)) {
            await notify(`Kyivstar number is available: ${TARGET_NUMBER}`);
        } else {
            await notify(`Number not found: ${TARGET_NUMBER}`);
        }
    } finally {
        await browser.close();
    }
}

checkKyivstar().catch(async (error) => {
    console.error(error);
    await notify(`⚠️ Kyivstar checker failed: ${error.message}`);
    process.exit(1);
});