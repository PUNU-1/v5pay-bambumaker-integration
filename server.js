require('dotenv').config();
const express = require('express');
const { sign, verify } = require('./lib/sign');
const { isProcessed, markProcessed } = require('./lib/store');

const app = express();
app.use(express.json());
// На случай, если V5Pay шлёт callback как form-urlencoded, а не JSON.
app.use(express.urlencoded({ extended: false }));

const {
  V5PAY_BASE_URL,
  V5PAY_MERCHANT_NO,
  V5PAY_APP_KEY,
  V5PAY_SECRET_KEY,
  PUBLIC_CALLBACK_URL,
  // TODO(!): подтвердить у V5Pay код валюты для российского кэшира. Цены на
  // сайте в рублях, поэтому по умолчанию RUB — см. README "Открытые вопросы".
  V5PAY_CURRENCY = 'RUB',
  PORT = 3000,
  ALLOWED_ORIGINS = 'https://bambumaker.com,https://www.bambumaker.com',
} = process.env;

// CORS: кнопка на Тильде (другой домен) шлёт fetch с JSON — браузер сначала
// делает preflight OPTIONS. Без этих заголовков запрос будет заблокирован.
const allowedOrigins = ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
app.use('/v5pay/create-payment', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function assertConfigured(res) {
  if (!V5PAY_MERCHANT_NO || !V5PAY_APP_KEY || !V5PAY_SECRET_KEY) {
    res.status(500).json({
      error: 'Сервер не настроен: заполните V5PAY_MERCHANT_NO / V5PAY_APP_KEY / V5PAY_SECRET_KEY в .env',
    });
    return false;
  }
  return true;
}

// ------------------------------------------------------------------
// 1. Создание платежа. Вызывается кодом на странице Тильды, когда
//    покупатель нажимает "Оплатить". Возвращает checkoutUrl, на
//    который нужно перенаправить покупателя.
// ------------------------------------------------------------------
app.post('/v5pay/create-payment', async (req, res) => {
  if (!assertConfigured(res)) return;

  try {
    const {
      orderNo,
      amount,
      email,
      mobile,
      productName,
      productSku,
      productPrice,
      productQty = 1,
      productDescription,
      customerId,
      customerNickname,
      redirectUrl,
    } = req.body || {};

    if (!orderNo || !amount) {
      return res.status(400).json({ error: 'orderNo и amount обязательны' });
    }
    if (!(Number(amount) > 0)) {
      return res.status(400).json({ error: 'amount должен быть положительным числом' });
    }

    // Для России V5Pay требует доп. параметр orderExtendParam —
    // JSON-описание товара и покупателя (см. orderExtendParam.md в доке V5Pay).
    const orderExtendParam = JSON.stringify({
      product: {
        name: productName || 'Order',
        title: productName || 'Order',
        sku: productSku || orderNo,
        url: 'https://bambumaker.com',
        price: productPrice || amount,
        quantity: productQty,
        description: productDescription || productName || 'Order',
      },
      customer: {
        userId: customerId || orderNo,
        nickname: customerNickname || 'Customer',
      },
    });

    const params = {
      merchantNo: V5PAY_MERCHANT_NO,
      appKey: V5PAY_APP_KEY,
      sysCountryCode: 'RU',
      currency: V5PAY_CURRENCY,
      orderNo: String(orderNo),
      amount: Number(amount).toFixed(2),
      email: email || undefined,
      mobile: mobile || undefined,
      tradeSummary: productName || 'Order',
      callbackUrl: PUBLIC_CALLBACK_URL,
      redirectUrl: redirectUrl || 'https://bambumaker.com/?v5pay=return',
      language: 'ru-RU',
      orderExtendParam,
    };

    params.sign = sign(params, V5PAY_SECRET_KEY);

    const response = await fetch(`${V5PAY_BASE_URL}/cgi/cashier/v2/payin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await response.json();

    if (data.code !== '1000') {
      console.error('V5Pay create-payment error:', data);
      return res.status(502).json({ error: 'V5Pay вернул ошибку', details: data });
    }

    console.log(`Создан платёж для заказа ${params.orderNo} на ${params.amount} ${params.currency}`);
    return res.json({ checkoutUrl: data.checkoutUrl, expiresAt: data.expiresAt });
  } catch (err) {
    console.error('create-payment exception:', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ------------------------------------------------------------------
// 2. Callback от V5Pay о результате платежа. Адрес этого эндпоинта
//    должен быть прописан в кабинете V5Pay (Status Notification
//    Address) или передан как callbackUrl при создании платежа.
// ------------------------------------------------------------------
app.post('/v5pay/callback', (req, res) => {
  const body = req.body || {};

  if (!V5PAY_SECRET_KEY) {
    console.error('V5PAY_SECRET_KEY не задан — не могу проверить подпись callback');
    return res.status(200).send('success'); // отвечаем 200, чтобы не сыпало ретраями
  }

  const validSignature = verify(body, V5PAY_SECRET_KEY);
  if (!validSignature) {
    console.warn('V5Pay callback: НЕВЕРНАЯ подпись, запрос проигнорирован', body);
    // Отвечаем 200/success, чтобы V5Pay не долбил повторами, но как
    // оплаченный заказ НЕ засчитываем.
    return res.status(200).send('success');
  }

  const { transactionId, orderNo, status, amount, currency } = body;

  if (!isProcessed(transactionId)) {
    markProcessed(transactionId, { orderNo, status, amount, currency });
    console.log(`Заказ ${orderNo} (transactionId=${transactionId}) — статус: ${status}`);

    // TODO: здесь добавить реальную бизнес-логику после успешной оплаты,
    // например:
    //  - отправить уведомление в Telegram/на email заказчице;
    //  - записать заказ в таблицу/CRM;
    //  - при наличии API Тильды — обновить статус заказа там.
  } else {
    console.log(`Повторный callback для transactionId=${transactionId}, уже обработан — игнорируем`);
  }

  // V5Pay требует синхронный ответ "success". Если его не вернуть,
  // уведомления будут повторяться (в сумме до 10 попыток с растущим интервалом).
  return res.status(200).send('success');
});

app.get('/health', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`V5Pay integration server running on port ${PORT} (base URL: ${V5PAY_BASE_URL || 'не задан'})`);
});
