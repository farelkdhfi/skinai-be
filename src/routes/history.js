/**
 * History Routes
 * CRUD operations for analysis history
 */

import express from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { authMiddleware } from '../middleware/auth.js';

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
    const { limit = 50, offset = 0 } = req.query;

    try {
        const { data, error, count } = await supabase
            .from('analyses')
            .select('*, analysis_patches(*)', { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

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
        const { data, error } = await supabase
            .from('analyses')
            .select('*, analysis_patches(*)')
            .eq('id', analysisId)
            .eq('user_id', userId)
            .single();

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
 * Helper to upload image to Supabase Storage
 */
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

async function uploadToSupabase(base64String, userId, token) {
    if (!base64String) return null;

    try {
        // Remove header if present
        const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

        let buffer;
        let contentType = 'image/jpeg';
        let ext = 'jpg';

        if (matches && matches.length === 3) {
            contentType = matches[1];
            ext = contentType.split('/')[1];
            buffer = Buffer.from(matches[2], 'base64');
        } else {
            buffer = Buffer.from(base64String, 'base64');
        }

        const filename = `${crypto.randomUUID()}.${ext}`;
        const filePath = `${userId}/${filename}`;

        // Create a client with the user's token to respect RLS
        const supabaseClient = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            }
        );

        const { data, error } = await supabaseClient
            .storage
            .from('analysis-images')
            .upload(filePath, buffer, {
                contentType,
                upsert: false
            });

        if (error) {
            console.error('Supabase upload error:', error);
            throw error;
        }

        // Get public URL
        const { data: { publicUrl } } = supabaseClient
            .storage
            .from('analysis-images')
            .getPublicUrl(filePath);

        return publicUrl;
    } catch (err) {
        console.error('Image upload error:', err);
        return null;
    }
}

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
        image,         // Base64 full image
        heatmap_image, // Base64 heatmap
        recommended_ingredients // Array of strings or objects
    } = req.body;

    // Validation
    if (!skin_condition || !confidence_score) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Upload images to Supabase Storage
        const [imageUrl, heatmapUrl] = await Promise.all([
            uploadToSupabase(image, userId, token),
            uploadToSupabase(heatmap_image, userId, token)
        ]);

        // Insert analysis
        const { data: analysis, error: analysisError } = await supabase
            .from('analyses')
            .insert({
                user_id: userId,
                skin_condition,
                confidence_score,
                patches_analyzed: patches_analyzed || patches?.length || 0,
                voting_method: voting_method || 'majority',
                image_url: imageUrl,
                heatmap_image_url: heatmapUrl,
                recommended_ingredients
            })
            .select()
            .single();

        if (analysisError) {
            console.error('Analysis insert error:', analysisError);
            return res.status(500).json({ error: 'Failed to save analysis' });
        }

        // Insert patches if provided
        if (patches && patches.length > 0) {
            // Upload patch images in parallel
            const patchRecords = await Promise.all(patches.map(async (p) => {
                const [patchUrl, patchHeatmapUrl] = await Promise.all([
                    uploadToSupabase(p.image, userId, token),
                    uploadToSupabase(p.heatmap_image, userId, token)
                ]);

                return {
                    analysis_id: analysis.id,
                    region: p.region,
                    predicted_class: p.predicted_class,
                    confidence: p.confidence,
                    image_url: patchUrl,
                    heatmap_image_url: patchHeatmapUrl
                };
            }));

            const { error: patchError } = await supabase
                .from('analysis_patches')
                .insert(patchRecords);

            if (patchError) {
                console.error('Patch insert error:', patchError);
            }
        }

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
    if (!isSupabaseConfigured()) {
        return res.status(503).json({ error: 'Database not configured' });
    }

    const userId = req.user.id;
    const analysisId = req.params.id;

    try {
        // 1. Fetch analysis details using the Supabase client associated with the user
        const { data: analysis, error: fetchError } = await supabase
            .from('analyses')
            .select('*, analysis_patches(*)')
            .eq('id', analysisId)
            .eq('user_id', userId)
            .single();

        if (fetchError || !analysis) {
            // If not found, it might already be deleted or doesn't belong to user
            return res.status(404).json({ error: 'Analysis not found' });
        }

        // 2. Collect all image paths
        const pathsToDelete = [];

        // Helper to extract path from public URL
        const getPathFromUrl = (url) => {
            if (!url) return null;
            try {
                const parts = url.split('/analysis-images/');
                if (parts.length === 2) {
                    return parts[1];
                }
                return null;
            } catch (e) {
                return null;
            }
        };

        if (analysis.image_url) pathsToDelete.push(getPathFromUrl(analysis.image_url));
        if (analysis.heatmap_image_url) pathsToDelete.push(getPathFromUrl(analysis.heatmap_image_url));

        if (analysis.analysis_patches && analysis.analysis_patches.length > 0) {
            analysis.analysis_patches.forEach(patch => {
                if (patch.image_url) pathsToDelete.push(getPathFromUrl(patch.image_url));
                if (patch.heatmap_image_url) pathsToDelete.push(getPathFromUrl(patch.heatmap_image_url));
            });
        }

        // Filter out nulls
        const validPaths = pathsToDelete.filter(p => p !== null);

        // 3. Delete files from Storage if any
        if (validPaths.length > 0) {
            const token = req.headers.authorization.split(' ')[1];
            const supabaseClient = createClient(
                process.env.SUPABASE_URL,
                process.env.SUPABASE_ANON_KEY,
                {
                    global: {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }
                }
            );

            const { error: storageError } = await supabaseClient
                .storage
                .from('analysis-images')
                .remove(validPaths);

            if (storageError) {
                console.error('Storage delete warning:', storageError);
            }
        }

        // 4. Delete patches
        await supabase
            .from('analysis_patches')
            .delete()
            .eq('analysis_id', analysisId);

        // 5. Delete analysis
        const { error: deleteError } = await supabase
            .from('analyses')
            .delete()
            .eq('id', analysisId)
            .eq('user_id', userId);

        if (deleteError) {
            return res.status(500).json({ error: 'Failed to delete analysis record' });
        }

        res.json({ status: 'success', message: 'Analysis and images deleted' });
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ error: 'Failed to delete analysis' });
    }
});

export default router;
