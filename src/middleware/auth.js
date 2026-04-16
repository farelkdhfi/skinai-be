import jwt from 'jsonwebtoken';

export const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Decode token TANPA call Supabase
        const decoded = jwt.decode(token);

        if (!decoded) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Ambil user dari token
        req.user = {
            id: decoded.sub,
            email: decoded.email
        };

        next();
    } catch (err) {
        console.error('Auth error:', err);
        res.status(401).json({ error: 'Authentication failed' });
    }
};

/**
 * Optional auth middleware
 * Attaches user if token provided, but doesn't require it
 */
export const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.decode(token);

        if (!decoded) {
            req.user = null;
        } else {
            req.user = {
                id: decoded.sub,
                email: decoded.email
            };
        }
    } catch {
        req.user = null;
    }

    next();
};