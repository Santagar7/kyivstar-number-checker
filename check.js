require("dotenv").config();
const { chromium } = require("playwright");

const TARGET_NUMBER = process.env.TARGET_NUMBER;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TARGET_NUMBER || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error("Missing required env variables.");
}

function normalizePhone(value) {
    const digits = value.replace(/\D/g, "");

    if (digits.length === 12 && digits.startsWith("38")) {
        return digits.slice(2);
    }

    return digits;
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
    const modal = page
        .locator('[role="dialog"], .modal, .popup, .cdk-overlay-pane')
        .filter({
            hasText: /не вийде вибрати номер|сталася помилка|повертайтеся пізніше/i,
        })
        .first();

    const isVisible = await modal.isVisible({ timeout: 3000 }).catch(() => false);

    if (!isVisible) {
        return false;
    }

    await page.screenshot({
        path: "kyivstar-service-unavailable.png",
        fullPage: true,
    });

    await notify("⚠️ Kyivstar number selection appears unavailable in script.");
    return true;
}

async function checkKyivstar() {
    const browser = await chromium.launch({
        headless: true,
    });

    try {
        const page = await browser.newPage();

        await page.goto("https://shop.kyivstar.ua/pick-number", {
            waitUntil: "networkidle",
            timeout: 60000,
        });

        if (await handleServiceUnavailableModal(page)) {
            return;
        }

        const normalizedNumber = normalizePhone(TARGET_NUMBER); // 0688083462
        const inputNumber = normalizedNumber.startsWith("0")
            ? normalizedNumber.slice(1) // 688083462
            : normalizedNumber;

        const expectedNumberDigits = `38${normalizedNumber}`; // 380688083462

        await page
            .locator("#select-number-block-anchor")
            .scrollIntoViewIfNeeded();

        const searchInput = page
            .locator("#select-number-block-anchor")
            .locator("xpath=following::input[1]");

        await searchInput.fill(inputNumber);

        const submitButton = page
            .locator("form")
            .filter({ hasText: "+380" })
            .getByRole("button", { name: /Підібрати номер/i });

        await submitButton.click();

        await page.waitForTimeout(5000);

        if (await handleServiceUnavailableModal(page)) {
            return;
        }

        const resultNumbers = await page.evaluate(() => {
            return [...document.querySelectorAll('div[class*="_number__"]')]
                .filter(el => {
                    const text = el.textContent?.trim() ?? "";

                    if (!text.startsWith("+380")) {
                        return false;
                    }

                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);

                    if (
                        rect.width === 0 ||
                        rect.height === 0 ||
                        style.display === "none" ||
                        style.visibility === "hidden"
                    ) {
                        return false;
                    }

                    const row = el.parentElement;

                    return !!row && [...row.querySelectorAll("button")]
                        .some(button => button.textContent?.trim() === "Вибрати");
                })
                .map(el => el.textContent.trim());
        });

        const found = resultNumbers.some(number =>
            number.replace(/\D/g, "") === expectedNumberDigits
        );

        if (found) {
            await notify(`✅ Kyivstar number is available: ${TARGET_NUMBER}`);
        } else {
            await notify(`❌ Number not found: ${TARGET_NUMBER}`);
        }
    } finally {
        await browser.close();
    }
}

checkKyivstar().catch(async error => {
    console.error(error);

    try {
        await notify(`⚠️ Kyivstar checker failed: ${error.message}`);
    } catch {}

    process.exit(1);
});