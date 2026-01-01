const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const routes = require('./routes/index');
app.use('/api', routes);

const containersRoutes = require('./routes/containers');
app.use('/api/containers', containersRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Express App - Container Event Processing Engine' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

