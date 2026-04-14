/**
 * Auth Middleware
 * Verify JWT token from Supabase
 */

import { supabase, isSupabaseConfigured } from '../services/supabase.js';

/**
 * Middleware to authenticate requests
 * Extracts user from Bearer token
 */
export const authMiddleware = async (req, res, next) => {
    if (!isSupabaseConfigured()) {
        return res.status(503).json({ error: 'Database not configured' });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // Attach user to request
        req.user = user;
        next();
    } catch (err) {
        console.error('Auth middleware error:', err);
        res.status(401).json({ error: 'Authentication failed' });
    }
};

/**
 * Optional auth middleware
 * Attaches user if token provided, but doesn't require it
 */
export const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ') || !isSupabaseConfigured()) {
        req.user = null;
        return next();
    }

    const token = authHeader.split(' ')[1];

    try {
        const { data: { user } } = await supabase.auth.getUser(token);
        req.user = user || null;
    } catch {
        req.user = null;
    }

    next();
};
