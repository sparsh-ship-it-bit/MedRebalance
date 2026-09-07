import { Router, type IRouter } from "express";
import billingRouter from "./billing";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(billingRouter);

export default router;
