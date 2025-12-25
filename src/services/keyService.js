const { ObjectId } = require("mongodb");
const db = require("../db/connection");
const config = require("../config");

const keyService = {
  // Добавление новых ключей
  async addKeys(keys, type = config.KEY_TYPES.DEFAULT) {
    console.log(`Добавление ${keys.length} ключей типа ${type}`);
    const keysCollection = db.collection("keys");

    // Подсчет дубликатов
    let duplicateCount = 0;

    // Подготовка ключей для вставки
    const keysToInsert = [];
    for (const keyValue of keys) {
      // Проверяем, существует ли уже такой ключ
      const existingKey = await keysCollection.findOne({ key_value: keyValue });
      if (!existingKey) {
        keysToInsert.push({
          key_value: keyValue,
          type,
          status: config.KEY_STATUSES.AVAILABLE,
          created_at: new Date(),
        });
      } else {
        duplicateCount++;
      }
    }

    // Вставляем только уникальные ключи
    let insertedCount = 0;
    if (keysToInsert.length > 0) {
      const result = await keysCollection.insertMany(keysToInsert);
      insertedCount = result.insertedCount;
      console.log(
        `Добавлено ${insertedCount} новых ключей, ${duplicateCount} дубликатов пропущено`
      );
    } else {
      console.log(`Все ${keys.length} ключей уже существуют в базе данных`);
    }

    return {
      inserted: insertedCount,
      duplicates: duplicateCount,
    };
  },

  // Поиск доступного ключа определенного типа
  async findAvailableKey(type = config.KEY_TYPES.DEFAULT) {
    console.log(`Поиск доступного ключа типа ${type}`);
    const keysCollection = db.collection("keys");

    // Используем findOneAndUpdate для атомарной операции
    console.log(`Попытка найти доступный ключ типа ${type}`);
    const availableKey = await keysCollection.findOne({
      type,
      status: config.KEY_STATUSES.AVAILABLE,
    });

    if (!availableKey) {
      console.log(`Нет доступных ключей типа ${type}`);
      const totalKeys = await keysCollection.countDocuments({ type });
      const soldKeys = await keysCollection.countDocuments({
        type,
        status: config.KEY_STATUSES.SOLD,
      });
      const availableKeys = await keysCollection.countDocuments({
        type,
        status: config.KEY_STATUSES.AVAILABLE,
      });
      const otherStatusKeys = await keysCollection.countDocuments({
        type,
        status: {
          $nin: [config.KEY_STATUSES.AVAILABLE, config.KEY_STATUSES.SOLD],
        },
      });

      console.log(
        `Диагностика ключей типа ${type}: всего ${totalKeys}, продано ${soldKeys}, доступно ${availableKeys}, другие статусы ${otherStatusKeys}`
      );

      return null;
    }

    console.log(`Найден ключ ${availableKey._id} для резервирования`);

    const result = await keysCollection.findOneAndUpdate(
      {
        _id: availableKey._id,
        type,
        status: config.KEY_STATUSES.AVAILABLE,
      },
      {
        $set: {
          status: config.KEY_STATUSES.SOLD,
          sold_at: new Date(),
          expires_at: (() => {
            const soldAt = new Date();
            const expiresAt = new Date(soldAt);
            expiresAt.setDate(expiresAt.getDate() + config.KEY_VALIDITY_DAYS);
            return expiresAt;
          })(), // Дата истечения срока действия (30 календарных дней)
        },
      },
      {
        returnDocument: "after",
      }
    );

    console.log(
      `Результат findOneAndUpdate: ${
        result && result.value ? "успешно" : "неудачно"
      }`
    );

    if (result && result.value) {
      console.log(
        `Найден и зарезервирован ключ ${result.value._id} типа ${type}`
      );
      return result.value;
    } else {
      console.log(`Доступных ключей типа ${type} не найдено`);
      return null;
    }
  },

  // Поиск и резервирование доступного ключа с привязкой к пользователю
  async findAndReserveKeyForUser(user_id, type = config.KEY_TYPES.DEFAULT) {
    console.log(
      `Поиск и резервирование ключа типа ${type} для пользователя ${user_id}`
    );
    const keysCollection = db.collection("keys");

    // Делаем предварительную проверку количества доступных ключей
    const availableCountBefore = await keysCollection.countDocuments({
      type,
      status: config.KEY_STATUSES.AVAILABLE,
    });
    console.log(`Доступно ключей до findOneAndUpdate: ${availableCountBefore}`);

    console.log(
      `Выполняем findOneAndUpdate для поиска ключа типа ${type} для пользователя ${user_id}`
    );

    // Получим все доступные ключи для отладки до выполнения findOneAndUpdate
    const availableKeysBefore = await keysCollection
      .find({
        type,
        status: config.KEY_STATUSES.AVAILABLE,
      })
      .sort({ created_at: 1 })
      .toArray();

    console.log(
      `Найдено ${availableKeysBefore.length} доступных ключей до findOneAndUpdate для типа ${type}:`,
      availableKeysBefore.map((key) => ({
        _id: key._id,
        created_at: key.created_at,
      }))
    );

    // Используем findOneAndUpdate для атомарной операции
    // Проверяем только статус, так как AVAILABLE должен означать, что ключ действительно доступен
    const result = await keysCollection.findOneAndUpdate(
      {
        type,
        status: config.KEY_STATUSES.AVAILABLE,
      },
      {
        $set: {
          user_id: user_id,
          status: config.KEY_STATUSES.SOLD,
          sold_at: new Date(),
          expires_at: (() => {
            const soldAt = new Date();
            const expiresAt = new Date(soldAt);
            expiresAt.setDate(expiresAt.getDate() + config.KEY_VALIDITY_DAYS);
            return expiresAt;
          })(), // Дата истечения срока действия (30 календарных дней)
        },
      },
      {
        returnDocument: "after", // Возвращаем обновленный документ
        sort: { created_at: 1 }, // Сортируем по дате создания, чтобы использовать более старые ключи первыми
        maxTimeMS: 10000, // Устанавливаем таймаут для операции
      }
    );

    if (result && result.value) {
      console.log(
        `Ключ ${result.value._id} успешно зарезервирован для пользователя ${user_id}`
      );
      return result.value;
    } else {
      console.log(
        `Не удалось зарезервировать ключ для пользователя ${user_id}, результат: ${
          result ? "объект найден, но значение отсутствует" : "объект не найден"
        }`
      );

      // Проверим, может быть, ключ был обновлен, но не возвращен из-за специфики драйвера
      // В этом случае попробуем найти ключ, который должен был быть обновлен
      const updatedKey = await keysCollection.findOne({
        type,
        user_id: user_id,
        status: config.KEY_STATUSES.SOLD,
      });

      if (updatedKey) {
        console.log(
          `Ключ ${updatedKey._id} был обновлён, но не возвращён в findOneAndUpdate`
        );
        return updatedKey;
      }

      // Дополнительная проверка - возможно, ключ был заблокирован другой транзакцией
      const availableAfter = await keysCollection.countDocuments({
        type,
        status: config.KEY_STATUSES.AVAILABLE,
      });
      console.log(
        `Доступно ключей после попытки резервации: ${availableAfter}`
      );

      // Еще раз проверим доступные ключи после неудачной попытки
      const availableKeysAfter = await keysCollection
        .find({
          type,
          status: config.KEY_STATUSES.AVAILABLE,
        })
        .sort({ created_at: 1 })
        .toArray();

      console.log(
        `Найдено ${availableKeysAfter.length} доступных ключей после неудачного findOneAndUpdate для типа ${type}:`,
        availableKeysAfter.map((key) => ({
          _id: key._id,
          created_at: key.created_at,
          user_id: key.user_id,
        }))
      );

      // Дополнительная диагностика - проверим, есть ли вообще ключи нужного типа
      const totalKeys = await keysCollection.countDocuments({ type });
      const soldKeys = await keysCollection.countDocuments({
        type,
        status: config.KEY_STATUSES.SOLD,
      });
      const availableKeys = await keysCollection.countDocuments({
        type,
        status: config.KEY_STATUSES.AVAILABLE,
      });
      const otherStatusKeys = await keysCollection.countDocuments({
        type,
        status: {
          $nin: [config.KEY_STATUSES.AVAILABLE, config.KEY_STATUSES.SOLD],
        },
      });

      console.log(
        `Диагностика ключей типа ${type}: всего ${totalKeys}, продано ${soldKeys}, доступно ${availableKeys}, другие статусы ${otherStatusKeys}`
      );

      return null;
    }
  },

  // Обновление полей expires_at для старых ключей, у которых это поле отсутствует
  async updateMissingExpiryDates() {
    const keysCollection = db.collection("keys");

    // Найти ключи, у которых нет поля expires_at, но которые уже проданы
    const keysWithoutExpiry = await keysCollection
      .find({
        status: config.KEY_STATUSES.SOLD,
        expires_at: { $exists: false },
      })
      .toArray();

    let updatedCount = 0;
    for (const key of keysWithoutExpiry) {
      // Устанавливаем дату истечения срока действия как 30 дней с даты продажи или с текущей даты, если дата продажи не указана
      const soldDate = key.sold_at || key.created_at || new Date();
      const newExpiryDate = (() => {
        const expiresAt = new Date(soldDate);
        expiresAt.setDate(expiresAt.getDate() + config.KEY_VALIDITY_DAYS);
        return expiresAt;
      })();

      await keysCollection.updateOne(
        { _id: key._id },
        { $set: { expires_at: newExpiryDate } }
      );

      updatedCount++;
    }

    console.log(
      `Обновлено ${updatedCount} ключей с отсутствующей датой истечения срока`
    );
    return updatedCount;
  },

  // Получение ключа пользователя
  async getUserKey(user_id) {
    const keysCollection = db.collection("keys");

    const key = await keysCollection.findOne({
      user_id,
      status: config.KEY_STATUSES.SOLD,
      type: { $in: [config.KEY_TYPES.DEFAULT, config.KEY_TYPES.TRIAL] }, // Учитываем как обычные, так и тестовые ключи
    });

    // Если ключ найден, возвращаем ключ с безопасными значениями по умолчанию
    if (key) {
      return {
        _id: key._id,
        key_value: key.key_value || "Неизвестен",
        type: key.type || "Неизвестен",
        user_id: key.user_id,
        status: key.status,
        sold_at: key.sold_at,
        expires_at: key.expires_at,
        created_at: key.created_at,
        updated_at: key.updated_at,
      };
    }

    return null;
  },

  // Получение статистики по ключам
  async getKeysStats() {
    const keysCollection = db.collection("keys");

    const stats = await keysCollection
      .aggregate([
        {
          $group: {
            _id: "$type",
            available: {
              $sum: {
                $cond: [
                  { $eq: ["$status", config.KEY_STATUSES.AVAILABLE] },
                  1,
                  0,
                ],
              },
            },
            sold: {
              $sum: {
                $cond: [{ $eq: ["$status", config.KEY_STATUSES.SOLD] }, 1, 0],
              },
            },
            expired: {
              $sum: {
                $cond: [
                  { $eq: ["$status", config.KEY_STATUSES.EXPIRED] },
                  1,
                  0,
                ],
              },
            },
            revoked: {
              $sum: {
                $cond: [
                  { $eq: ["$status", config.KEY_STATUSES.REVOKED] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ])
      .toArray();

    return stats;
  },

  // Проверка, есть ли у пользователя активный ключ
  async hasActiveKey(user_id) {
    const keysCollection = db.collection("keys");

    const activeKey = await keysCollection.findOne({
      user_id,
      status: config.KEY_STATUSES.SOLD,
      expires_at: { $gt: new Date() }, // Только не истекшие ключи
      type: { $in: [config.KEY_TYPES.DEFAULT, config.KEY_TYPES.TRIAL] }, // Учитываем как обычные, так и тестовые ключи
    });

    return !!activeKey;
  },

  // Проверка, есть ли у пользователя любой ключ (включая истекшие)
  async hasAnyKey(user_id) {
    const keysCollection = db.collection("keys");

    const key = await keysCollection.findOne({
      user_id,
      status: config.KEY_STATUSES.SOLD,
      type: { $in: [config.KEY_TYPES.DEFAULT, config.KEY_TYPES.TRIAL] }, // Учитываем как обычные, так и тестовые ключи
    });

    return !!key;
  },

  // Получение количества доступных ключей определенного типа
  async getAvailableKeysCount(type = config.KEY_TYPES.DEFAULT) {
    const keysCollection = db.collection("keys");
    const count = await keysCollection.countDocuments({
      type,
      status: config.KEY_STATUSES.AVAILABLE,
    });
    console.log(`Доступно ${count} ключей типа ${type}`);
    return count;
  },

  // Проверка истекших ключей
  async getExpiredKeys() {
    const keysCollection = db.collection("keys");
    return await keysCollection
      .find({
        status: config.KEY_STATUSES.SOLD,
        expires_at: { $lt: new Date() },
      })
      .toArray();
  },

  // Проверка истекших тестовых ключей
  async getExpiredTrialKeys() {
    const keysCollection = db.collection("keys");
    return await keysCollection
      .find({
        type: config.KEY_TYPES.TRIAL,
        status: config.KEY_STATUSES.SOLD,
        expires_at: { $lt: new Date() },
      })
      .toArray();
  },

  // Обновление статуса истекшего ключа
  async updateExpiredKeyStatus(keyId) {
    const keysCollection = db.collection("keys");

    const result = await keysCollection.updateOne(
      { _id: new ObjectId(keyId) },
      {
        $set: {
          status: config.KEY_STATUSES.EXPIRED,
          updated_at: new Date(),
        },
      }
    );

    return result.modifiedCount > 0;
  },

  // Получение активного ключа пользователя с проверкой срока действия
  async getUserActiveKey(user_id) {
    const keysCollection = db.collection("keys");

    const key = await keysCollection.findOne({
      user_id,
      status: config.KEY_STATUSES.SOLD,
      expires_at: { $gt: new Date() }, // Только не истекшие ключи
      type: { $in: [config.KEY_TYPES.DEFAULT, config.KEY_TYPES.TRIAL] }, // Учитываем как обычные, так и тестовые ключи
    });

    // Если ключ найден, но у него нет некоторых полей, которые теперь обязательны,
    // возвращаем ключ с безопасными значениями по умолчанию
    if (key) {
      return {
        _id: key._id,
        key_value: key.key_value || "Неизвестен",
        type: key.type || "Неизвестен",
        user_id: key.user_id,
        status: key.status,
        sold_at: key.sold_at,
        expires_at: key.expires_at,
        created_at: key.created_at,
        updated_at: key.updated_at,
      };
    }

    return null;
  },

  // Отзыв ключа (для админ-функций)
  async revokeKey(keyId) {
    const keysCollection = db.collection("keys");

    const result = await keysCollection.updateOne(
      { _id: new ObjectId(keyId) },
      {
        $set: {
          status: config.KEY_STATUSES.REVOKED,
          updated_at: new Date(),
        },
      }
    );

    return result.modifiedCount > 0;
  },

  // Возвращение ключа в статус AVAILABLE (для случаев отмены транзакции)
  async returnKeyToAvailable(keyId) {
    const keysCollection = db.collection("keys");

    const result = await keysCollection.updateOne(
      {
        _id: new ObjectId(keyId),
        status: config.KEY_STATUSES.SOLD, // Только если ключ уже продан (зарезервирован)
      },
      {
        $set: {
          status: config.KEY_STATUSES.AVAILABLE,
          user_id: null, // Сбрасываем привязку к пользователю
          sold_at: null,
          expires_at: null,
          updated_at: new Date(),
        },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`Ключ ${keyId} возвращен в статус AVAILABLE`);
    } else {
      console.log(`Не удалось вернуть ключ ${keyId} в статус AVAILABLE`);
    }

    return result.modifiedCount > 0;
  },

  // Поиск и резервирование тестового ключа с привязкой к пользователю
  async findAndReserveTrialKeyForUser(user_id) {
    console.log(
      `Поиск и резервирование тестового ключа для пользователя ${user_id}`
    );
    const keysCollection = db.collection("keys");

    // Используем findOneAndUpdate для атомарной операции
    const result = await keysCollection.findOneAndUpdate(
      {
        type: config.KEY_TYPES.TRIAL,
        status: config.KEY_STATUSES.AVAILABLE,
      },
      {
        $set: {
          user_id: user_id,
          status: config.KEY_STATUSES.SOLD, // или использовать 'trial' - выбрать единый вариант
          sold_at: new Date(),
          start_at: new Date(), // Дата начала использования
          expires_at: (() => {
            const now = new Date();
            const expiresAt = new Date(now);
            expiresAt.setDate(expiresAt.getDate() + 3); // 3 дня для тестового ключа
            return expiresAt;
          })(), // Дата истечения срока действия (3 дня для тестового ключа)
        },
      },
      {
        returnDocument: "after", // Возвращаем обновленный документ
        sort: { created_at: 1 }, // Сортируем по дате создания, чтобы использовать более старые ключи первыми
        maxTimeMS: 10000, // Устанавливаем таймаут для операции
      }
    );

    if (result && result.value) {
      console.log(
        `Тестовый ключ ${result.value._id} успешно зарезервирован для пользователя ${user_id}`
      );
      return result.value;
    } else {
      console.log(
        `Не удалось зарезервировать тестовый ключ для пользователя ${user_id}`
      );
      return null;
    }
  },

  // Проверка, получил ли пользователь тестовый ключ ранее
  async hasUserTrialKey(user_id) {
    console.log(`Проверка наличия тестового ключа у пользователя ${user_id}`);
    const keysCollection = db.collection("keys");

    // Ищем ключи с типом "trial" и статусом "sold" (или другими статусами, которые означают выданный ключ)
    const trialKey = await keysCollection.findOne({
      user_id,
      type: config.KEY_TYPES.TRIAL,
      status: { $in: [config.KEY_STATUSES.SOLD, config.KEY_STATUSES.EXPIRED] }, // Включаем истекшие ключи, чтобы не давать тест второй раз
    });

    console.log(
      `Найден тестовый ключ для пользователя ${user_id}: ${!!trialKey}`
    );
    return !!trialKey;
  },

  // Проверка, покупал ли пользователь платные ключи
  async hasUserPaidKeys(user_id) {
    console.log(`Проверка наличия платных ключей у пользователя ${user_id}`);
    const keysCollection = db.collection("keys");

    // Ищем ключи с типом, отличным от "trial", и статусом "sold" (или другими статусами, которые означают выданный ключ)
    const paidKey = await keysCollection.findOne({
      user_id,
      type: { $ne: config.KEY_TYPES.TRIAL }, // Любой тип, кроме trial
      status: { $in: [config.KEY_STATUSES.SOLD, config.KEY_STATUSES.EXPIRED] }, // Включаем истекшие ключи, чтобы не давать тест тем, кто уже покупал
    });

    console.log(
      `Найден платный ключ для пользователя ${user_id}: ${!!paidKey}`
    );
    return !!paidKey;
  },
};

module.exports = keyService;
