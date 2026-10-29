// tests.js
import { runCircuit } from './simulator.js';

function assertClose(actual, expected, tolerance = 1e-4) {
    return Math.abs(actual - expected) < tolerance;
}

// Test 1: Voltage Divider (Tasks 12 & 13)
const test1Res = runCircuit([
    { type: 'V', nodeA: 1, nodeB: 0, value: 10 },
    { type: 'R', nodeA: 1, nodeB: 2, value: 1000 },
    { type: 'R', nodeA: 2, nodeB: 0, value: 1000 }
]);
const pass1 = assertClose(test1Res[2], 5.0);
console.log(`Test 1 (Voltage Divider): ${pass1 ? 'PASS' : 'FAIL'}`);

// Test 2: Current Source with Resistor
const test2Res = runCircuit([
    { type: 'I', nodeA: 0, nodeB: 1, value: 0.001 },
    { type: 'R', nodeA: 1, nodeB: 0, value: 1000 }
]);
const pass2 = assertClose(test2Res[1], 1.0);
console.log(`Test 2 (Current Source): ${pass2 ? 'PASS' : 'FAIL'}`);

if (pass1 && pass2) {
    console.log("All tests show PASS!"); // Task 14
}