// test-diode-circuit.js
import { runTransient } from './simulator.js';

// Circuit: DC 5V source -> 1k Ohm resistor -> Diode Anode (Node 2) -> Ground (Node 0)
const netlist = [
    { type: 'V', nodeA: 1, nodeB: 0, value: 5.0 },
    { type: 'R', nodeA: 1, nodeB: 2, value: 1000 },
    { type: 'D', nodeA: 2, nodeB: 0 }
];

console.log("Running Diode-Resistor Newton-Raphson test...");
const results = runTransient(netlist, 0.001, 0.0001);

const finalStep = results[results.length - 1];
console.log(`Final Node 2 Voltage (Diode Voltage Drop): ${finalStep.voltages[2].toFixed(4)}V`);