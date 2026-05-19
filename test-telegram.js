require("dotenv").config();

async function notify(message) {
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: message,
        }),
    });

    const body = await res.text();
    console.log("Status:", res.status);
    console.log("Body:", body);
}

notify("Test message from Kyivstar checker");