import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import profileRouter from "./profile";
import scoreRouter from "./score";
import historyRouter from "./history";
import gmailRouter from "./gmail";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(profileRouter);
router.use(scoreRouter);
router.use(historyRouter);
router.use(gmailRouter);

export default router;
