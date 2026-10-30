// editor.js
import { runTransient } from './simulator.js';

const canvas = document.getElementById('circuitCanvas');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const consoleOutput = document.getElementById('consoleOutput');
const clearBtn = document.getElementById('clearBtn');
const simulateBtn = document.getElementById('simulateBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const exampleSelect = document.getElementById('exampleSelect');
const palette = document.getElementById('palette');
const emptyState = document.getElementById('emptyState');
const inspectorBody = document.getElementById('inspectorBody');
const scopeBadge = document.getElementById('scopeBadge');
const plotEmpty = document.getElementById('plotEmpty');
const tEndInput = document.getElementById('tEndInput');
const stepInput = document.getElementById('stepInput');
const toolHint = document.getElementById('toolHint');
const statusTool = document.getElementById('statusTool');
const statusCursor = document.getElementById('statusCursor');
const statusCounts = document.getElementById('statusCounts');

const saveBtn = document.getElementById('saveBtn');
const loadBtn = document.getElementById('loadBtn');
const importFile = document.getElementById('importFile');

const GRID = 20;
const COLORS = {
    bg: '#101412',
    gridMinor: 'rgba(124, 255, 178, 0.045)',
    gridMajor: 'rgba(124, 255, 178, 0.09)',
    wire: '#9fb0a6',
    part: '#e6ece8',
    selected: '#ffb454',
    preview: 'rgba(255, 180, 84, 0.85)',
    label: '#8a978f',
    ground: '#9fb0a6',
};
const TRACE_COLORS = ['#7cffb2', '#ffb454', '#6cc7ff', '#ff7ac6', '#c9a6ff', '#f5e76a'];

const PART_INFO = {
    R: { name: 'Resistor', unit: 'Ω', def: 1000 },
    C: { name: 'Capacitor', unit: 'F', def: 10e-6 },
    V: { name: 'Voltage Source', unit: 'V', def: 5 },
    D: { name: 'Diode', unit: '', def: undefined },
    L: { name: 'Inductor', unit: 'H', def: 1e-3 },
};
const TOOL_HINTS = {
    SELECT: 'Click a pin to probe it · Drag parts to move them',
    WIRE: 'Drag between pins to connect them',
    R: 'Drag across the grid to place a resistor',
    C: 'Drag across the grid to place a capacitor',
    D: 'Drag from anode to cathode',
    V: 'Drag from the + terminal to the − terminal',
    GND: 'Click a pin to tie it to ground',
};

let activeTool = 'SELECT';
let components = [];
let wires = [];
let groundPins = [];
let probedNodes = new Set();

// selection: { kind: 'comp' | 'wire' | 'gnd', ref }
let selection = null;
let isDrawing = false;
let isDragging = false;
let dragMoved = false;
let dragStart = { x: 0, y: 0 };
let startX = 0, startY = 0;
let currentX = 0, currentY = 0;
let hover = null; // { x, y } snapped cursor

let lastSimulationResults = null;
let resultsStale = false;
let playback = { index: 0, raf: null, paused: false, startTime: 0, elapsedBefore: 0 };
const SWEEP_MS = 1400;

// ---------- Chart.js oscilloscope ----------
let waveformChart = null;
try {
    Chart.defaults.font.family = "'IBM Plex Mono', monospace";
    Chart.defaults.font.size = 10;
    const chartCtx = document.getElementById('waveformChart').getContext('2d');
    waveformChart = new Chart(chartCtx, {
        type: 'line',
        data: { datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            parsing: false,
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            scales: {
                x: {
                    type: 'linear', min: 0,
                    title: { display: true, text: 'Time', color: '#5b6660' },
                    ticks: { color: '#8a978f', maxTicksLimit: 6, callback: v => formatSI(v, 's') },
                    grid: { color: 'rgba(124,255,178,0.07)' },
                    border: { color: '#2a312d' }
                },
                y: {
                    title: { display: true, text: 'Voltage', color: '#5b6660' },
                    ticks: { color: '#8a978f', maxTicksLimit: 7, callback: v => formatSI(v, 'V') },
                    grid: { color: 'rgba(124,255,178,0.07)' },
                    border: { color: '#2a312d' }
                }
            },
            plugins: {
                legend: { labels: { color: '#e6ece8', boxWidth: 10, boxHeight: 2 } },
                tooltip: {
                    backgroundColor: '#151917', borderColor: '#3a443e', borderWidth: 1,
                    titleColor: '#8a978f', bodyColor: '#e6ece8',
                    callbacks: {
                        title: items => items.length ? `t = ${formatSI(items[0].parsed.x, 's')}` : '',
                        label: item => ` ${item.dataset.label}: ${formatSI(item.parsed.y, 'V')}`
                    }
                }
            }
        }
    });
} catch (e) { console.error("Chart init error:", e); }

// ---------- Units ----------
const SI_PREFIX = { p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, meg: 1e6, Meg: 1e6, MEG: 1e6, G: 1e9 };

function parseSI(str) {
    const m = String(str).trim().match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(meg|Meg|MEG|[pnuµmkKMG])?\s*(?:Ω|ohms?|F|V|H|s)?$/);
    if (!m) return NaN;
    return parseFloat(m[1]) * (m[2] ? SI_PREFIX[m[2]] : 1);
}

