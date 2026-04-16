/**
 * History Routes
 * CRUD operations for analysis history
 */

import express from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { authMiddleware } from '../middleware/auth.js';

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const retryAsync = async (fn, retries = 2, delayMs = 500) => {
    try {
        const result = await fn();

        // 🔥 penting: detect supabase error
        if (result?.error) {
            throw new Error(result.error.message);
        }

        return result;

    } catch (err) {
        console.log("RETRY:", err.message);

        if (retries <= 0) throw err;

        await delay(delayMs);
        return retryAsync(fn, retries - 1, delayMs);
    }
};

const router = express.Router();

/**
 * GET /api/history
 * Get user's analysis history
 */
router.get('/', authMiddleware, async (req, res) => { 
    if (!isSupabaseConfigured()) {
        return res.status(503).json({ error: 'Database not configured' });
    }

    const userId = req.user.id;
    const limitNum = Math.min(parseInt(req.query.limit) || 50, 50);
    const offsetNum = parseInt(req.query.offset) || 0;

    try {
        const { data, error, count } = await retryAsync(() => supabase
            .from('analyses')
            .select(`
                id,
                skin_condition,
                confidence_score,
                created_at,
                image_url
            `, { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offsetNum, offsetNum + limitNum - 1)
        )

        if (error) {
            console.error('History fetch error:', error);
            return res.status(500).json({ error: 'Failed to fetch history' });
        }

        res.json({
            status: 'success',
            total: count,
            analyses: data
        });
    } catch (err) {
        console.error('History error:', err);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

/**
 * GET /api/history/:id
 * Get single analysis by ID
 */
router.get('/:id', authMiddleware, async (req, res) => {

    if (!isSupabaseConfigured()) {
        return res.status(503).json({ error: 'Database not configured' });
    }

    const userId = req.user.id;
    const analysisId = req.params.id;

    try {
        const { data, error } = await retryAsync(() => supabase
            .from('analyses')
            .select('*, analysis_patches(*)')
            .eq('id', analysisId)
            .eq('user_id', userId)
            .single()
        )

        if (error || !data) {
            return res.status(404).json({ error: 'Analysis not found' });
        }

        res.json({
            status: 'success',
            analysis: data
        });
    } catch (err) {
        console.error('History fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch analysis' });
    }
});


/**
 * POST /api/history
 * Save new analysis result
 */
router.post('/', authMiddleware, async (req, res) => {
    if (!isSupabaseConfigured()) {
        return res.status(503).json({ error: 'Database not configured' });
    }

    const userId = req.user.id;
    // Extract token from header for storage operations
    const token = req.headers.authorization.split(' ')[1];

    const {
        skin_condition,
        confidence_score,
        patches_analyzed,
        voting_method,
        patches,
        image_url,
        heatmap_image_url,
        recommended_ingredients
    } = req.body;

    // Validation
    if (!skin_condition || !confidence_score) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Simpan ke database DULU tanpa gambar
        const { data: analysis, error: analysisError } = await retryAsync(() => supabase
            .from('analyses')
            .insert({
                user_id: userId,
                skin_condition,
                confidence_score,
                patches_analyzed: patches_analyzed || patches?.length || 0,
                voting_method: voting_method || 'majority',
                image_url: image_url || null,
                heatmap_image_url: heatmap_image_url || null,
                recommended_ingredients
            })
            .select()
            .single()
        );

        if (analysisError) {
            console.error('Analysis insert error:', analysisError);
            return res.status(500).json({ error: 'Failed to save analysis' });
        }

        // Simpan patches ke database DULU tanpa gambar
        if (patches && patches.length > 0) {
            const patchRecords = patches.map(p => ({
                analysis_id: analysis.id,
                region: p.region,
                predicted_class: p.predicted_class,
                confidence: p.confidence,
                image_url: p.image_url || null,
                heatmap_image_url: p.heatmap_image_url || null
            }));

            const { error: patchError } = await retryAsync(() => supabase
                .from('analysis_patches')
                .insert(patchRecords)
            );

            if (patchError) {
                console.error('Patch insert error:', patchError);
            }
        }

        // Balas frontend DULUAN — user udah bisa lanjut
        res.status(201).json({
            status: 'success',
            message: 'Analysis saved',
            analysis
        });

    } catch (err) {
        console.error('Save history error:', err);
        res.status(500).json({ error: 'Failed to save analysis' });
    }
});

/**
 * DELETE /api/history/:id
 * Delete an analysis
 */
router.delete('/:id', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const analysisId = req.params.id;

    try {
        // langsung delete aja (simple & cepat)
        const { error } = await supabase
            .from('analyses')
            .delete()
            .eq('id', analysisId)
            .eq('user_id', userId);

        if (error) {
            console.error('Delete error:', error);
            return res.status(500).json({ error: 'Failed to delete' });
        }

        return res.json({
            status: 'success',
            message: 'Deleted successfully'
        });

    } catch (err) {
        console.error('Server error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
