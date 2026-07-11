import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { enforceApiAccess } from "../middleware/access.js";
import { burnoutScore, dependencyRisk, historicalVelocityDeviation, skillGapRisk, sprintRiskScore, sprintUtilisation, teamCapacity, workloadScore } from "../services/analysis.js";

const router = Router();
router.use(requireAuth);
router.use(enforceApiAccess);

const sprintRiskInput = z.object({
  plannedPoints: z.number(),
  capacity: z.number(),
  blockedTickets: z.number(),
  totalTickets: z.number(),
  workload: z.number(),
  focusLoad: z.number(),
  requiredSkills: z.number(),
  coveredSkills: z.number(),
  velocityHistory: z.array(z.number()),
});

router.post("/sprint-risk", (req, res) => {
  const parsed = sprintRiskInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid sprint risk input", issues: parsed.error.issues });
  const input = parsed.data;
  const utilisation = sprintUtilisation(input.plannedPoints, input.capacity);
  const dependency = dependencyRisk(input.blockedTickets, input.totalTickets);
  const burnout = burnoutScore(input.workload, input.blockedTickets, input.focusLoad);
  const skillGap = skillGapRisk(input.requiredSkills, input.coveredSkills);
  const velocity = historicalVelocityDeviation(input.plannedPoints, input.velocityHistory);
  const risk = sprintRiskScore({
    utilisation: utilisation.finalScore,
    dependencyRisk: dependency.finalScore,
    burnoutRisk: burnout.finalScore,
    skillGapRisk: skillGap.finalScore,
    velocityDeviation: velocity.finalScore,
  });
  return res.json({ utilisation, dependency, burnout, skillGap, velocity, risk });
});

router.get("/examples", (_req, res) => {
  return res.json({
    teamCapacity: teamCapacity([{ capacity: 34, availability: 1 }, { capacity: 32, availability: 0.9 }]),
    workloadScore: workloadScore(38, 32),
  });
});

export default router;
