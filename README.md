# Browser-Based Circuit Simulator

A full-stack, browser-based electrical circuit simulator featuring a visual schematic editor, Modified Nodal Analysis (MNA) transient solver with Newton-Raphson iteration for nonlinear components (diodes), and real-time oscilloscope waveform visualization.

---

## Architecture & Core Engine
* **Schematic Editor**: HTML5 Canvas with grid-snapping, component placement, wire routing, and point-and-click property editing.
* **Netlist Extraction**: Uses a **Disjoint-Set Union (DSU / Union-Find)** algorithm to automatically group pins and wires into electrical nodes, explicitly anchoring Node 0 to Ground.
* **Numerical Solver**: Implements Modified Nodal Analysis (MNA) supporting reactive component companion models (capacitors/inductors) and Newton-Raphson iteration for exponential diode characteristics.
* **Visualization**: Integrated **Chart.js** oscilloscope plotting live transient voltages over time with interactive node probing.

---

## Local Development Setup
1. Clone or open this project folder in **Visual Studio Code**.
2. Install the **Live Server** extension by Ritwick Dey in VS Code.
3. Right-click on `index.html` and select **"Open with Live Server"**.
4. Open your browser at `http://localhost:5500`.

---

## Built-In Example Circuits
* **RC Filter**: Demonstrates exponential capacitor charging and voltage smoothing.
* **Half-Wave Rectifier**: Utilizes a diode and source to show AC waveform clipping.
* **Voltage Divider**: Validates resistive voltage partitioning across nodes.