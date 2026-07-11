export type CalculationResult = {
  inputValues: Record<string, number>;
  formula: string;
  weights: Record<string, number>;
  intermediate: Record<string, number>;
  finalScore: number;
  explanation: string;
  calculationVersion: "2026.07";
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function teamCapacity(members: { capacity: number; availability: number }[]): CalculationResult {
  const rawCapacity = members.reduce((sum, member) => sum + member.capacity * member.availability, 0);
  return {
    inputValues: { members: members.length, rawCapacity },
    formula: "sum(member.capacity * member.availability)",
    weights: {},
    intermediate: { rawCapacity },
    finalScore: Math.round(rawCapacity),
    explanation: "Team capacity is the sum of each member's available sprint capacity.",
    calculationVersion: "2026.07",
  };
}

export function sprintUtilisation(plannedPoints: number, capacity: number): CalculationResult {
  const utilisation = capacity === 0 ? 100 : (plannedPoints / capacity) * 100;
  return {
    inputValues: { plannedPoints, capacity },
    formula: "(plannedPoints / capacity) * 100",
    weights: {},
    intermediate: { utilisation },
    finalScore: clamp(utilisation),
    explanation: "Utilisation shows how much planned sprint work consumes available capacity.",
    calculationVersion: "2026.07",
  };
}

export function workloadScore(assignedPoints: number, memberCapacity: number): CalculationResult {
  const score = memberCapacity === 0 ? 100 : (assignedPoints / memberCapacity) * 100;
  return {
    inputValues: { assignedPoints, memberCapacity },
    formula: "(assignedPoints / memberCapacity) * 100",
    weights: {},
    intermediate: { score },
    finalScore: clamp(score),
    explanation: "Workload score compares assigned story points with individual sprint capacity.",
    calculationVersion: "2026.07",
  };
}

export function burnoutScore(workload: number, blockedTasks: number, focusLoad: number): CalculationResult {
  const weights = { workload: 0.55, blockedTasks: 0.3, focusLoad: 0.15 };
  const blockedImpact = Math.min(blockedTasks * 18, 100);
  const score = workload * weights.workload + blockedImpact * weights.blockedTasks + focusLoad * weights.focusLoad;
  return {
    inputValues: { workload, blockedTasks, focusLoad },
    formula: "workload*.55 + min(blockedTasks*18,100)*.30 + focusLoad*.15",
    weights,
    intermediate: { blockedImpact, score },
    finalScore: clamp(score),
    explanation: "Burnout risk rises with overload, unresolved blockers, and context switching.",
    calculationVersion: "2026.07",
  };
}

export function dependencyRisk(blockedTickets: number, totalTickets: number): CalculationResult {
  const ratio = totalTickets === 0 ? 0 : blockedTickets / totalTickets;
  return {
    inputValues: { blockedTickets, totalTickets },
    formula: "(blockedTickets / totalTickets) * 100",
    weights: {},
    intermediate: { ratio },
    finalScore: clamp(ratio * 100),
    explanation: "Dependency risk is based on the share of tickets currently blocked.",
    calculationVersion: "2026.07",
  };
}

export function skillGapRisk(requiredSkills: number, coveredSkills: number): CalculationResult {
  const gap = Math.max(requiredSkills - coveredSkills, 0);
  const score = requiredSkills === 0 ? 0 : (gap / requiredSkills) * 100;
  return {
    inputValues: { requiredSkills, coveredSkills },
    formula: "max(requiredSkills-coveredSkills,0)/requiredSkills*100",
    weights: {},
    intermediate: { gap, score },
    finalScore: clamp(score),
    explanation: "Skill-gap risk measures uncovered required skills for sprint work.",
    calculationVersion: "2026.07",
  };
}

export function historicalVelocityDeviation(plannedPoints: number, velocityHistory: number[]): CalculationResult {
  const averageVelocity = velocityHistory.length ? velocityHistory.reduce((sum, value) => sum + value, 0) / velocityHistory.length : plannedPoints;
  const deviation = averageVelocity === 0 ? 0 : ((plannedPoints - averageVelocity) / averageVelocity) * 100;
  return {
    inputValues: { plannedPoints, averageVelocity },
    formula: "((plannedPoints - averageVelocity) / averageVelocity) * 100",
    weights: {},
    intermediate: { deviation },
    finalScore: clamp(Math.max(deviation, 0)),
    explanation: "Velocity deviation flags plans that exceed recent delivery pace.",
    calculationVersion: "2026.07",
  };
}

export function sprintRiskScore(params: {
  utilisation: number;
  dependencyRisk: number;
  burnoutRisk: number;
  skillGapRisk: number;
  velocityDeviation: number;
}): CalculationResult {
  const weights = { utilisation: 0.25, dependencyRisk: 0.25, burnoutRisk: 0.25, skillGapRisk: 0.1, velocityDeviation: 0.15 };
  const score =
    params.utilisation * weights.utilisation +
    params.dependencyRisk * weights.dependencyRisk +
    params.burnoutRisk * weights.burnoutRisk +
    params.skillGapRisk * weights.skillGapRisk +
    params.velocityDeviation * weights.velocityDeviation;
  return {
    inputValues: params,
    formula: "weighted sum of utilisation, dependency, burnout, skill gap, and velocity deviation",
    weights,
    intermediate: { score },
    finalScore: clamp(score),
    explanation: "Sprint risk is deterministic and combines capacity pressure, blockers, team strain, skills, and historical delivery variance.",
    calculationVersion: "2026.07",
  };
}
