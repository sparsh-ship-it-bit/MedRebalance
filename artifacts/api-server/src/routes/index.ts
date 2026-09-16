import { Router, type IRouter } from "express";
import billingRouter from "./billing";
import healthRouter from "./health";
import registrationRouter from "./registration";
import roleGateRouter from "./roleGate";

const router: IRouter = Router();

router.use(healthRouter);
router.use(billingRouter);
router.use(registrationRouter);
router.use(roleGateRouter);

export default router;
