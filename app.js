// app.js
import { runTransient } from './simulator.js';

const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

// State tracking
let currentMode = 'sandbox'; // 'sandbox' or 'plot'
const circles = [];

// --- CANVAS NODE SANDBOX LOGIC ---
canvas.addEventListener('click', (event) => {
    if (currentMode !== 'sandbox') return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    circles.push({ x, y });
    redrawSandbox();
});

document.getElementById('clearBtn').addEventListener('click', () => {
    currentMode = 'sandbox';
    circles.length = 0;
    redrawSandbox();
});

function redrawSandbox() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid guide for sandbox
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Draw nodes
    circles.forEach((c, idx) => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#4CAF50';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '10px sans-serif';
        ctx.fillText(`Node ${idx + 1}`, c.x + 12, c.y + 4);
    });
}


// --- PHASE 3 PLOTTING ENGINE (Tasks 22 - 26) ---
function drawGridAndAxes(xMin, xMax, yMin, yMax) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padding = 60;
    const width = canvas.width - 2 * padding;
    const height = canvas.height - 2 * padding;

    // Task 22: Grid, axes, and labels
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;

    const xSteps = 10;
    const ySteps = 8;

    for (let i = 0; i <= xSteps; i++) {
        const x = padding + (width / xSteps) * i;
        ctx.beginPath(); ctx.moveTo(x, padding); ctx.lineTo(x, canvas.height - padding); ctx.stroke();
    }

    for (let i = 0; i <= ySteps; i++) {
        const y = padding + (height / ySteps) * i;
        ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(canvas.width - padding, y); ctx.stroke();
    }

    // Axis box
    ctx.strokeStyle = '#777777';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(padding, padding, width, height);

    ctx.fillStyle = '#cccccc';
    ctx.font = '11px Consolas';
    ctx.textAlign = 'center';

    // X-Axis Labels
    for (let i = 0; i <= xSteps; i++) {
        const val = xMin + ((xMax - xMin) / xSteps) * i;
        const x = padding + (width / xSteps) * i;
        ctx.fillText((val * 1000).toFixed(1) + 'ms', x, canvas.height - padding + 20);
    }

    // Y-Axis Labels
    ctx.textAlign = 'right';
    for (let i = 0; i <= ySteps; i++) {
        const val = yMax - ((yMax - yMin) / ySteps) * i;
        const y = padding + (height / ySteps) * i;
        ctx.fillText(val.toFixed(1) + 'V', padding - 10, y + 4);
    }
}

function plotLine(dataPoints, xMin, xMax, yMin, yMax, color, lineWidth = 2) {
    const padding = 60;
    const width = canvas.width - 2 * padding;
    const height = canvas.height - 2 * padding;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    dataPoints.forEach((pt, idx) => {
        const px = padding + ((pt.x - xMin) / (xMax - xMin)) * width;
        const py = canvas.height - padding - ((pt.y - yMin) / (yMax - yMin)) * height;

        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });

    ctx.stroke();
}

function drawLegend() {
    const padding = 70;
    ctx.font = '12px sans-serif';
    
    // Sim Trace Legend
    ctx.fillStyle = '#4ec9b0';
    ctx.fillRect(padding, padding, 15, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Simulated RC (Node 2)', padding + 25, padding + 6);

    // Theoretical Trace Legend
    ctx.fillStyle = '#ce9178';
    ctx.fillRect(padding, padding + 20, 15, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Theoretical Formula', padding + 25, padding + 26);
}

// Hook up simulation plot button (Tasks 24, 25, 26)
document.getElementById('runPlotBtn').addEventListener('click', () => {
    currentMode = 'plot';

    const R = 1000;
    const C = 1e-6;
    const Vin = 10;
    const tau = R * C;
    const tEnd = 0.005;

    const netlist = [
        { type: 'V', nodeA: 1, nodeB: 0, value: Vin },
        { type: 'R', nodeA: 1, nodeB: 2, value: R },
        { type: 'C', nodeA: 2, nodeB: 0, value: C }
    ];

    const results = runTransient(netlist, tEnd, 0.00002);

    // Map simulation results
    const simPoints = results.map(step => ({ x: step.time, y: step.voltages[2] }));

    // Generate theoretical curve points
    const theoPoints = [];
    for (let t = 0; t <= tEnd; t += 0.00002) {
        const theoV = Vin * (1 - Math.exp(-t / tau));
        theoPoints.push({ x: t, y: theoV });
    }

    // Render Canvas Graph
    drawGridAndAxes(0, tEnd, 0, Vin);
    plotLine(simPoints, 0, tEnd, 0, Vin, '#4ec9b0', 2.5); // Task 24
    plotLine(theoPoints, 0, tEnd, 0, Vin, '#ce9178', 1.5); // Task 26 (Theoretical Overlay)
    drawLegend(); // Task 25 (Multiple traces & legend)
});

// Initial render
redrawSandbox();