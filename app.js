
const express = require('express');
const axios = require('axios');
require('dotenv').config();
const app = express();
const PORT = 3000;
const userRouter = require('./routes/user.routes');

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));



app.use("/" , userRouter);


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
