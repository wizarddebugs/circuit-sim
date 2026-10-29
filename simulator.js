// simulator.js
import { solve } from './solver.js';

export function runTransient(netlist, tEnd, h) {
    let maxNode = 0;
    netlist.forEach(comp => {
        maxNode = Math.max(maxNode, comp.nodeA, comp.nodeB);
    });
    const numNodes = maxNode;

    // Task 15: Store results in arrays across N steps of size h
    let prevVoltages = new Array(numNodes + 1).fill(0);
    let inductorCurrents = {}; // Track inductor currents for task 18/19
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
        const G = Array.from({ length: dim }, () => new Array(dim).fill(0));
        const I = new Array(dim).fill(0);

        let vSourceIndex = numNodes;

        netlist.forEach((comp, idx) => {
            const n1 = comp.nodeA;
            const n2 = comp.nodeB;

            // Task 20: Evaluate time-varying sources (e.g. sine or pulse functions)
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
                // Task 16: Capacitor Companion Model (Backward Euler)
                const geq = compValue / h; // C / h
                
                if (n1 !== 0) G[n1 - 1][n1 - 1] += geq;
                if (n2 !== 0) G[n2 - 1][n2 - 1] += geq;
                if (n1 !== 0 && n2 !== 0) {
                    G[n1 - 1][n2 - 1] -= geq;
                    G[n2 - 1][n1 - 1] -= geq;
                }

                const vOld1 = n1 !== 0 ? prevVoltages[n1] : 0;
                const vOld2 = n2 !== 0 ? prevVoltages[n2] : 0;
                const iHistory = geq * (vOld1 - vOld2);

                if (n1 !== 0) I[n1 - 1] += iHistory;
                if (n2 !== 0) I[n2 - 1] -= iHistory;
            }
            else if (comp.type === 'L') {
                // Task 18: Inductor Companion Model
                const geq = h / compValue; // h / L
                
                if (n1 !== 0) G[n1 - 1][n1 - 1] += geq;
                if (n2 !== 0) G[n2 - 1][n2 - 1] += geq;
                if (n1 !== 0 && n2 !== 0) {
                    G[n1 - 1][n2 - 1] -= geq;
                    G[n2 - 1][n1 - 1] -= geq;
                }

                const iOld = inductorCurrents[idx] || 0;
                const vOld1 = n1 !== 0 ? prevVoltages[n1] : 0;
                const vOld2 = n2 !== 0 ? prevVoltages[n2] : 0;
                const iHistory = iOld + geq * (vOld1 - vOld2);

                if (n1 !== 0) I[n1 - 1] -= iHistory;
                if (n2 !== 0) I[n2 - 1] += iHistory;
            }
        });

        const solution = solve(G, I);

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

        // Store results including node voltages and tracked inductor currents
        timeResults.push({ 
            time: Number(t.toFixed(6)), 
            voltages: currentVoltages,
            inductorCurrents: { ...inductorCurrents }
        });
    }

    return timeResults;
}