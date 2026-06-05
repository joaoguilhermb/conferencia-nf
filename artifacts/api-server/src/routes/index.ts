import { Router, type IRouter } from "express";
import healthRouter from "./health";
import reconciliacaoRouter from "./reconciliacao";

const router: IRouter = Router();

router.use(healthRouter);
router.use(reconciliacaoRouter);

export default router;
