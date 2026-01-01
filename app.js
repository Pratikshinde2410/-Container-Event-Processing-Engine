// app.js
const express = require('express');
const containersRoutes = require('./routes/containers');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({ message: 'WeTRACK Container Event Processing Engine - API Ready' });
});

app.use('/api/containers', containersRoutes);

module.exports = app;