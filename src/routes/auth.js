/**
 * Authentication Routes
 * Supabase Auth integration
 */

import express from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req, res) => {
    if (!isSupabaseConfigured()) {
        return res.status(503).json({ error: 'Database not configured' });
    }

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
	    options: {
    		emailRedirectTo: "https://skinai.my.id/success"
  	    }
        });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        res.status(201).json({
            status: 'success',
            message: 'Registration successful. Please check your email to verify.',
            user: data.user ? {
                id: data.user.id,
                email: data.user.email
            } : null
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', async (req, res) => {
    if (!isSupabaseConfigured()) {
        return res.status(503).json({ error: 'Database not configured' });
    }

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    // 🔥 function retry
    async function loginWithRetry(email, password, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });

                if (!error) return data;

                throw error;
            } catch (err) {
                console.log(`Login attempt ${i + 1} failed`);

                if (i === retries - 1) throw err;

                await new Promise(res => setTimeout(res, 1000));
            }
        }
    }

    try {
        const data = await loginWithRetry(email, password);

        res.json({
            status: 'success',
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in: data.session.expires_in,
            user: {
                id: data.user.id,
                email: data.user.email
            }
        });

    } catch (err) {
        console.error("LOGIN ERROR:", err);

        // 🔥 handle timeout khusus
        if (err.code === 'UND_ERR_CONNECT_TIMEOUT') {
            return res.status(503).json({
                error: 'Server busy, please try again'
            });
        }

        return res.status(401).json({
            error: err.message || 'Invalid login'
        });
    }
});

/**
 * POST /api/auth/logout
 * Logout user
 */
router.post('/logout', async (req, res) => {
    if (!isSupabaseConfigured()) {
        return res.status(503).json({ error: 'Database not configured' });
    }

    try {
        res.json({ status: 'success', message: 'Logged out successfully' });
    } catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({ error: 'Logout failed' });
    }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', async (req, res) => {
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
            return res.status(401).json({ error: 'Invalid token' });
        }

        res.json({
            status: 'success',
            user: {
                id: user.id,
                email: user.email,
                created_at: user.created_at
            }
        });
    } catch (err) {
        console.error('Get user error:', err);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh', async (req, res) => {
    if (!isSupabaseConfigured()) {
        return res.status(503).json({ error: 'Database not configured' });
    }

    const { refresh_token } = req.body;

    if (!refresh_token) {
        return res.status(400).json({ error: 'Refresh token required' });
    }

    try {
        const { data, error } = await supabase.auth.refreshSession({ refresh_token });

        if (error || !data.session) {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        res.json({
            status: 'success',
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
        });
    } catch (err) {
        console.error('Refresh token error:', err);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
});

export default router;
