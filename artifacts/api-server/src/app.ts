import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// In production the Express server serves the Vite build and falls back to
// index.html for client-side routing. This block must come AFTER all API
// routes so that /api/* is never intercepted by the static middleware.
if (process.env["NODE_ENV"] === "production") {
  const { serveStatic } = await import("./static.js");
  serveStatic(app);
}

export default app;
