import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const port = 3000;

// Enable CORS for all routes
app.use(cors());

// Add health check route
app.get('/', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Proxy route for GAIA API
app.get('/proxy', async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    try {
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: error.message });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
});

// Start server
app.listen(port, () => {
    console.log(`Proxy server running at http://localhost:${port}`);
});