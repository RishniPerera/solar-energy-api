const app = require("./app");  //Express app

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Solar Energy API running on port ${PORT}`);
});