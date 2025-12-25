const express = require("express");
const router = express.Router();
const nicepayService = require("../services/nicepayService");

router.get("/nicepay/callback", async (req, res) => {
  try {
    const result = await nicepayService.handleWebhook(req.query);

    if (!result.ok) {
      return res.status(400).send("error");
    }

    return res.json({ result: { message: "Success" } });
  } catch (e) {
    console.error("Nicepay webhook error", e);
    return res.status(500).json({ error: { message: "Server error" } });
  }
});

module.exports = router;
