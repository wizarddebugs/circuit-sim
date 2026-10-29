// simulator.js
import { solve } from './solver.js';
import { getDiodeCompanion } from './diode.js';

export function runTransient(netlist, tEnd, h) {
    let maxNode = 0;
    netlist.forEach(comp => {
        maxNode = Math.max(maxNode, comp.nodeA, comp.nodeB);
    });
    const numNodes = maxNode;

    let prevVoltages = new Array(numNodes + 1).fill(0);
    let inductorCurrents = {}; // Track inductor currents
    const timeResults = [];

    // Initialize inductor current trackers in netlist if any
    netlist.forEach((comp, idx) => {
        if (comp.type === 'L') {
            inductorCurrents[idx] = 0;
        }
    });

    for (let t = 0; t <= tEnd; t += h) {
        let vSourceCount = 0;
        netlist.forEach(comp => {
            if (comp.type === 'V') vSourceCount++;
        });

        const dim = numNodes + vSourceCount;

        // --- NEWTON-RAPHSON ITERATION LOOP (Tasks 28, 29, & 30) ---
        let converged = false;
        let iteration = 0;
        const maxIterations = 50;
        
        let iterVoltages = { ...prevVoltages.reduce((acc, val, idx) => { if(idx > 0) acc[idx] = val; return acc; }, {}) };
        let solution = [];

        while (!converged && iteration < maxIterations) {
            iteration++;

            const G = Array.from({ length: dim }, () => new Array(dim).fill(0));
            const I = new Array(dim).fill(0);
            let vSourceIndex = numNodes;

            netlist.forEach((comp, idx) => {
                const n1 = comp.nodeA;
                const n2 = comp.nodeB;

                let compValue = comp.value;
                if (typeof comp.value === 'function') {
                    compValue = comp.value(t);
                }

                if (comp.type === 'R') {
                    const g = 1 / compValue;
                    if (n1 !== 0) G[n1 - 1][n1 - 1] += g;
                    if (n2 !== 0) G[n2 - 1][n2 - 1] += g;
                    if (n1 !== 0 && n2 !== 0) {
                        G[n1 - 1][n2 - 1] -= g;
                        G[n2 - 1][n1 - 1] -= g;
                    }
                } 
                else if (comp.type === 'I') {
                    if (n1 !== 0) I[n1 - 1] -= compValue;
                    if (n2 !== 0) I[n2 - 1] += compValue;
                } 
                else if (comp.type === 'V') {
                    const k = vSourceIndex++;
                    if (n1 !== 0) {
                        G[n1 - 1][k] += 1;
                        G[k][n1 - 1] += 1;
                    }
                    if (n2 !== 0) {
                        G[n2 - 1][k] -= 1;
                        G[k][n2 - 1] -= 1;
                    }
                    I[k] = compValue;
                }
                else if (comp.type === 'C') {
                    const geq = compValue / h;
                    if (n1 !== 0) G[n1 - 1][n1 - 1] += geq;
                    if (n2 !== 0) G[n2 - 1][n2 - 1] += geq;
                    if (n1 !== 0 && n2 !== 0) {
                        G[n1 - 1][n2 - 1] -= geq;
                        G[n2 - 1][n1 - 1] -= geq;
                    }

                    const vOld1 = n1 !== 0 ? (prevVoltages[n1] || 0) : 0;
                    const vOld2 = n2 !== 0 ? (prevVoltages[n2] || 0) : 0;
                    const iHistory = geq * (vOld1 - vOld2);

                    if (n1 !== 0) I[n1 - 1] += iHistory;
                    if (n2 !== 0) I[n2 - 1] -= iHistory;
                }
                else if (comp.type === 'L') {
                    const geq = h / compValue;
                    if (n1 !== 0) G[n1 - 1][n1 - 1] += geq;
                    if (n2 !== 0) G[n2 - 1][n2 - 1] += geq;
                    if (n1 !== 0 && n2 !== 0) {
                        G[n1 - 1][n2 - 1] -= geq;
                        G[n2 - 1][n1 - 1] -= geq;
                    }

                    const iOld = inductorCurrents[idx] || 0;
                    const vOld1 = n1 !== 0 ? (prevVoltages[n1] || 0) : 0;
                    const vOld2 = n2 !== 0 ? (prevVoltages[n2] || 0) : 0;
                    const iHistory = iOld + geq * (vOld1 - vOld2);

                    if (n1 !== 0) I[n1 - 1] -= iHistory;
                    if (n2 !== 0) I[n2 - 1] += iHistory;
                }
                else if (comp.type === 'D') {
                    // --- TASKS 27 & 28: DIODE NORTON COMPANION & STAMPING ---
                    const vA = n1 !== 0 ? (iterVoltages[n1] || 0) : 0;
                    const vB = n2 !== 0 ? (iterVoltages[n2] || 0) : 0;
                    const vOld = vA - vB;

                    const { geq, ieq } = getDiodeCompanion(vOld);

                    // Stamp conductance into G matrix
                    if (n1 !== 0) G[n1 - 1][n1 - 1] += geq;
                    if (n2 !== 0) G[n2 - 1][n2 - 1] += geq;
                    if (n1 !== 0 && n2 !== 0) {
                        G[n1 - 1][n2 - 1] -= geq;
                        G[n2 - 1][n1 - 1] -= geq;
                    }

                    // Stamp equivalent current source into I vector
                    if (n1 !== 0) I[n1 - 1] -= ieq;
                    if (n2 !== 0) I[n2 - 1] += ieq;
                }
            });

            solution = solve(G, I);

            // --- TASK 30: VOLTAGE-STEP LIMITING & CONVERGENCE CHECK ---
            let maxChange = 0;
            for (let i = 0; i < numNodes; i++) {
                let nodeVal = solution[i];
                let oldVal = iterVoltages[i + 1] || 0;

                // Limit maximum voltage jump per iteration to prevent exponential overflow/NaN
                const maxJump = 0.5;
                if (nodeVal - oldVal > maxJump) nodeVal = oldVal + maxJump;
                if (nodeVal - oldVal < -maxJump) nodeVal = oldVal - maxJump;

                if (isNaN(nodeVal) || !isFinite(nodeVal)) {
                    nodeVal = oldVal;
                }

                maxChange = Math.max(maxChange, Math.abs(nodeVal - oldVal));
                iterVoltages[i + 1] = nodeVal;
            }

            if (maxChange < 1e-6 || iteration >= maxIterations) {
                converged = true;
            }
        }

        const currentVoltages = {};
        for (let i = 0; i < numNodes; i++) {
            currentVoltages[i + 1] = solution[i];
            prevVoltages[i + 1] = solution[i];
        }

        // Update inductor current history for next step
        netlist.forEach((comp, idx) => {
            if (comp.type === 'L') {
                const geq = h / comp.value;
                const v1 = comp.nodeA !== 0 ? currentVoltages[comp.nodeA] : 0;
                const v2 = comp.nodeB !== 0 ? currentVoltages[comp.nodeB] : 0;
                inductorCurrents[idx] = inductorCurrents[idx] + geq * (v1 - v2);
            }
        });

        timeResults.push({ 
            time: Number(t.toFixed(6)), 
            voltages: currentVoltages,
            inductorCurrents: { ...inductorCurrents }
        });
    }

    return timeResults;
}