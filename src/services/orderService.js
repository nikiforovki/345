const { ObjectId } = require("mongodb");
const db = require("../db/connection");
const config = require("../config");

const orderService = {
  // Создание нового заказа
  async createOrder(user_id, key_id, amount, session = null) {
    console.log(
      `Создание заказа для пользователя ${user_id}, ключ ${key_id}, сумма ${amount} ₽`
    );
    const ordersCollection = db.collection("orders");

    const order = {
      user_id,
      key_id: new ObjectId(key_id),
      amount,
      created_at: new Date(),
      status: config.ORDER_STATUSES.PAID,
    };

    const options = {};
    if (session) {
      options.session = session;
    }

    const result = await ordersCollection.insertOne(order, options);
    console.log(`Заказ создан с ID: ${result.insertedId}`);

    return {
      _id: result.insertedId,
      ...order,
    };
  },

  // Получение заказов пользователя
  async getUserOrders(user_id, limit = 10) {
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
            user_id: 1,
            amount: 1,
            created_at: 1,
            status: 1,
            key_type: "$key_info.type",
            key_value: "$key_info.key_value",
          },
        },
      ])
      .toArray();
  },

  // Получение статистики по заказам (для админ-функций)
  async getOrdersStats() {
    const ordersCollection = db.collection("orders");

    const stats = await ordersCollection
      .aggregate([
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: "$amount" },
          },
        },
      ])
      .toArray();

    return stats[0] || { totalOrders: 0, totalRevenue: 0 };
  },

  // Получение статистики по типам ключей
  async getOrdersStatsByType() {
    const ordersCollection = db.collection("orders");

    return await ordersCollection
      .aggregate([
        {
          $lookup: {
            from: "keys",
            localField: "key_id",
            foreignField: "_id",
            as: "key_info",
          },
        },
        { $unwind: "$key_info" },
        {
          $group: {
            _id: "$key_info.type",
            count: { $sum: 1 },
            revenue: { $sum: "$amount" },
          },
        },
      ])
      .toArray();
  },
};

module.exports = orderService;
