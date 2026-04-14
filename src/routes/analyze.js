/**
 * Analyze Routes
 * Proxy requests to ML Service
 */

import express from 'express';
import axios from 'axios';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5000';

/**
 * POST /api/analyze
 * Forward to ML service for prediction with Grad-CAM
 */
router.post('/', optionalAuth, async (req, res) => {
    const { images, full_face_image, bounding_boxes } = req.body;

    if (!images || typeof images !== 'object' || Object.keys(images).length === 0) {
        return res.status(400).json({ error: 'No images provided' });
    }

    try {

        const mlPayload = {
            images: images,
            full_face_image: full_face_image || null,
            bounding_boxes: bounding_boxes || null
        };

        // Call ML service
        const response = await axios.post(
            `${ML_SERVICE_URL}/predict-with-gradcam`,
            mlPayload, // <--- KIRIM PAYLOAD LENGKAP DI SINI
            {
                timeout: 30000,  // 30 second timeout
                headers: { 'Content-Type': 'application/json' }
            }
        );

        res.json(response.data);
    } catch (err) {
        console.error('ML Service error:', err.message);

        if (err.code === 'ECONNREFUSED') {
            return res.status(503).json({
                error: 'ML Service unavailable',
                message: 'Please ensure the ML service is running on port 5000'
            });
        }

        if (err.response) {
            return res.status(err.response.status).json(err.response.data);
        }

        res.status(500).json({ error: 'Analysis failed' });
    }
});

/**
 * POST /api/analyze/predict-only
 * Forward to ML service for prediction only (no Grad-CAM)
 */
router.post('/predict-only', optionalAuth, async (req, res) => {
    const { images } = req.body;

    if (!images || typeof images !== 'object') {
        return res.status(400).json({ error: 'No images provided' });
    }

    try {
        const response = await axios.post(
            `${ML_SERVICE_URL}/predict`,
            { images },
            { timeout: 15000 }
        );

        res.json(response.data);
    } catch (err) {
        console.error('ML Service error:', err.message);

        if (err.code === 'ECONNREFUSED') {
            return res.status(503).json({ error: 'ML Service unavailable' });
        }

        res.status(500).json({ error: 'Prediction failed' });
    }
});

/**
 * POST /api/analyze/recommend
 * Get ingredient recommendations
 */
router.post('/recommend', optionalAuth, async (req, res) => {
    const { skin_condition } = req.body;

    if (!skin_condition || !['Acne', 'Oily', 'Normal'].includes(skin_condition)) {
        return res.status(400).json({
            error: 'Invalid skin condition. Must be: Acne, Oily, or Normal'
        });
    }

    try {
        const response = await axios.post(
            `${ML_SERVICE_URL}/recommend`,
            { skin_condition },
            { timeout: 10000 }
        );

        res.json(response.data);
    } catch (err) {
        console.error('Recommend error:', err.message);

        if (err.code === 'ECONNREFUSED') {
            return res.status(503).json({ error: 'ML Service unavailable' });
        }

        res.status(500).json({ error: 'Recommendation failed' });
    }
});

/**
 * GET /api/analyze/health
 * Check ML service health
 */
router.get('/health', async (req, res) => {
    try {
        const response = await axios.get(`${ML_SERVICE_URL}/health`, { timeout: 5000 });
        res.json({
            gateway: 'ok',
            ml_service: response.data
        });
    } catch (err) {
        res.json({
            gateway: 'ok',
            ml_service: { status: 'unavailable', error: err.message }
        });
    }
});

export default router;
