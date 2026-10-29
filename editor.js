// editor.js
import { runTransient } from './simulator.js';

const canvas = document.getElementById('circuitCanvas');
const ctx = canvas.getContext('2d');
const consoleOutput = document.getElementById('consoleOutput');
const clearBtn = document.getElementById('clearBtn');
const simulateBtn = document.getElementById('simulateBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const exampleSelect = document.getElementById('exampleSelect');
const palette = document.getElementById('palette');

const saveBtn = document.getElementById('saveBtn');
const loadBtn = document.getElementById('loadBtn');
const importFile = document.getElementById('importFile');

let activeTool = 'SELECT';
let components = [];
let wires = [];
let groundPins = []; 
let probedNodes = new Set(); 

let selectedComp = null;
let isDrawing = false;
let isDraggingComp = false;
let dragOffX = 0, dragOffY = 0;
let startX = 0, startY = 0;
let currentX = 0, currentY = 0;

let lastSimulationResults = null;
const GRID = 20;

// Initialize Chart.js
let waveformChart = null;
try {
    const chartCtx = document.getElementById('waveformChart').getContext('2d');
    waveformChart = new Chart(chartCtx, {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: { title: { display: true, text: 'Time (s)', color: '#ccc' }, ticks: { color: '#888' }, grid: { color: '#333' } },
                y: { title: { display: true, text: 'Voltage (V)', color: '#ccc' }, ticks: { color: '#888' }, grid: { color: '#333' } }
            },
            plugins: { legend: { labels: { color: '#fff' } } }
        }
    });
} catch (e) { console.error("Chart init error:", e); }

function snap(val) { return Math.round(val / GRID) * GRID; }

palette.addEventListener('click', (e) => {
    const btn = e.target.closest('.tool-btn');
    if (!btn || btn.id === 'clearBtn' || btn.id === 'resetBtn' || btn.id === 'saveBtn' || btn.id === 'loadBtn') return;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTool = btn.dataset.tool;
    selectedComp = null;
    drawCanvas();
});

// Example Presets
exampleSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    clearCanvasState();

    if (val === 'rc') {
        groundPins.push({ x: 80, y: 240 });
        components.push({ type: 'V', x1: 80, y1: 240, x2: 80, y2: 120, value: 5 });
        components.push({ type: 'R', x1: 80, y1: 120, x2: 220, y2: 120, value: 1000 });
        components.push({ type: 'C', x1: 220, y1: 120, x2: 220, y2: 240, value: 10e-6 });
        wires.push({ x1: 80, y1: 240, x2: 220, y2: 240 });
        log("Loaded Example: RC Filter Circuit");
    } else if (val === 'rectifier') {
        groundPins.push({ x: 60, y: 260 });
        components.push({ type: 'V', x1: 60, y1: 260, x2: 60, y2: 100, value: "t => 5 * Math.sin(2 * Math.PI * 50 * t)" });
        components.push({ type: 'D', x1: 60, y1: 100, x2: 200, y2: 100 });
        components.push({ type: 'R', x1: 200, y1: 100, x2: 200, y2: 260, value: 1000 });
        wires.push({ x1: 60, y1: 260, x2: 200, y2: 260 });
        log("Loaded Example: Half-Wave Rectifier Circuit");
    } else if (val === 'divider') {
        groundPins.push({ x: 100, y: 280 });
        components.push({ type: 'V', x1: 100, y1: 280, x2: 100, y2: 100, value: 10 });
        components.push({ type: 'R', x1: 100, y1: 100, x2: 240, y2: 100, value: 1000 });
        components.push({ type: 'R', x1: 240, y1: 100, x2: 240, y2: 280, value: 1000 });
        wires.push({ x1: 100, y1: 280, x2: 240, y2: 280 });
        log("Loaded Example: Voltage Divider Circuit");
    }

    exampleSelect.selectedIndex = 0;
    drawCanvas();
});

// JSON Save & Load
saveBtn.addEventListener('click', () => {
    const projectData = { components, wires, groundPins };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projectData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "circuit_schematic.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    log("Circuit saved to JSON successfully.");
});

loadBtn.addEventListener('click', () => { importFile.click(); });

importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            clearCanvasState();
            components = data.components || [];
            wires = data.wires || [];
            groundPins = data.groundPins || [];
            drawCanvas();
            log("Circuit loaded from JSON successfully.");
        } catch (err) {
            log(`Error loading JSON: ${err.message}`);
        }
    };
    reader.readAsText(file);
    importFile.value = '';
});

