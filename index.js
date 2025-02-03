const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode");
const express = require("express");
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();

// 🔵 تهيئة بوت Telegram
const telegramToken = '5672474990:AAE9K13ZFQnDecHX2d6pbX0HnMLe3bFmGDk';
const telegramBot = new TelegramBot(telegramToken, { polling: true });

// 🔵 تهيئة بوت WhatsApp
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("./auth");
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("✅ تم توليد رمز QR! انتقل إلى الرابط لمسحه ضوئيًا.");
            qrcode.toDataURL(qr, (err, url) => {
                if (err) console.error("❌ خطأ في إنشاء QR:", err);
                global.qrCodeUrl = url;
            });
        }

        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
            console.log("🚨 تم فصل الاتصال، جارٍ إعادة الاتصال...", shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === "open") {
            console.log("✅ تم الاتصال بنجاح!");
        }
    });

    // 🔵 نقل الرسائل من Telegram إلى WhatsApp
    telegramBot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const whatsappGroupId = '120363396610918303@g.us'; // استبدل بمعرف مجموعة الواتساب

        if (msg.photo) {
            // معالجة الصور
            const photoId = msg.photo[msg.photo.length - 1].file_id;
            const fileUrl = await telegramBot.getFileLink(photoId);
            const imageBuffer = await downloadFile(fileUrl);

            await sock.sendMessage(whatsappGroupId, {
                image: imageBuffer,
                caption: msg.caption || "صورة من Telegram"
            });
            console.log("📸 تم نقل صورة من Telegram إلى WhatsApp");
        } else if (msg.text) {
            // معالجة النصوص
            await sock.sendMessage(whatsappGroupId, { text: `📨 رسالة من Telegram: ${msg.text}` });
            console.log(`📩 تم نقل الرسالة من Telegram إلى WhatsApp: ${msg.text}`);
        } else if (msg.document) {
            // معالجة المستندات
            const fileId = msg.document.file_id;
            const fileUrl = await telegramBot.getFileLink(fileId);
            const fileBuffer = await downloadFile(fileUrl);

            await sock.sendMessage(whatsappGroupId, {
                document: fileBuffer,
                fileName: msg.document.file_name || "file"
            });
            console.log("📄 تم نقل مستند من Telegram إلى WhatsApp");
        } else if (msg.video) {
            // معالجة الفيديوهات
            const videoId = msg.video.file_id;
            const fileUrl = await telegramBot.getFileLink(videoId);
            const videoBuffer = await downloadFile(fileUrl);

            await sock.sendMessage(whatsappGroupId, {
                video: videoBuffer,
                caption: msg.caption || "فيديو من Telegram"
            });
            console.log("🎥 تم نقل فيديو من Telegram إلى WhatsApp");
        }
    });
}

// 🔵 دالة لتنزيل الملفات من Telegram
async function downloadFile(url) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data, 'binary');
}

// 🟢 إنشاء سيرفر يعرض QR Code على المتصفح
app.get("/", (req, res) => {
    if (global.qrCodeUrl) {
        res.send(`<h1>امسح رمز QR للاتصال بالبوت</h1><img src="${global.qrCodeUrl}" width="300">`);
    } else {
        res.send("<h1>لم يتم توليد رمز QR بعد... يرجى الانتظار!</h1>");
    }
});

app.listen(3000, () => console.log("🌍 افتح الرابط: http://localhost:3000"));

connectToWhatsApp();
