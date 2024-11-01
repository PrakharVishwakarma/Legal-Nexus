// Middlewares/roleMw.js


const roleMiddleware = (allowedRoles) => (req, res, next) => {
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ message: "Access denied for this role." });
    }
    next();
};

module.exports = { roleMiddleware };
