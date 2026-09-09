import { Router, type IRouter } from "express";
import billingRouter from "./billing";
import healthRouter from "./health";
import registrationRouter from "./registration";

const router: IRouter = Router();

router.use(healthRouter);
router.use(billingRouter);
router.use(registrationRouter);

export default router;
