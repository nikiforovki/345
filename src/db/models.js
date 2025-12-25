// В MongoDB схемы не обязательны, но мы создадим этот файл для документирования структуры данных

// Модель User
const UserSchema = {
  // _id: ObjectId (автоматически создается MongoDB)
  user_id: Number, // Telegram user ID (уникальный)
  username: String, // Имя пользователя в Telegram
  balance: Number, // Баланс пользователя в рублях (default: 0)
  created_at: Date, // Дата регистрации
  updated_at: Date, // Дата последнего обновления
  hasTrial: { type: Boolean, default: false }, // Флаг получения тестового ключа
};

// Модель Key
const KeySchema = {
  // _id: ObjectId (автоматически создается MongoDB)
  key_value: String, // Значение ключа (уникальное)
  type: String, // Тип ключа (например, 'default' - все по 200 ₽)
  status: String, // Статус: 'available', 'sold', 'revoked', 'expired'
  user_id: Number, // ID пользователя, которому продан ключ (если продан)
  sold_at: Date, // Дата продажи (если продан)
  expires_at: Date, // Дата истечения срока действия (опционально)
  updated_at: Date, // Дата последнего обновления
  created_at: Date, // Дата создания записи
};

// Модель Payment
const PaymentSchema = {
  // _id: ObjectId (автоматически создается MongoDB)
  provider: { type: String, default: "nicepay" },
  user_id: Number, // ID пользователя, который делает платеж
  telegram_id: Number, // Telegram ID пользователя
  amount: Number, // Сумма платежа в рублях
  currency: String, // Валюта
  status: {
    type: String,
    enum: ["created", "pending", "success", "failed", "cancelled"],
    default: "created",
  },
  nicepay_payment_id: { type: String, index: true }, // ID платежа в Nicepay
  nicepay_raw_create_response: Object, // Сырой ответ от Nicepay при создании
  nicepay_last_webhook_data: Object, // Последние данные вебхука от Nicepay
  created_at: Date, // Дата создания платежа
  updated_at: Date, // Дата последнего обновления
};

// Модель Order
const OrderSchema = {
  // _id: ObjectId (автоматически создается MongoDB)
  user_id: Number, // ID пользователя, который купил ключ
  key_id: ObjectId, // ID купленного ключа
  amount: Number, // Сумма покупки в рублях (200 ₽)
  created_at: Date, // Дата покупки
  status: String, // Статус заказа: 'paid'
};

// Экспортируем для документирования
module.exports = {
  UserSchema,
  KeySchema,
  PaymentSchema,
  OrderSchema,
};
