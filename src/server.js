require("dotenv").config();

const app = require("./app"); // Express app

const PORT = process.env.PORT || 3000;
const ENV = process.env.NODE_ENV || "development";

app.listen(PORT, () => {
  console.log(`Solar Energy API running on port ${PORT} [${ENV}]`);
});