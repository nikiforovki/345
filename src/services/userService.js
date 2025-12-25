const { ObjectId } = require("mongodb");
const db = require("../db/connection");
const config = require("../config");

const userService = {
  // Создание нового пользователя или получение существующего
  async createUserOrGet(user_id, username) {
    console.log(`Проверка существования пользователя с ID: ${user_id}`);
    const usersCollection = db.collection("users");

    // Проверяем, существует ли пользователь
    const existingUser = await usersCollection.findOne({ user_id });

    if (existingUser) {
      console.log(`Пользователь с ID ${user_id} уже существует`);
      return existingUser;
    }

    console.log(
      `Создание нового пользователя с ID: ${user_id}, username: ${username}`
    );
    // Создаем нового пользователя
    const newUser = {
      user_id,
      username: username || null,
      balance: 0,
      created_at: new Date(),
      updated_at: new Date(),
      hasTrial: false, // По умолчанию пользователь не получал тестовый ключ
    };

    const result = await usersCollection.insertOne(newUser);
    console.log(
      `Пользователь с ID ${user_id} создан с _id: ${result.insertedId}`
    );
    return { _id: result.insertedId, ...newUser };
  },

  // Получение пользователя по ID
  async getUserById(user_id) {
    const usersCollection = db.collection("users");
    const user = await usersCollection.findOne({ user_id });
    if (user) {
      console.log(`Получена информация о пользователе ${user_id}`);
    } else {
      console.log(`Пользователь ${user_id} не найден`);
    }
    return user;
  },

  // Обновление баланса пользователя
  async updateUserBalance(user_id, amount, session = null) {
    console.log(`Обновление баланса пользователя ${user_id} на ${amount} ₽`);
    const usersCollection = db.collection("users");

    const updateOptions = {};
    if (session) {
      updateOptions.session = session;
    }

    const result = await usersCollection.updateOne(
      { user_id },
      {
        $inc: { balance: amount },
        $set: { updated_at: new Date() },
      },
      updateOptions
    );
    if (result.modifiedCount > 0) {
      console.log(`Баланс пользователя ${user_id} успешно обновлен`);
    } else {
      console.log(`Не удалось обновить баланс пользователя ${user_id}`);
    }

    return result.modifiedCount > 0;
  },

  // Проверка достаточности баланса
  async hasSufficientBalance(user_id, amount) {
    const user = await this.getUserById(user_id);
    const hasSufficient = user && user.balance >= amount;
    console.log(
      `Проверка баланса для пользователя ${user_id}: баланс ${
        user?.balance || 0
      } ₽, требуется ${amount} ₽, достаточно: ${hasSufficient}`
    );
    return hasSufficient;
  },

  // Получение истории покупок пользователя
  async getUserPurchaseHistory(user_id, limit = 5) {
    const ordersCollection = db.collection("orders");

    return await ordersCollection
      .aggregate([
        { $match: { user_id } },
        {
          $lookup: {
            from: "keys",
            localField: "key_id",
            foreignField: "_id",
            as: "key_info",
          },
        },
        { $unwind: "$key_info" },
        { $sort: { created_at: -1 } },
        { $limit: limit },
        {
          $project: {
            amount: 1,
            created_at: 1,
            key_type: "$key_info.type",
          },
        },
      ])
      .toArray();
  },

  // Получение статистики пользователя
  async getUserStats(user_id) {
    const ordersCollection = db.collection("orders");

    const stats = await ordersCollection
      .aggregate([
        { $match: { user_id } },
        {
          $group: {
            _id: null,
            totalPurchases: { $sum: 1 },
            totalSpent: { $sum: "$amount" },
          },
        },
      ])
      .toArray();

    // Если статистика не найдена, возвращаем нулевые значения
    const result = stats[0] || { totalPurchases: 0, totalSpent: 0 };

    console.log(
      `Статистика пользователя ${user_id}: покупок ${result.totalPurchases}, потрачено ${result.totalSpent} ₽`
    );

    return result;
  },

  // Получение всех пользователей (для админ-функций)
  async getAllUsers(limit = 100) {
    const usersCollection = db.collection("users");
    return await usersCollection
      .find({})
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();
  },

  // Получение общего количества пользователей
  async getTotalUsersCount() {
    const usersCollection = db.collection("users");
    return await usersCollection.countDocuments();
  },

  // Ручное пополнение баланса администратором
  async adminAddBalance(user_id, amount, session = null) {
    const usersCollection = db.collection("users");

    const updateOptions = {};
    if (session) {
      updateOptions.session = session;
    }

    const result = await usersCollection.updateOne(
      { user_id },
      {
        $inc: { balance: amount },
        $set: { updated_at: new Date() },
      },
      updateOptions
    );

    return result.modifiedCount > 0;
  },

  // Получение информации о пользователе (для админ-функций)
  async getAdminUserInfo(user_id) {
    const usersCollection = db.collection("users");
    const keysCollection = db.collection("keys");

    const user = await usersCollection.findOne({ user_id });
    if (!user) return null;

    // Получаем информацию об активном ключе
    const activeKey = await keysCollection.findOne({
      user_id,
      status: config.KEY_STATUSES.SOLD,
    });

    // Получаем количество покупок
    const ordersCollection = db.collection("orders");
    const purchaseCount = await ordersCollection.countDocuments({ user_id });

    return {
      user_id: user.user_id,
      username: user.username,
      balance: user.balance,
      hasActiveKey: !!activeKey,
      activeKeyId: activeKey ? activeKey._id : null,
      activeKeyType: activeKey ? activeKey.type : null,
      activeKeyValuePreview: activeKey
        ? activeKey.key_value.substring(0, 10) + "..."
        : null,
      purchaseCount,
    };
  },

  // Обновление флага hasTrial у пользователя
  async updateUserHasTrial(user_id, hasTrial) {
    const usersCollection = db.collection("users");

    const result = await usersCollection.updateOne(
      { user_id },
      {
        $set: {
          hasTrial,
          updated_at: new Date(),
        },
      }
    );

    return result.modifiedCount > 0;
  },
};

module.exports = userService;