function formatSI(v, unit = '') {
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    if (v === 0) return `0${unit ? ' ' + unit : ''}`;
    const prefixes = ['p', 'n', 'µ', 'm', '', 'k', 'M', 'G'];
    let exp = Math.floor(Math.log10(Math.abs(v)) / 3);
    exp = Math.max(-4, Math.min(3, exp));
    const num = parseFloat((v / Math.pow(1000, exp)).toPrecision(3));
    return `${num} ${prefixes[exp + 4]}${unit}`.trim();
}

function valueLabel(comp) {
    if (comp.type === 'D') return 'D';
    if (typeof comp.value === 'string') return 'v(t)';
    return formatSI(comp.value, PART_INFO[comp.type]?.unit || '');
}

// Source formulas are stored as strings (so they survive JSON) and compiled at run time.
function compileFormula(src) {
    const s = String(src).trim();
    const fn = s.includes('=>') ? new Function(`return (${s});`)() : new Function('t', `return (${s});`);
    if (typeof fn !== 'function') throw new Error('Formula must be a function of t');
    const probe = fn(0);
    if (typeof probe !== 'number' || !isFinite(probe)) throw new Error('Formula must return a number');
    return fn;
}

// ---------- Geometry helpers ----------
function snap(val) { return Math.round(val / GRID) * GRID; }
const posKey = (x, y) => `${x},${y}`;

function eventPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function distToSegment(px, py, x1, y1, x2, y2) {
    const dLine = Math.hypot(x2 - x1, y2 - y1);
    if (dLine === 0) return Math.hypot(px - x1, py - y1);
    let u = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / (dLine * dLine);
    u = Math.max(0, Math.min(1, u));
    return Math.hypot(px - (x1 + u * (x2 - x1)), py - (y1 + u * (y2 - y1)));
}

function allPins() {
    const pins = [];
    components.forEach(c => { pins.push([c.x1, c.y1]); pins.push([c.x2, c.y2]); });
    wires.forEach(w => { pins.push([w.x1, w.y1]); pins.push([w.x2, w.y2]); });
    groundPins.forEach(g => pins.push([g.x, g.y]));
    return pins;
}

function pinAt(x, y) {
    let best = null, bestD = 8;
    allPins().forEach(([px, py]) => {
        const d = Math.hypot(px - x, py - y);
        if (d < bestD) { bestD = d; best = { x: px, y: py }; }
    });
    return best;
}

function hitTest(x, y) {
    const g = groundPins.find(g => Math.hypot(g.x - x, g.y + 10 - y) < 12);
    if (g) return { kind: 'gnd', ref: g };
    const c = components.find(c => distToSegment(x, y, c.x1, c.y1, c.x2, c.y2) < 10);
    if (c) return { kind: 'comp', ref: c };
    const w = wires.find(w => distToSegment(x, y, w.x1, w.y1, w.x2, w.y2) < 6);
    if (w) return { kind: 'wire', ref: w };
    return null;
}

// ---------- Netlist ----------
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

    // Wire endpoints not touching a component still belong to a node
    wires.forEach(w => { getNode(w.x1, w.y1); getNode(w.x2, w.y2); });
    groundPins.forEach(g => getNode(g.x, g.y));

    return { netlist, posToNodeMap, nodeCount: nextNodeId - 1 };
}

const traceColor = nodeId => TRACE_COLORS[(nodeId - 1) % TRACE_COLORS.length];

// ---------- Tools ----------
function setTool(tool) {
    activeTool = tool;
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    canvas.classList.toggle('tool-select', tool === 'SELECT');
    const label = document.querySelector(`.tool[data-tool="${tool}"] span`)?.textContent || tool;
    statusTool.textContent = `Tool: ${label}`;
    toolHint.textContent = TOOL_HINTS[tool] || '';
    isDrawing = false;
    if (tool !== 'SELECT') setSelection(null);
    drawCanvas();
}

palette.addEventListener('click', (e) => {
    const btn = e.target.closest('.tool');
    if (btn) setTool(btn.dataset.tool);
});

