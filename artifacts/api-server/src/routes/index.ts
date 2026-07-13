import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import reconciliacaoRouter from "./reconciliacao.js";
import dashboardRouter from "./dashboard.js";
import notasRouter from "./notas.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(notasRouter);
router.use(reconciliacaoRouter);

export default router;
