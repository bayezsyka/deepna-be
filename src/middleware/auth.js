const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token autentikasi diperlukan.' });
  }

  const secret = process.env.JWT_SECRET || 'deepna_secret_jwt_key_super_safe_2026';

  jwt.verify(token, secret, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token tidak valid atau sudah kedaluwarsa.' });
    }
    req.user = user;
    next();
  });
}

module.exports = authenticateToken;