// ---------- Examples ----------
const EXAMPLES = {
    rc: {
        name: 'RC Filter',
        build() {
            groundPins.push({ x: 80, y: 240 });
            components.push({ type: 'V', x1: 80, y1: 120, x2: 80, y2: 240, value: 5 });
            components.push({ type: 'R', x1: 80, y1: 120, x2: 240, y2: 120, value: 1000 });
            components.push({ type: 'C', x1: 240, y1: 120, x2: 240, y2: 240, value: 10e-6 });
            wires.push({ x1: 80, y1: 240, x2: 240, y2: 240 });
        }
    },
    rectifier: {
        name: 'Half-Wave Rectifier',
        build() {
            groundPins.push({ x: 60, y: 260 });
            components.push({ type: 'V', x1: 60, y1: 100, x2: 60, y2: 260, value: "t => 5 * Math.sin(2 * Math.PI * 50 * t)" });
            components.push({ type: 'D', x1: 60, y1: 100, x2: 220, y2: 100 });
            components.push({ type: 'R', x1: 220, y1: 100, x2: 220, y2: 260, value: 1000 });
            wires.push({ x1: 60, y1: 260, x2: 220, y2: 260 });
        }
    },
    divider: {
        name: 'Voltage Divider',
        build() {
            groundPins.push({ x: 100, y: 280 });
            components.push({ type: 'V', x1: 100, y1: 100, x2: 100, y2: 280, value: 10 });
            components.push({ type: 'R', x1: 100, y1: 100, x2: 260, y2: 100, value: 1000 });
            components.push({ type: 'R', x1: 260, y1: 100, x2: 260, y2: 280, value: 1000 });
            wires.push({ x1: 100, y1: 280, x2: 260, y2: 280 });
        }
    }
};

function loadExample(key) {
    const ex = EXAMPLES[key];
    if (!ex) return;
    clearCanvasState();
    ex.build();
    centerCircuit();
    setTool('SELECT');
    log(`Loaded example: ${ex.name}`, 'ok');
    drawCanvas();
}

exampleSelect.addEventListener('change', (e) => {
    loadExample(e.target.value);
    exampleSelect.selectedIndex = 0;
});
emptyState.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-example]');
    if (btn) loadExample(btn.dataset.example);
});

// Move the whole circuit so it sits in the middle of the visible canvas
function centerCircuit() {
    const pins = allPins();
    if (!pins.length) return;
    const xs = pins.map(p => p[0]), ys = pins.map(p => p[1]);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const dx = snap(w / 2 - (Math.min(...xs) + Math.max(...xs)) / 2);
    const dy = snap(h / 2 - (Math.min(...ys) + Math.max(...ys)) / 2);
    components.forEach(c => { c.x1 += dx; c.x2 += dx; c.y1 += dy; c.y2 += dy; });
    wires.forEach(c => { c.x1 += dx; c.x2 += dx; c.y1 += dy; c.y2 += dy; });
    groundPins.forEach(g => { g.x += dx; g.y += dy; });
}

// ---------- JSON Save & Load ----------
saveBtn.addEventListener('click', () => {
    const projectData = { components, wires, groundPins };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    downloadAnchor.download = "circuit_schematic.json";
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
    log("Circuit saved to circuit_schematic.json", 'ok');
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
            centerCircuit();
            drawCanvas();
            log(`Loaded ${file.name}`, 'ok');
        } catch (err) {
            log(`Error loading JSON: ${err.message}`, 'err');
        }
    };
    reader.readAsText(file);
    importFile.value = '';
});

// ---------- Keyboard ----------
const TOOL_KEYS = { s: 'SELECT', w: 'WIRE', r: 'R', c: 'C', d: 'D', v: 'V', g: 'GND', '0': 'GND' };

window.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;

    if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        e.preventDefault();
        deleteSelection();
    } else if (e.key === 'Escape') {
        if (isDrawing) { isDrawing = false; drawCanvas(); }
        else if (selection) setSelection(null);
        else setTool('SELECT');
    } else if (e.key === ' ') {
        e.preventDefault();
        simulate();
    } else if (TOOL_KEYS[e.key.toLowerCase()]) {
        setTool(TOOL_KEYS[e.key.toLowerCase()]);
    }
});

function deleteSelection() {
    if (!selection) return;
    const { kind, ref } = selection;
    if (kind === 'comp') components = components.filter(c => c !== ref);
    if (kind === 'wire') wires = wires.filter(w => w !== ref);
    if (kind === 'gnd') groundPins = groundPins.filter(g => g !== ref);
    log(`Deleted ${kind === 'comp' ? PART_INFO[ref.type].name.toLowerCase() : kind === 'wire' ? 'wire' : 'ground'}`);
    setSelection(null);
    circuitChanged();
}

