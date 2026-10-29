// test-phase2-complete.js
import { runTransient } from './simulator.js';

console.log("--- Running Task 19: RL Circuit Current & % Error Check ---");
const R_rl = 50;   // 50 Ohms
const L_rl = 0.01; // 10 mH
const Vin_rl = 5;  // 5V DC step
const tau_rl = L_rl / R_rl; // Time constant = 0.2ms

const rlNetlist = [
    { type: 'V', nodeA: 1, nodeB: 0, value: Vin_rl },
    { type: 'R', nodeA: 1, nodeB: 2, value: R_rl },
    { type: 'L', nodeA: 2, nodeB: 0, value: L_rl }
];

const rlResults = runTransient(rlNetlist, 0.002, 0.000001);

let maxRlError = 0;
rlResults.forEach(step => {
    // Measure error after the initial microsecond transient window
    if (step.time > 0.0002) {
        const t = step.time;
        const simCurrent = step.inductorCurrents[2] || 0;
        const theoCurrent = (Vin_rl / R_rl) * (1 - Math.exp(-t / tau_rl));
        
        const err = Math.abs((simCurrent - theoCurrent) / theoCurrent) * 100;
        if (err > maxRlError) maxRlError = err;
    }
});

console.log(`Max RL Current Error: ${maxRlError.toFixed(4)}%`);
console.log(`Task 19 Status: ${maxRlError < 2.0 ? 'PASS (Under 2% error)' : 'FAIL'}\n`);


console.log("--- Running Task 20: Time-Varying Sine Wave Source ---");
const sineNetlist = [
    { 
        type: 'V', 
        nodeA: 1, 
        nodeB: 0, 
        value: (t) => 5 * Math.sin(2 * Math.PI * 1000 * t) 
    },
    { type: 'R', nodeA: 1, nodeB: 2, value: 1000 },
    { type: 'C', nodeA: 2, nodeB: 0, value: 0.000001 } 
];

const sineResults = runTransient(sineNetlist, 0.002, 0.00005);
console.log("Time (s)    | Source Voltage (V) | Filtered Output Node 2 (V)");
console.log("---------------------------------------------------------");
sineResults.forEach((step, idx) => {
    if (idx % 5 === 0) {
        const t = step.time;
        const srcVal = 5 * Math.sin(2 * Math.PI * 1000 * t);
        const outV = step.voltages[2];
        console.log(`${t.toFixed(5)}s |     ${srcVal.toFixed(4)} V      |      ${outV.toFixed(4)} V`);
    }
});