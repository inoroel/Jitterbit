const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'chave_secreta_jwt';

function authenticate(req, res, next) {
    const header = req.headers['authorization'];

    if (!header) {
        return res.status(401).json({ error: 'Token not provided.' });
    }

    const token = header.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Invalid token format.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid or expired token.' });
    }
}

function generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

module.exports = { authenticate, generateToken };
