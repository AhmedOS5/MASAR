export default async function healthRoutes(app) {
  // Liveness + DB connectivity. Public, no tenant data.
  app.get("/health", async (request, reply) => {
    try {
      await app.db.raw("select 1");
      return { status: "ok" };
    } catch (err) {
      request.log.error({ err }, "health check failed");
      return reply.status(503).send({ status: "error", message: "database unavailable" });
    }
  });
}
