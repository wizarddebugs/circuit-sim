// test-phase2.js
import { runTransient } from './simulator.js';

console.log("--- Running Task 17: RC Charging & % Error Check ---");
const R_rc = 1000; // 1 kOhm
const C_rc = 1e-6; // 1 uF
const Vin = 10;    // 10V
const tau = R_rc * C_rc;

const rcNetlist = [
    { type: 'V', nodeA: 1, nodeB: 0, value: Vin },
    { type: 'R', nodeA: 1, nodeB: 2, value: R_rc },
    { type: 'C', nodeA: 2, nodeB: 0, value: C_rc }
];

const rcResults = runTransient(rcNetlist, 0.005, 0.000001); 

let maxError = 0;
rcResults.forEach(step => {
    // Skip the first few microseconds where theoretical value is near zero
    if (step.time > 0.0001) {
        const t = step.time;
        const simV = step.voltages[2];
        const theoV = Vin * (1 - Math.exp(-t / tau));
        const err = Math.abs((simV - theoV) / theoV) * 100;
        if (err > maxError) maxError = err;
    }
});

console.log(`Max RC Error (after initial step): ${maxError.toFixed(4)}%`);
console.log(`Task 17 Status: ${maxError < 1.0 ? 'PASS (Under 1% error)' : 'FAIL'}\n`);


console.log("--- Running Task 21: Series RLC Ringing Frequency ---");
// Lower resistance (R = 5 ohm) to make it underdamped and clearly ring!
// L = 10mH (0.01 H), C = 1uF (1e-6 F)
const rlcNetlist = [
    { type: 'V', nodeA: 1, nodeB: 0, value: 5 },          // 5V step
    { type: 'R', nodeA: 1, nodeB: 2, value: 5 },          // Low resistance for ringing
    { type: 'L', nodeA: 2, nodeB: 3, value: 0.01 },       // Inductor
    { type: 'C', nodeA: 3, nodeB: 0, value: 1e-6 }        // Capacitor
];

const rlcResults = runTransient(rlcNetlist, 0.005, 0.000005); // 5us steps
console.log("Time (s) | Node 3 Voltage (LC Ringing)");
rlcResults.forEach((step, idx) => {
    if (idx % 100 === 0) {
        console.log(`  ${step.time.toFixed(5)}s | ${step.voltages[3].toFixed(4)} V`);
    }
});