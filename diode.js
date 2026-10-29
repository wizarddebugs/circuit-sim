// diode.js

// Standard diode parameters
const IS = 1e-12;   // Saturation current (1 pA)
const VT = 0.026;   // Thermal voltage (~26mV at room temperature)

/**
 * Computes diode current given the voltage across it using the Shockley equation.
 * Includes clamping to prevent exponential overflow / NaN errors.
 */
export function getDiodeCurrent(v) {
    // Clamp voltage to prevent Math.exp() explosion during early iterations
    if (v > 2.0) v = 2.0;
    if (v < -2.0) v = -2.0;

    // Shockley Diode Equation: ID = Is * (exp(V / Vt) - 1)
    return IS * (Math.exp(v / VT) - 1);
}

/**
 * Computes the dynamic conductance (slope: dID/dV) of the diode at a given voltage.
 */
export function getDiodeConductance(v) {
    if (v > 2.0) v = 2.0;
    if (v < -2.0) v = -2.0;

    // Derivative of Shockley equation: gd = (Is / Vt) * exp(V / Vt)
    return (IS / VT) * Math.exp(v / VT);
}

/**
 * Computes the Norton companion model (equivalent conductance and current source)
 * for the Newton-Raphson iteration based on the previous voltage guess (vOld).
 */
export function getDiodeCompanion(vOld) {
    const gd = getDiodeConductance(vOld);
    const id = getDiodeCurrent(vOld);

    // Equivalent parallel current source: Ieq = ID(vOld) - gd * vOld
    const ieq = id - (gd * vOld);

    return {
        geq: gd,
        ieq: ieq
    };
}