// ---------- Mouse ----------
canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const { x, y } = eventPos(e);
    const sx = snap(x), sy = snap(y);

    if (activeTool === 'SELECT') {
        const hit = hitTest(x, y);
        const pin = pinAt(x, y);
        if (pin && !(hit && hit.kind === 'gnd')) {
            toggleProbe(pin);
            return;
        }
        setSelection(hit);
        if (hit) {
            isDragging = true;
            dragMoved = false;
            dragStart = { x: sx, y: sy };
            canvas.classList.add('dragging');
        }
        drawCanvas();
        return;
    }

    if (activeTool === 'GND') {
        const pin = pinAt(x, y) || { x: sx, y: sy };
        if (groundPins.some(g => g.x === pin.x && g.y === pin.y)) return;
        groundPins.push({ x: pin.x, y: pin.y });
        log(`Ground added at (${pin.x / GRID}, ${pin.y / GRID})`);
        circuitChanged();
        return;
    }

    const pin = pinAt(x, y);
    startX = pin ? pin.x : sx;
    startY = pin ? pin.y : sy;
    currentX = startX;
    currentY = startY;
    isDrawing = true;
});

canvas.addEventListener('mousemove', (e) => {
    const { x, y } = eventPos(e);
    const sx = snap(x), sy = snap(y);
    hover = { x: sx, y: sy, rawX: x, rawY: y };
    statusCursor.textContent = `x ${sx / GRID}  y ${sy / GRID}`;

    if (isDragging && selection) {
        const dx = sx - dragStart.x, dy = sy - dragStart.y;
        if (dx || dy) {
            const r = selection.ref;
            if (selection.kind === 'gnd') { r.x += dx; r.y += dy; }
            else { r.x1 += dx; r.y1 += dy; r.x2 += dx; r.y2 += dy; }
            dragStart = { x: sx, y: sy };
            dragMoved = true;
        }
        drawCanvas();
        return;
    }

    if (isDrawing) {
        currentX = sx; currentY = sy;
    }

    if (activeTool === 'SELECT') {
        const overPin = !!pinAt(x, y);
        canvas.classList.toggle('hover-pin', overPin);
        canvas.classList.toggle('hover-part', !overPin && !!hitTest(x, y));
    }
    drawCanvas();
});

canvas.addEventListener('mouseleave', () => {
    hover = null;
    statusCursor.textContent = 'x — y —';
    drawCanvas();
});

window.addEventListener('mouseup', (e) => {
    if (isDragging) {
        isDragging = false;
        canvas.classList.remove('dragging');
        if (dragMoved) circuitChanged();
        drawCanvas();
        return;
    }
    if (!isDrawing) return;
    isDrawing = false;

    const endX = currentX, endY = currentY;

    if (startX === endX && startY === endY) {
        // A plain click on an existing part opens it in the inspector
        const hit = hitTest(startX, startY);
        if (hit) { setTool('SELECT'); setSelection(hit, true); }
        drawCanvas();
        return;
    }

    if (activeTool === 'WIRE') {
        wires.push({ x1: startX, y1: startY, x2: endX, y2: endY });
    } else if (PART_INFO[activeTool]) {
        const comp = { type: activeTool, x1: startX, y1: startY, x2: endX, y2: endY };
        if (PART_INFO[activeTool].def !== undefined) comp.value = PART_INFO[activeTool].def;
        components.push(comp);
        log(`Placed ${PART_INFO[activeTool].name.toLowerCase()}`);
    }
    circuitChanged();
});

function toggleProbe(pin) {
    const { posToNodeMap } = extractNetlist();
    const nodeId = posToNodeMap.get(posKey(pin.x, pin.y));
    if (nodeId === undefined) return;
    if (nodeId === 0) { log('That pin is ground (0 V) — nothing to probe', 'warn'); return; }
    if (probedNodes.has(nodeId)) {
        probedNodes.delete(nodeId);
        log(`Removed node ${nodeId} from scope`);
    } else {
        probedNodes.add(nodeId);
        log(`Probing node ${nodeId}`);
    }
    if (lastSimulationResults) renderChart();
    drawCanvas();
}

// ---------- Inspector ----------
function setSelection(sel, focusValue = false) {
    selection = sel;
    renderInspector(focusValue);
    drawCanvas();
}

