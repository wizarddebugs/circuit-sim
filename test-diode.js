// test-diode.js
import { getDiodeCurrent, getDiodeConductance, getDiodeCompanion } from './diode.js';

console.log("--- Testing Task 27: Diode Current & Slope Functions ---");

const testVoltages = [-1.0, 0.0, 0.5, 0.6, 0.7, 0.8];

testVoltages.forEach(v => {
    const id = getDiodeCurrent(v);
    const gd = getDiodeConductance(v);
    const companion = getDiodeCompanion(v);

    console.log(`V = ${v.toFixed(1)}V | ID = ${id.toExponential(4)}A | Conductance (gd) = ${gd.toExponential(4)}S | Ieq = ${companion.ieq.toExponential(4)}A`);
});