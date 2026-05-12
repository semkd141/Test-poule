export const notFoundHandler = (req, res) => {
    res.status(404).json({ error: "Not Found", path: req.path });
};
//# sourceMappingURL=not-found.js.map