function renderInspector(focusValue) {
    if (!selection) {
        inspectorBody.innerHTML = `<p class="muted">Select a part to edit its value. Click a pin in Select mode to add it to the scope.</p>`;
        return;
    }
    const { kind, ref } = selection;
    if (kind !== 'comp') {
        inspectorBody.innerHTML = `
            <div class="insp-title">
                <span class="insp-chip">${kind === 'wire' ? 'W' : '⏚'}</span>
                <div><strong>${kind === 'wire' ? 'Wire' : 'Ground'}</strong><small>${kind === 'wire' ? 'Ideal conductor' : 'Reference node 0'}</small></div>
            </div>
            <div class="insp-actions"><button class="btn danger" data-act="delete">Delete</button></div>`;
        inspectorBody.querySelector('[data-act="delete"]').onclick = deleteSelection;
        return;
    }

    const info = PART_INFO[ref.type];
    const { netlist } = extractNetlist();
    const net = netlist[components.indexOf(ref)];
    const nodes = net ? `node ${net.nodeA} → node ${net.nodeB}` : '';
    const editable = info.def !== undefined;
    const current = typeof ref.value === 'string' ? ref.value : formatSI(ref.value, '').replace(' ', '');
    const help = ref.type === 'V'
        ? 'Use a number like <code>5</code>, or a function of t such as <code>t => 5*Math.sin(2*Math.PI*50*t)</code>.'
        : 'SI prefixes work: 4.7k, 10u, 100n, 1M.';

    inspectorBody.innerHTML = `
        <div class="insp-title">
            <span class="insp-chip">${ref.type}</span>
            <div><strong>${info.name}</strong><small>${nodes}</small></div>
        </div>
        ${editable ? `
            <label class="insp-field" id="inspField">
                <input id="inspValue" spellcheck="false" autocomplete="off" aria-label="${info.name} value">
                <em>${info.unit}</em>
            </label>
            <p class="insp-help" id="inspHelp">${help}</p>
        ` : `<p class="insp-help">Shockley model · Iₛ = 1 pA · Vₜ = 26 mV</p>`}
        <div class="insp-actions">
            <button class="btn danger" data-act="delete">Delete</button>
            <button class="btn ghost" data-act="flip" title="Swap terminals">Flip</button>
        </div>`;

    inspectorBody.querySelector('[data-act="delete"]').onclick = deleteSelection;
    inspectorBody.querySelector('[data-act="flip"]').onclick = () => {
        [ref.x1, ref.y1, ref.x2, ref.y2] = [ref.x2, ref.y2, ref.x1, ref.y1];
        circuitChanged();
        renderInspector();
    };

    if (!editable) return;
    const input = document.getElementById('inspValue');
    const field = document.getElementById('inspField');
    const helpEl = document.getElementById('inspHelp');
    input.value = current;

    const apply = () => {
        const parsed = applyValue(ref, input.value);
        field.classList.toggle('invalid', !parsed.ok);
        helpEl.classList.toggle('err', !parsed.ok);
        helpEl.innerHTML = parsed.ok ? help : parsed.error;
        if (parsed.ok) circuitChanged();
    };
    input.addEventListener('change', apply);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { apply(); input.blur(); }
        if (e.key === 'Escape') { input.value = current; input.blur(); }
    });
    if (focusValue) { input.focus(); input.select(); }
}

function applyValue(comp, raw) {
    const str = raw.trim();
    const num = parseSI(str);
    if (!isNaN(num)) {
        if ((comp.type === 'R' || comp.type === 'C' || comp.type === 'L') && num <= 0) {
            return { ok: false, error: 'Value must be greater than zero.' };
        }
        comp.value = num;
        log(`${PART_INFO[comp.type].name} set to ${formatSI(num, PART_INFO[comp.type].unit)}`);
        return { ok: true };
    }
    if (comp.type === 'V') {
        try {
            compileFormula(str);
            comp.value = str;
            log(`Source set to v(t) = ${str}`);
            return { ok: true };
        } catch (e) {
            return { ok: false, error: `Invalid formula: ${escapeHtml(e.message)}` };
        }
    }
    return { ok: false, error: 'Enter a number, e.g. 1k or 4.7u.' };
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ---------- State ----------
function circuitChanged() {
    if (lastSimulationResults && !resultsStale) {
        resultsStale = true;
        setBadge('Stale · re-run', 'stale');
    }
    if (selection?.kind === 'comp' && document.activeElement?.id !== 'inspValue') renderInspector();
    drawCanvas();
}

function clearResults() {
    stopPlayback();
    lastSimulationResults = null;
    resultsStale = false;
    if (waveformChart) {
        waveformChart.data.datasets = [];
        waveformChart.update();
    }
    plotEmpty.classList.remove('hidden');
    setBadge('Idle');
}

function clearCanvasState() {
    components = [];
    wires = [];
    groundPins = [];
    probedNodes.clear();
    setSelection(null);
    clearResults();
}

clearBtn.addEventListener('click', () => { clearCanvasState(); drawCanvas(); log("Canvas cleared."); });
resetBtn.addEventListener('click', () => { clearResults(); drawCanvas(); log("Simulation results cleared."); });
pauseBtn.addEventListener('click', togglePause);

function setBadge(text, kind = '') {
    scopeBadge.textContent = text;
    scopeBadge.className = `badge ${kind}`;
}

function log(msg, level = 'info') {
    const li = document.createElement('li');
    li.className = level;
    const time = document.createElement('time');
    time.textContent = new Date().toLocaleTimeString([], { hour12: false });
    const span = document.createElement('span');
    span.textContent = msg;
    li.append(time, span);
    consoleOutput.appendChild(li);
    while (consoleOutput.children.length > 200) consoleOutput.firstChild.remove();
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// ---------- Drawing ----------
let viewW = 0, viewH = 0;

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    viewW = stage.clientWidth;
    viewH = stage.clientHeight;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${viewH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCanvas();
}
new ResizeObserver(resizeCanvas).observe(stage);

function drawGrid() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, viewW, viewH);
    for (let x = 0; x <= viewW; x += GRID) {
        ctx.strokeStyle = (x / GRID) % 5 === 0 ? COLORS.gridMajor : COLORS.gridMinor;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, viewH); ctx.stroke();
    }
    for (let y = 0; y <= viewH; y += GRID) {
        ctx.strokeStyle = (y / GRID) % 5 === 0 ? COLORS.gridMajor : COLORS.gridMinor;
        ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(viewW, y + 0.5); ctx.stroke();
    }
}

