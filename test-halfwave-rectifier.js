// test-halfwave-rectifier.js
import { runTransient } from './simulator.js';

// 5V peak, 50Hz AC Sine Source -> 1k Load Resistor -> Diode Anode (Node 2) to Ground
const netlist = [
    { 
        type: 'V', 
        nodeA: 1, 
        nodeB: 0, 
        value: t => 5 * Math.sin(2 * Math.PI * 50 * t) 
    },
    { type: 'R', nodeA: 1, nodeB: 2, value: 1000 },
    { type: 'D', nodeA: 2, nodeB: 0 }
];

console.log("Running Half-Wave Rectifier Simulation (Task 31)...");
const results = runTransient(netlist, 0.02, 0.0001);

results.forEach(step => {
    if (Math.abs(step.time % 0.005) < 0.00005) {
        console.log(`t = ${step.time.toFixed(4)}s | Source (Node 1) = ${step.voltages[1]?.toFixed(3)}V | Output (Node 2) = ${step.voltages[2]?.toFixed(3)}V`);
    }
});