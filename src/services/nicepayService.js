const crypto = require("crypto");
const axios = require("axios");
const { nicepay } = require("../config");
const { ObjectId } = require("mongodb");
const { getOrCreateUser } = require("./userService");
const { getDb } = require("../db/connection");

// Создаем отдельный инстанс axios для Nicepay с фиксированным таймаутом
const nicepayClient = axios.create({
  timeout: 15000, // 15 секунд таймаут для Nicepay
});

// Функция для проверки хэша вебхука
function verifyNicepayHash(params, secretKey) {
  const data = { ...params };
  const receivedHash = data.hash;
  delete data.hash;

  const keys = Object.keys(data).sort(); // алфавитно
  const values = keys.map((k) => String(data[k]));
  values.push(secretKey);

  const hashString = values.join("{np}");
  const calc = crypto.createHash("sha256").update(hashString).digest("hex");

  return calc === receivedHash;
}

// Функция создания платежа в Nicepay
async function createInvoice(user, amount) {
  // Проверяем сумму
  if (amount < nicepay.minAmount || amount > nicepay.maxAmount) {
    throw new Error(
      `Сумма должна быть в диапазоне от ${nicepay.minAmount} до ${nicepay.maxAmount}`
    );
  }

  try {
    // Создаем локальный order_id
    const localOrderId = `order_${Date.now()}_${user.user_id}`;

    // Конвертируем сумму в копейки
    const amountKopecks = Math.round(amount * 100);

    // Подготовка данных для запроса
    const payload = {
      merchant_id: nicepay.merchantId,
      secret: nicepay.secretKey,
      order_id: localOrderId, // наш внутренний ID
      customer: String(user.user_id),
      amount: amountKopecks,
      currency: nicepay.currency,
      description: `Пополнение баланса Telegram ID ${user.user_id}`,
      success_url: nicepay.successUrl,
      fail_url: nicepay.failUrl,
    };

    // Логируем параметры запроса
    console.log("Nicepay createInvoice request:", {
      url: `${nicepay.baseUrl}/payment`,
      timeout: 15000,
      merchant_id: nicepay.merchantId,
      amount: payload.amount,
      currency: payload.currency,
      order_id: localOrderId,
    });

    // Выполняем запрос к API Nicepay через отдельный инстанс
    const response = await nicepayClient.post(
      `${nicepay.baseUrl}/payment`,
      payload
    );

    console.log(`Nicepay API response status: ${response.status}`);
    console.log(
      `Nicepay API response headers: ${JSON.stringify(response.headers)}`
    );

    // Проверяем статус ответа
    if (response.data && response.data.status !== "success") {
      console.error(
        `Nicepay API error response: ${JSON.stringify(response.data)}`
      );

      const nicepayMessage =
        response.data.message ||
        (response.data.data && response.data.data.message) ||
        response.data.error ||
        "Unknown error";

      throw new Error(`Nicepay error: ${nicepayMessage}`);
    }

    // Проверяем, что в ответе есть необходимые данные
    if (!response.data || !response.data.data) {
      console.error(
        `Nicepay API invalid response: ${JSON.stringify(response.data)}`
      );
      throw new Error(
        `Nicepay response missing data: ${JSON.stringify(response.data)}`
      );
    }

    // Получаем данные из ответа
    const data = response.data.data;
    const nicepayPaymentId = data.payment_id;
    const paymentUrl = data.link;

    // Проверяем, что полученные данные валидны
    if (!nicepayPaymentId || !paymentUrl) {
      console.error(
        `Nicepay API invalid response data: ${JSON.stringify(data)}`
      );
      throw new Error(`Invalid Nicepay response data: ${JSON.stringify(data)}`);
    }

    // Получаем соединение с базой данных
    const db = getDb();
    const paymentsCollection = db.collection("payments");

    // Создаем запись в базе данных
    const payment = await paymentsCollection.insertOne({
      provider: "nicepay",
      user_id: user.user_id,
      telegram_id: user.user_id,
      amount: amount,
      currency: nicepay.currency,
      status: "created",
      order_id: localOrderId, // используем локальный ID
      nicepay_payment_id: nicepayPaymentId,
      nicepay_raw_create_response: response.data,
      created_at: new Date(),
      updated_at: new Date(),
    });

    return {
      paymentUrl: paymentUrl,
      providerPaymentId: nicepayPaymentId,
    };
  } catch (error) {
    // Добавляем более подробное логирование ошибки
    if (error.response) {
      // Ошибка ответа от сервера (не 2xx статус)
      console.error("Nicepay API error response:", {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
      });
    } else if (error.request) {
      // Ошибка запроса (например, таймаут или нет соединения)
      console.error("Nicepay API request error:", {
        message: error.message,
        code: error.code,
        // можно логировать timeout, если он есть в error.config
        timeout: error.config && error.config.timeout,
      });
    } else {
      // Ошибка при создании запроса или другие ошибки
      console.error("Nicepay API general error:", {
        message: error.message,
        stack: error.stack,
      });
    }

    // Передаем пользовательскую ошибку
    throw new Error(
      "Не удалось создать платеж через Nicepay. Попробуйте позже или обратитесь в поддержку."
    );
  }
}

// Функция обработки вебхука от Nicepay
async function handleWebhook(params) {
  // Проверяем хэш
  if (!verifyNicepayHash(params, nicepay.secretKey)) {
    return {
      ok: false,
      reason: "invalid-hash",
    };
  }

  // Извлекаем ключевые поля из параметров вебхука
  const nicepayPaymentId = params.payment_id;

  if (!nicepayPaymentId) {
    return {
      ok: false,
      reason: "missing-payment-id",
    };
  }

  // Получаем соединение с базой данных
  const db = getDb();
  const paymentsCollection = db.collection("payments");

  // Находим платеж в нашей базе данных
  const payment = await paymentsCollection.findOne({
    nicepay_payment_id: nicepayPaymentId,
  });

  if (!payment) {
    // Логируем и возвращаем ok: true, но ничего не меняем
    console.log(`Платеж с ID ${nicepayPaymentId} не найден в базе данных`);
    return {
      ok: true,
      reason: "payment-not-found",
    };
  }

  // Сохраняем последние данные вебхука
  const updateData = {
    nicepay_last_webhook_data: params,
    updated_at: new Date(),
  };

  let normalizedStatus = payment.status; // по умолчанию оставляем текущий статус

  switch (params.result) {
    case "success":
      if (payment.status !== "success") {
        // Увеличиваем баланс пользователя
        const { increaseBalance } = require("./userService");
        await increaseBalance(payment.user_id, payment.amount);
        normalizedStatus = "success";
      } else {
        normalizedStatus = "success";
      }
      break;
    case "error":
      normalizedStatus = "failed";
      break;
    default:
      normalizedStatus = payment.status; // оставляем текущий статус
  }

  updateData.status = normalizedStatus;

  // Обновляем запись в базе данных
  await paymentsCollection.updateOne(
    { _id: payment._id },
    { $set: updateData }
  );

  return {
    ok: true,
    status: normalizedStatus,
  };
}

module.exports = {
  createInvoice,
  handleWebhook,
};
