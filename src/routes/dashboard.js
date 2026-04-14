/**
 * Dashboard Routes
 * Statistics and trend data
 */

import express from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/dashboard
 * Get dashboard statistics and trend data
 */
router.get('/', authMiddleware, async (req, res) => {
    if (!isSupabaseConfigured()) {
        return res.status(503).json({ error: 'Database not configured' });
    }

    const userId = req.user.id;

    try {
        // Get all analyses for user
        const { data: analyses, error } = await supabase
            .from('analyses')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Dashboard fetch error:', error);
            return res.status(500).json({ error: 'Failed to fetch dashboard data' });
        }

        // Calculate statistics
        const stats = calculateStats(analyses || []);

        // Prepare trend data
        // Prepare trend data
        const trendData = (analyses || []).slice(0, 30).map(a => ({
            date: new Date(a.created_at).toLocaleDateString(),
            condition: a.skin_condition,
            value: Math.round(a.confidence_score * 100), // Convert to percentage
            confidence: a.confidence_score
        })).reverse(); // Oldest to newest for the chart

        // Recent analyses (last 5)
        const recentAnalyses = (analyses || []).slice(0, 5);

        res.json({
            status: 'success',
            stats,
            trend_data: trendData,
            recent_analyses: recentAnalyses
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

/**
 * Calculate dashboard statistics
 */
function calculateStats(analyses) {
    if (!analyses || analyses.length === 0) {
        return {
            total_analyses: 0,
            most_frequent_condition: null,
            average_confidence: 0,
            improvement_percentage: null,
            condition_distribution: []
        };
    }

    const total = analyses.length;

    // Most frequent condition and distribution
    const conditionCounts = {};
    analyses.forEach(a => {
        conditionCounts[a.skin_condition] = (conditionCounts[a.skin_condition] || 0) + 1;
    });

    const mostFrequent = Object.keys(conditionCounts).reduce((a, b) =>
        conditionCounts[a] > conditionCounts[b] ? a : b
    );

    const conditionDistribution = Object.entries(conditionCounts).map(([name, value]) => ({
        name,
        value
    }));

    // Average confidence
    const avgConfidence = analyses.reduce((sum, a) => sum + a.confidence_score, 0) / total;

    // Improvement calculation (comparing first half vs second half for "Normal" ratio)
    let improvement = null;
    if (total >= 4) {
        const midpoint = Math.floor(total / 2);
        const recentHalf = analyses.slice(0, midpoint);
        const olderHalf = analyses.slice(midpoint);

        const recentNormal = recentHalf.filter(a => a.skin_condition === 'Normal').length;
        const olderNormal = olderHalf.filter(a => a.skin_condition === 'Normal').length;

        if (olderNormal > 0) {
            improvement = ((recentNormal - olderNormal) / olderNormal) * 100;
        }
    }

    return {
        total_analyses: total,
        most_frequent_condition: mostFrequent,
        average_confidence: Math.round(avgConfidence * 100) / 100,
        improvement_percentage: improvement !== null ? Math.round(improvement * 10) / 10 : null,
        condition_distribution: conditionDistribution
    };
}

export default router;