// Draws a component symbol between its two endpoints in a local, rotated frame
function drawSymbol(comp, color, lw = 2) {
    const { x1, y1, x2, y2, type } = comp;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1) return;
    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(Math.atan2(y2 - y1, x2 - x1));
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const mid = len / 2;
    const lead = (a, b) => { ctx.beginPath(); ctx.moveTo(a, 0); ctx.lineTo(b, 0); ctx.stroke(); };

    if (type === 'R') {
        const body = Math.min(44, len * 0.7), a = mid - body / 2;
        lead(0, a); lead(a + body, len);
        ctx.beginPath(); ctx.moveTo(a, 0);
        const zig = 6;
        for (let i = 0; i < zig; i++) {
            ctx.lineTo(a + (body / zig) * (i + 0.5), i % 2 ? 7 : -7);
        }
        ctx.lineTo(a + body, 0); ctx.stroke();
    } else if (type === 'C') {
        const gap = Math.min(4, len * 0.1), h = 12;
        lead(0, mid - gap); lead(mid + gap, len);
        ctx.lineWidth = lw + 0.6;
        ctx.beginPath(); ctx.moveTo(mid - gap, -h); ctx.lineTo(mid - gap, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mid + gap, -h); ctx.lineTo(mid + gap, h); ctx.stroke();
    } else if (type === 'D') {
        const body = Math.min(18, len * 0.5), a = mid - body / 2, b = mid + body / 2;
        lead(0, a); lead(b, len);
        ctx.beginPath(); ctx.moveTo(a, -9); ctx.lineTo(a, 9); ctx.lineTo(b, 0); ctx.closePath();
        ctx.globalAlpha = 0.18; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(b, -9); ctx.lineTo(b, 9); ctx.stroke();
    } else if (type === 'V') {
        const r = Math.min(15, len * 0.35);
        lead(0, mid - r); lead(mid + r, len);
        ctx.beginPath(); ctx.arc(mid, 0, r, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1.5;
        if (typeof comp.value === 'string') {
            ctx.beginPath();
            for (let i = 0; i <= 20; i++) {
                const px = mid - r * 0.6 + (i / 20) * r * 1.2;
                const py = -Math.sin((i / 20) * Math.PI * 2) * r * 0.35;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
        }
        // "+" sits at the x1 end (nodeA is the positive terminal in the solver)
        const s = r * 0.28, px = mid - r - 9, mx = mid + r + 9;
        ctx.beginPath(); ctx.moveTo(px - s, -12); ctx.lineTo(px + s, -12); ctx.moveTo(px, -12 - s); ctx.lineTo(px, -12 + s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mx, -12 - s); ctx.lineTo(mx, -12 + s); ctx.stroke();
    } else if (type === 'L') {
        const body = Math.min(44, len * 0.7), a = mid - body / 2, loops = 4, lr = body / loops / 2;
        lead(0, a); lead(a + body, len);
        ctx.beginPath();
        for (let i = 0; i < loops; i++) ctx.arc(a + lr + i * lr * 2, 0, lr, Math.PI, 0);
        ctx.stroke();
    } else {
        lead(0, len);
    }
    ctx.restore();
}

function drawLabel(comp, color) {
    const { x1, y1, x2, y2 } = comp;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    // Perpendicular offset, flipped so labels sit above / to the right
    let nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
    if (ny > 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }
    const isVertical = Math.abs(nx) > Math.abs(ny);
    const off = comp.type === 'V' ? 24 : 18;
    const lx = (x1 + x2) / 2 + nx * off, ly = (y1 + y2) / 2 + ny * off;
    ctx.font = "500 11px 'IBM Plex Mono', monospace";
    ctx.fillStyle = color;
    ctx.textAlign = isVertical ? (nx > 0 ? 'left' : 'right') : 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(valueLabel(comp), lx, ly);
}

function drawGround(g, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x, g.y + 10); ctx.stroke();
    [[9, 10], [6, 15], [2.5, 20]].forEach(([w, dy]) => {
        ctx.beginPath(); ctx.moveTo(g.x - w, g.y + dy); ctx.lineTo(g.x + w, g.y + dy); ctx.stroke();
    });
    ctx.restore();
}

