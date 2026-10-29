// test-capacitor-rectifier.js
import { runTransient } from './simulator.js';

// AC Source -> Diode -> [Node 2: Filter Capacitor & Load Resistor to Ground]
const netlist = [
    { 
        type: 'V', 
        nodeA: 1, 
        nodeB: 0, 
        value: t => 5 * Math.sin(2 * Math.PI * 50 * t) 
    },
    { type: 'D', nodeA: 1, nodeB: 2 },
    { type: 'C', nodeA: 2, nodeB: 0, value: 10e-6 }, // 10 µF filter capacitor
    { type: 'R', nodeA: 2, nodeB: 0, value: 1000 }   // 1k load resistor
];

console.log("Running Filtered Rectifier Simulation...");
const results = runTransient(netlist, 0.04, 0.0001); // Run for 2 full cycles (40ms)

results.forEach(step => {
    if (Math.abs(step.time % 0.005) < 0.00005) {
        console.log(`t = ${step.time.toFixed(4)}s | Source (Node 1) = ${step.voltages[1]?.toFixed(3)}V | Filtered Output (Node 2) = ${step.voltages[2]?.toFixed(3)}V`);
    }
});