window.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedComp) {
        components = components.filter(c => c !== selectedComp);
        log(`Deleted component.`);
        selectedComp = null;
        drawCanvas();
    }
});

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = snap(e.clientX - rect.left);
    const clickY = snap(e.clientY - rect.top);

    const { posToNodeMap } = extractNetlist();
    const key = `${clickX},${clickY}`;
    if (posToNodeMap.has(key)) {
        const nodeId = posToNodeMap.get(key);
        if (probedNodes.has(nodeId)) {
            probedNodes.delete(nodeId);
            log(`Unprobed Node ${nodeId}`);
        } else {
            probedNodes.add(nodeId);
            log(`Probed Node ${nodeId}`);
        }
        if (lastSimulationResults) updateChart(lastSimulationResults);
        drawCanvas();
        return;
    }

    if (activeTool === 'SELECT') {
        const clicked = components.find(c => isNearSegment(clickX, clickY, c.x1, c.y1, c.x2, c.y2));
        if (clicked) {
            selectedComp = clicked;
            isDraggingComp = true;
            dragOffX = clickX - clicked.x1;
            dragOffY = clickY - clicked.y1;
            drawCanvas();
            return;
        } else {
            selectedComp = null;
        }
    }

    if (activeTool === 'GND') {
        groundPins.push({ x: clickX, y: clickY });
        log(`Ground added at (${clickX}, ${clickY})`);
        drawCanvas();
        return;
    }

    startX = clickX;
    startY = clickY;
    currentX = startX;
    currentY = startY;
    isDrawing = true;
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = snap(e.clientX - rect.left);
    const cy = snap(e.clientY - rect.top);

    if (isDraggingComp && selectedComp) {
        const dx = cx - dragOffX - selectedComp.x1;
        const dy = cy - dragOffY - selectedComp.y1;
        selectedComp.x1 += dx; selectedComp.y1 += dy;
        selectedComp.x2 += dx; selectedComp.y2 += dy;
        drawCanvas();
        return;
    }

    if (isDrawing) {
        currentX = cx; currentY = cy;
        drawCanvas();
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (isDraggingComp) { isDraggingComp = false; drawCanvas(); return; }
    if (!isDrawing) return;
    isDrawing = false;

    const rect = canvas.getBoundingClientRect();
    let endX = snap(e.clientX - rect.left);
    let endY = snap(e.clientY - rect.top);

    if (startX === endX && startY === endY) {
        const clicked = components.find(c => isNearSegment(startX, startY, c.x1, c.y1, c.x2, c.y2));
        if (clicked) editComponentValue(clicked);
        return;
    }

    if (activeTool === 'WIRE') {
        wires.push({ x1: startX, y1: startY, x2: endX, y2: endY });
    } else if (activeTool !== 'SELECT' && activeTool !== 'GND') {
        let value = 1000;
        if (activeTool === 'C') value = 10e-6;
        if (activeTool === 'V') value = 5;

        components.push({ type: activeTool, x1: startX, y1: startY, x2: endX, y2: endY, value });
    }
    drawCanvas();
});

class UnionFind {
    constructor() { this.parent = new Map(); }
    find(i) {
        if (!this.parent.has(i)) this.parent.set(i, i);
        if (this.parent.get(i) === i) return i;
        const root = this.find(this.parent.get(i));
        this.parent.set(i, root);
        return root;
    }
    union(i, j) {
        const rootI = this.find(i);
        const rootJ = this.find(j);
        if (rootI !== rootJ) this.parent.set(rootI, rootJ);
    }
}

function extractNetlist() {
    const dsu = new UnionFind();
    const posKey = (x, y) => `${x},${y}`;

    wires.forEach(w => dsu.union(posKey(w.x1, w.y1), posKey(w.x2, w.y2)));
    groundPins.forEach(g => dsu.union(posKey(g.x, g.y), 'GND_KEY'));

    const rootToNodeMap = new Map();
    rootToNodeMap.set(dsu.find('GND_KEY'), 0);
    let nextNodeId = 1;
    const posToNodeMap = new Map();

    function getNode(x, y) {
        const key = posKey(x, y);
        const root = dsu.find(key);
        if (!rootToNodeMap.has(root)) {
            rootToNodeMap.set(root, nextNodeId++);
        }
        const nodeId = rootToNodeMap.get(root);
        posToNodeMap.set(key, nodeId);
        return nodeId;
    }

    const netlist = components.map(c => ({
        type: c.type,
        nodeA: getNode(c.x1, c.y1),
        nodeB: getNode(c.x2, c.y2),
        value: c.value
    }));

    return { netlist, posToNodeMap };
}