function pill(text, x, y, color, filled) {
    ctx.font = "600 10px 'IBM Plex Mono', monospace";
    const w = ctx.measureText(text).width + 10, h = 16;
    ctx.beginPath();
    ctx.roundRect(x, y - h / 2, w, h, 4);
    ctx.fillStyle = filled ? color : 'rgba(16,20,18,0.85)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = filled ? '#06140c' : color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 5, y + 0.5);
}

function drawCanvas() {
    if (!viewW) return;
    drawGrid();

    const { posToNodeMap, nodeCount } = extractNetlist();
    const isSel = ref => selection && selection.ref === ref;

    // Wires
    ctx.lineCap = 'round';
    wires.forEach(w => {
        ctx.strokeStyle = isSel(w) ? COLORS.selected : COLORS.wire;
        ctx.lineWidth = isSel(w) ? 3 : 2;
        ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke();
    });

    // Components
    components.forEach(comp => {
        const sel = isSel(comp);
        if (sel) {
            ctx.save();
            ctx.shadowColor = 'rgba(255,180,84,0.6)';
            ctx.shadowBlur = 10;
            drawSymbol(comp, COLORS.selected, 2.4);
            ctx.restore();
        } else {
            drawSymbol(comp, COLORS.part, 2);
        }
        drawLabel(comp, sel ? COLORS.selected : COLORS.label);
    });

    groundPins.forEach(g => drawGround(g, isSel(g) ? COLORS.selected : COLORS.ground));

    // Pins & junctions
    const pinCount = new Map();
    allPins().forEach(([x, y]) => { const k = posKey(x, y); pinCount.set(k, (pinCount.get(k) || 0) + 1); });
    const hoverPin = hover ? pinAt(hover.rawX, hover.rawY) : null;
    pinCount.forEach((count, key) => {
        const [x, y] = key.split(',').map(Number);
        const nodeId = posToNodeMap.get(key);
        const probed = probedNodes.has(nodeId);
        const isHover = hoverPin && hoverPin.x === x && hoverPin.y === y;
        ctx.beginPath();
        ctx.arc(x, y, isHover ? 5 : count > 2 ? 4 : 3, 0, Math.PI * 2);
        if (probed) {
            ctx.fillStyle = traceColor(nodeId);
            ctx.fill();
        } else if (count > 2) {
            ctx.fillStyle = COLORS.wire;
            ctx.fill();
        } else {
            ctx.fillStyle = COLORS.bg;
            ctx.fill();
            ctx.strokeStyle = isHover ? COLORS.selected : COLORS.wire;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    });

    // Node tags: one per node, coloured if probed, with the live voltage while sweeping
    const tagged = new Set();
    const step = lastSimulationResults && !resultsStale ? lastSimulationResults[Math.max(0, playback.index - 1)] : null;
    posToNodeMap.forEach((nodeId, key) => {
        if (nodeId === 0 || tagged.has(nodeId)) return;
        tagged.add(nodeId);
        const [x, y] = key.split(',').map(Number);
        const probed = probedNodes.has(nodeId);
        let text = `n${nodeId}`;
        if (step && probed) text += ` ${formatSI(step.voltages[nodeId] ?? 0, 'V')}`;
        if (probed) pill(text, x + 8, y - 14, traceColor(nodeId), !!step);
        else {
            ctx.font = "500 9px 'IBM Plex Mono', monospace";
            ctx.fillStyle = '#5b6660';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, x + 6, y - 9);
        }
    });

    // Drawing preview
    if (isDrawing) {
        if (activeTool === 'WIRE') {
            ctx.strokeStyle = COLORS.preview;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(currentX, currentY); ctx.stroke();
            ctx.setLineDash([]);
        } else {
            const ghost = { type: activeTool, x1: startX, y1: startY, x2: currentX, y2: currentY, value: PART_INFO[activeTool]?.def };
            ctx.globalAlpha = 0.8;
            drawSymbol(ghost, COLORS.preview, 2);
            ctx.globalAlpha = 1;
        }
    }

    // Cursor crosshair for placement tools
    if (hover && activeTool !== 'SELECT' && !hoverPin) {
        ctx.strokeStyle = 'rgba(255,180,84,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hover.x - 6, hover.y); ctx.lineTo(hover.x + 6, hover.y);
        ctx.moveTo(hover.x, hover.y - 6); ctx.lineTo(hover.x, hover.y + 6);
        ctx.stroke();
    }
    if (hover && activeTool === 'GND' && !isDrawing) {
        ctx.globalAlpha = 0.5;
        drawGround(hoverPin || hover, COLORS.preview);
        ctx.globalAlpha = 1;
    }

    emptyState.classList.toggle('hidden', components.length + wires.length + groundPins.length > 0);
    statusCounts.textContent = `${components.length} part${components.length === 1 ? '' : 's'} · ${nodeCount} node${nodeCount === 1 ? '' : 's'}`;
}