function isNearSegment(px, py, x1, y1, x2, y2) {
    const dLine = Math.hypot(x2 - x1, y2 - y1);
    if (dLine === 0) return Math.hypot(px - x1, py - y1) < 10;
    const u = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / (dLine * dLine);
    if (u < 0 || u > 1) return false;
    const ix = x1 + u * (x2 - x1);
    const iy = y1 + u * (y2 - y1);
    return Math.hypot(px - ix, py - iy) < 10;
}

function editComponentValue(comp) {
    const valStr = prompt(`Edit ${comp.type} value:`, typeof comp.value === 'function' ? comp.value.toString() : comp.value);
    if (valStr === null) return;
    if (comp.type === 'V' && valStr.startsWith('t =>')) {
        try { eval(`comp.value = ${valStr}`); } catch (e) { log("Invalid formula"); }
    } else {
        const num = parseFloat(valStr);
        if (!isNaN(num)) comp.value = num;
    }
    drawCanvas();
}

function clearCanvasState() {
    components = [];
    wires = [];
    groundPins = [];
    probedNodes.clear();
    selectedComp = null;
    lastSimulationResults = null;
    if (waveformChart) {
        waveformChart.data.labels = [];
        waveformChart.data.datasets = [];
        waveformChart.update();
    }
}

clearBtn.addEventListener('click', () => { clearCanvasState(); drawCanvas(); log("Canvas cleared."); });
resetBtn.addEventListener('click', () => { clearCanvasState(); drawCanvas(); log("Simulation reset."); });
pauseBtn.addEventListener('click', () => { log("Simulation paused."); });

function log(msg) {
    consoleOutput.innerHTML += `> ${msg}<br>`;
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function drawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += GRID) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += GRID) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    wires.forEach(w => { ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke(); });

    const { netlist } = extractNetlist();

    components.forEach((comp, idx) => {
        const isSel = (comp === selectedComp);
        ctx.strokeStyle = isSel ? '#f14c4c' : '#4ec9b0';
        ctx.lineWidth = isSel ? 3 : 2;
        ctx.beginPath(); ctx.moveTo(comp.x1, comp.y1); ctx.lineTo(comp.x2, comp.y2); ctx.stroke();

        ctx.fillStyle = '#dcdcaa';
        ctx.font = '10px monospace';
        const netComp = netlist[idx];
        ctx.fillText(`${comp.type} (N${netComp.nodeA}-N${netComp.nodeB})`, (comp.x1 + comp.x2) / 2 + 2, (comp.y1 + comp.y2) / 2 - 4);
    });

    if (isDrawing) {
        ctx.strokeStyle = '#ce9178';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(currentX, currentY); ctx.stroke();
        ctx.setLineDash([]);
    }

    groundPins.forEach(g => {
        ctx.fillStyle = '#f14c4c';
        ctx.beginPath(); ctx.arc(g.x, g.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.font = 'bold 9px sans-serif'; ctx.fillText('GND', g.x + 6, g.y + 3);
    });
}

function updateChart(results) {
    lastSimulationResults = results;
    const labels = results.map(r => r.time.toFixed(4));
    const activeNodes = new Set();
    results.forEach(step => Object.keys(step.voltages).forEach(n => activeNodes.add(Number(n))));

    const nodesToPlot = probedNodes.size > 0 ? probedNodes : activeNodes;
    const colorPalette = ['#4ec9b0', '#ce9178', '#dcdcaa', '#569cd6', '#c586c0'];
    let colorIdx = 0;

    const datasets = Array.from(nodesToPlot).map(nodeId => {
        const data = results.map(step => step.voltages[nodeId] || 0);
        const color = colorPalette[colorIdx++ % colorPalette.length];
        return {
            label: `Node ${nodeId} (V)`,
            data, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, tension: 0.1
        };
    });

    if (waveformChart) {
        waveformChart.data.labels = labels;
        waveformChart.data.datasets = datasets;
        waveformChart.update();
    }
}

simulateBtn.addEventListener('click', () => {
    if (components.length === 0) { log("Error: Canvas is empty."); return; }
    const { netlist } = extractNetlist();
    const hasGround = netlist.some(c => c.nodeA === 0 || c.nodeB === 0);
    if (!hasGround) { log("Error: No Ground connected!"); return; }

    log("Running simulation...");
    try {
        const results = runTransient(netlist, 0.02, 0.0001);
        updateChart(results);
        log(`Simulation successful! (${results.length} steps).`);
    } catch (err) {
        log(`Simulation Error: ${err.message}`);
    }
});

drawCanvas();