// ---------- Simulation & scope sweep ----------
function renderChart() {
    const results = lastSimulationResults;
    if (!results || !waveformChart) return;
    const activeNodes = new Set();
    results.forEach(step => Object.keys(step.voltages).forEach(n => activeNodes.add(Number(n))));
    const nodesToPlot = [...(probedNodes.size > 0 ? probedNodes : activeNodes)].sort((a, b) => a - b);
    const upto = results.slice(0, Math.max(1, playback.index));

    waveformChart.data.datasets = nodesToPlot.map(nodeId => {
        const color = traceColor(nodeId);
        return {
            label: `n${nodeId}`,
            data: upto.map(step => ({ x: step.time, y: step.voltages[nodeId] || 0 })),
            borderColor: color,
            backgroundColor: color,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
        };
    });
    waveformChart.options.scales.x.max = results[results.length - 1].time;
    waveformChart.update('none');
}

function stopPlayback() {
    if (playback.raf) cancelAnimationFrame(playback.raf);
    playback = { index: 0, raf: null, paused: false, startTime: 0, elapsedBefore: 0 };
    pauseBtn.disabled = true;
    pauseBtn.classList.remove('active-pause');
    pauseBtn.querySelector('span').textContent = 'Pause';
}

function startPlayback() {
    const total = lastSimulationResults.length;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) { playback.index = total; renderChart(); drawCanvas(); setBadge('Done', 'live'); return; }

    pauseBtn.disabled = false;
    playback.startTime = performance.now();
    setBadge('Sweeping', 'live');
    const tick = (now) => {
        const elapsed = playback.elapsedBefore + (now - playback.startTime);
        playback.index = Math.min(total, Math.ceil((elapsed / SWEEP_MS) * total));
        renderChart();
        drawCanvas();
        if (playback.index < total) {
            playback.raf = requestAnimationFrame(tick);
        } else {
            playback.raf = null;
            pauseBtn.disabled = true;
            if (!resultsStale) setBadge('Done', 'live');
        }
    };
    playback.raf = requestAnimationFrame(tick);
}

function togglePause() {
    if (!lastSimulationResults || playback.index >= lastSimulationResults.length) return;
    const label = pauseBtn.querySelector('span');
    if (!playback.paused) {
        cancelAnimationFrame(playback.raf);
        playback.elapsedBefore += performance.now() - playback.startTime;
        playback.paused = true;
        label.textContent = 'Resume';
        pauseBtn.classList.add('active-pause');
        setBadge('Paused', 'paused');
        log('Sweep paused.', 'warn');
    } else {
        playback.paused = false;
        label.textContent = 'Pause';
        pauseBtn.classList.remove('active-pause');
        startPlayback();
        log('Sweep resumed.');
    }
}

function simulate() {
    if (components.length === 0) { log("Nothing to simulate — the canvas is empty.", 'err'); return; }
    const { netlist } = extractNetlist();
    const hasGround = netlist.some(c => c.nodeA === 0 || c.nodeB === 0);
    if (!hasGround) { log("No ground connected. Add a ground (G) to a pin.", 'err'); setBadge('Error', 'error'); return; }

    const tEnd = parseSI(tEndInput.value);
    const h = parseSI(stepInput.value);
    if (!(tEnd > 0) || !(h > 0)) { log("Duration and step must be positive numbers (e.g. 20m, 100u).", 'err'); return; }
    if (tEnd / h > 20000) { log(`Too many steps (${Math.round(tEnd / h)}). Increase the step or shorten the duration.`, 'err'); return; }

    try {
        const compiled = netlist.map(c => typeof c.value === 'string' ? { ...c, value: compileFormula(c.value) } : c);
        const t0 = performance.now();
        const results = runTransient(compiled, tEnd, h);
        const ms = performance.now() - t0;
        stopPlayback();
        lastSimulationResults = results;
        resultsStale = false;
        plotEmpty.classList.add('hidden');
        log(`Simulated ${formatSI(tEnd, 's')} in ${results.length} steps (${ms.toFixed(0)} ms).`, 'ok');
        startPlayback();
    } catch (err) {
        log(`Simulation error: ${err.message}`, 'err');
        setBadge('Error', 'error');
    }
}

simulateBtn.addEventListener('click', simulate);

setTool('SELECT');
log("Ready. Load an example or start placing parts.");
resizeCanvas();
