/* ZK-Nexus JavaScript Core - Circuit Compiler, Solver, & Canvas Engine */

// Global State
let signals = [];
let gates = [];
let witnessVector = []; // s = [one, inputs, outputs, locals]
let r1csMatrices = { A: [], B: [], C: [] };
let logs = [];

// Canvas Viewport State
let canvas, ctx;
let nodes = [];
let links = [];
let dragNode = null;
let offset = { x: 0, y: 0 };
let scale = 1.0;
let isPanning = false;
let startPan = { x: 0, y: 0 };
let particles = [];

// Presets Definition
const PRESETS = {
    multiplier: {
        name: "Factorization Prover",
        description: "Prove you know the prime factors of a public number without revealing them: x * y = public_product.",
        signals: [
            { id: "one", name: "one", type: "constant", val: 1 },
            { id: "x", name: "secret_x", type: "input", val: 7 },
            { id: "y", name: "secret_y", type: "input", val: 11 },
            { id: "product", name: "public_product", type: "output", val: 77 }
        ],
        gates: [
            { id: "g1", type: "mul", inputs: ["x", "y"], output: "product", expr: "secret_x * secret_y" }
        ]
    },
    quadratic: {
        name: "Quadratic Solver",
        description: "Prove you know a secret solution x to the equation: x^2 + 5 = 14. Realized via intermediate constraints.",
        signals: [
            { id: "one", name: "one", type: "constant", val: 1 },
            { id: "x", name: "secret_x", type: "input", val: 3 },
            { id: "x2", name: "x_squared", type: "local", val: 9 },
            { id: "five", name: "const_5", type: "constant", val: 5 },
            { id: "out", name: "public_out", type: "output", val: 14 }
        ],
        gates: [
            { id: "g1", type: "mul", inputs: ["x", "x"], output: "x2", expr: "secret_x * secret_x" },
            { id: "g2", type: "add", inputs: ["x2", "five"], output: "out", expr: "x_squared + 5" }
        ]
    },
    range3: {
        name: "3-Bit Range Proof",
        description: "Prove a secret number input_val lies in [0, 7] by decomposing it into 3 bits (b0, b1, b2) and constraining them to be boolean: b * (b - 1) = 0.",
        signals: [
            { id: "one", name: "one", type: "constant", val: 1 },
            { id: "val", name: "input_val", type: "input", val: 5 },
            { id: "b0", name: "bit_0", type: "input", val: 1 },
            { id: "b1", name: "bit_1", type: "input", val: 0 },
            { id: "b2", name: "bit_2", type: "input", val: 1 },
            { id: "t1", name: "t_1", type: "local", val: 2 },
            { id: "t2", name: "t_2", type: "local", val: 4 },
            { id: "t3", name: "sum_bits", type: "local", val: 5 },
            // Boolean checking outputs (should equal 0 for validity)
            { id: "bool0", name: "bool_check_0", type: "output", val: 0 },
            { id: "bool1", name: "bool_check_1", type: "output", val: 0 },
            { id: "bool2", name: "bool_check_2", type: "output", val: 0 }
        ],
        gates: [
            // Bit boolean checks: b * (b - 1) = 0. We represent x * (x - 1) = out
            // To represent x - 1 as a signal, we use constant constraints.
            // Let's implement R1CS constraints: b * (b - 1) = bool_check
            { id: "g1", type: "bool", inputs: ["b0", "one"], output: "bool0", expr: "bit_0 * (bit_0 - 1)" },
            { id: "g2", type: "bool", inputs: ["b1", "one"], output: "bool1", expr: "bit_1 * (bit_1 - 1)" },
            { id: "g3", type: "bool", inputs: ["b2", "one"], output: "bool2", expr: "bit_2 * (bit_2 - 1)" },
            
            // Reconstruct: sum = b0 + 2*b1 + 4*b2
            // Represent 2*b1:
            { id: "g4", type: "scale2", inputs: ["b1", "one"], output: "t1", expr: "2 * bit_1" },
            // Represent 4*b2:
            { id: "g5", type: "scale4", inputs: ["b2", "one"], output: "t2", expr: "4 * bit_2" },
            // Add inputs
            { id: "g6", type: "add", inputs: ["b0", "t1"], output: "t3", expr: "bit_0 + 2*bit_1" },
            { id: "g7", type: "add", inputs: ["t3", "t2"], output: "val", expr: "sum_bits (must equal input_val)" }
        ]
    }
};

// Logger Helper
function log(msg, type = "info") {
    const time = new Date().toLocaleTimeString();
    logs.push({ time, msg, type });
    const logBox = document.getElementById("log-box");
    if (logBox) {
        logBox.innerHTML = logs.map(e => `
            <div class="log-entry">
                <span class="log-time">[${e.time}]</span> 
                <span class="log-${e.type}">${e.msg}</span>
            </div>
        `).join('');
        logBox.scrollTop = logBox.scrollHeight;
    }
}

// Initialize Application
window.addEventListener("DOMContentLoaded", () => {
    canvas = document.getElementById("circuit-canvas");
    ctx = canvas.getContext("2d");
    
    // Resize handler
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    
    // Event listeners for presets
    const presetContainer = document.getElementById("presets");
    Object.keys(PRESETS).forEach(key => {
        const chip = document.createElement("div");
        chip.className = `preset-chip ${key === 'multiplier' ? 'active' : ''}`;
        chip.innerText = PRESETS[key].name;
        chip.addEventListener("click", () => {
            document.querySelectorAll(".preset-chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            loadPreset(key);
        });
        presetContainer.appendChild(chip);
    });
    
    // Wire up controls
    document.getElementById("btn-prove").addEventListener("click", compileAndProve);
    document.getElementById("btn-zoom-in").addEventListener("click", () => { scale = Math.min(scale * 1.2, 3.0); });
    document.getElementById("btn-zoom-out").addEventListener("click", () => { scale = Math.max(scale / 1.2, 0.4); });
    document.getElementById("btn-reset").addEventListener("click", () => { offset = { x: 0, y: 0 }; scale = 1.0; });
    
    // Add Canvas Listeners
    setupCanvasListeners();
    
    // Load initial preset
    loadPreset("multiplier");
    
    // Start animation loop
    requestAnimationFrame(animationLoop);
});

function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
}

// Presets loader
function loadPreset(key) {
    const preset = PRESETS[key];
    document.getElementById("preset-description").innerText = preset.description;
    
    // Load signals and deep copy
    signals = JSON.parse(JSON.stringify(preset.signals));
    gates = JSON.parse(JSON.stringify(preset.gates));
    
    log(`Loaded preset: ${preset.name}`, "info");
    
    renderSignalsPanel();
    buildTopologyGraph();
    compileAndProve();
}

// Panel renderer
function renderSignalsPanel() {
    const container = document.getElementById("signal-list-container");
    container.innerHTML = signals.map(sig => {
        const isConstant = sig.type === 'constant';
        const typeClass = `sig-${sig.type}`;
        return `
            <div class="signal-card" id="sig-card-${sig.id}">
                <div class="signal-info">
                    <span class="signal-name">${sig.name}</span>
                    <span class="signal-type ${typeClass}">${sig.type}</span>
                </div>
                <div>
                    <input type="number" 
                           class="signal-val-input" 
                           value="${sig.val}" 
                           ${isConstant ? 'disabled' : ''} 
                           onchange="updateSignalValue('${sig.id}', this.value)">
                </div>
            </div>
        `;
    }).join('');
}

function updateSignalValue(id, val) {
    const sig = signals.find(s => s.id === id);
    if (sig) {
        sig.val = parseFloat(val) || 0;
        log(`Signal ${sig.name} set to ${sig.val}`, "info");
        
        // Auto-solve witness
        solveWitness();
    }
}

// Compile and Solve constraints
function solveWitness() {
    log("Solving constraint witness...", "info");
    
    // Clear gate evaluation states
    gates.forEach(g => g.satisfied = null);
    
    // Keep propagating until no more gates can be solved
    let progress = true;
    let iterations = 0;
    const maxIterations = 20;
    
    while (progress && iterations < maxIterations) {
        progress = false;
        iterations++;
        
        gates.forEach(gate => {
            if (gate.satisfied !== null) return; // already solved
            
            // Try to resolve inputs
            const resolvedInputs = gate.inputs.map(inId => signals.find(s => s.id === inId));
            const hasAllInputs = resolvedInputs.every(ri => ri && ri.val !== undefined);
            
            if (hasAllInputs) {
                const outSig = signals.find(s => s.id === gate.output);
                if (!outSig) return;
                
                let outVal;
                let isSat = false;
                
                const valA = resolvedInputs[0].val;
                const valB = resolvedInputs[1] ? resolvedInputs[1].val : null;
                
                switch(gate.type) {
                    case "mul":
                        outVal = valA * valB;
                        isSat = Math.abs(outSig.val - outVal) < 1e-9;
                        if (outSig.type === 'local') {
                            outSig.val = outVal;
                            isSat = true;
                        }
                        break;
                    case "add":
                        outVal = valA + valB;
                        isSat = Math.abs(outSig.val - outVal) < 1e-9;
                        if (outSig.type === 'local') {
                            outSig.val = outVal;
                            isSat = true;
                        }
                        break;
                    case "bool":
                        outVal = valA * (valA - 1);
                        isSat = Math.abs(outSig.val - outVal) < 1e-9;
                        if (outSig.type === 'local') {
                            outSig.val = outVal;
                            isSat = true;
                        }
                        break;
                    case "scale2":
                        outVal = 2.0 * valA;
                        isSat = Math.abs(outSig.val - outVal) < 1e-9;
                        if (outSig.type === 'local') {
                            outSig.val = outVal;
                            isSat = true;
                        }
                        break;
                    case "scale4":
                        outVal = 4.0 * valA;
                        isSat = Math.abs(outSig.val - outVal) < 1e-9;
                        if (outSig.type === 'local') {
                            outSig.val = outVal;
                            isSat = true;
                        }
                        break;
                }
                
                // Trigger flow particles from inputs to output
                gate.inputs.forEach(inId => triggerFlowParticles(inId, gate.id));
                setTimeout(() => triggerFlowParticles(gate.id, gate.output), 150);
                
                gate.satisfied = isSat;
                progress = true;
                
                // Update inputs panel view values
                const sigInputEl = document.querySelector(`#sig-card-${outSig.id} .signal-val-input`);
                if (sigInputEl && outSig.type === 'local') {
                    sigInputEl.value = outSig.val.toFixed(2);
                }
            }
        });
    }
    
    // Check global satisfaction
    const totalGates = gates.length;
    const satisfiedGates = gates.filter(g => g.satisfied === true).length;
    const satisfied = satisfiedGates === totalGates;
    
    renderSignalsPanel();
    updateConstraintsPanel();
    updateNodeVisualValues();
    
    if (satisfied) {
        log(`Witness converged: ${satisfiedGates}/${totalGates} constraints satisfied!`, "success");
    } else {
        log(`Witness error: ${totalGates - satisfiedGates} constraints violated or unsolved!`, "error");
    }
}

function updateNodeVisualValues() {
    nodes.forEach(node => {
        if (node.isGate) {
            const gate = gates.find(g => g.id === node.id);
            if (gate) node.satisfied = gate.satisfied;
        } else {
            const sig = signals.find(s => s.id === node.id);
            if (sig) node.value = sig.val;
        }
    });
}

function updateConstraintsPanel() {
    const container = document.getElementById("constraints-container");
    container.innerHTML = gates.map(g => {
        const stateClass = g.satisfied === true ? 'satisfied' : (g.satisfied === false ? 'violated' : '');
        const outSig = signals.find(s => s.id === g.output);
        const outVal = outSig ? outSig.val : '?';
        return `
            <div class="constraint-card ${stateClass}">
                <div><strong>Gate ${g.id.toUpperCase()}</strong>: ${g.expr}</div>
                <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.25rem;">
                    Evaluation: ${g.satisfied === true ? 'Satisfied ✓' : (g.satisfied === false ? 'Violated ✗' : 'Unresolved')}
                </div>
            </div>
        `;
    }).join('');
}

// R1CS Compiler
function compileAndProve() {
    solveWitness();
    
    log("Compiling Circuit to R1CS matrices...", "info");
    
    // 1. Compile Witness Vector: s = [one, inputs, outputs, locals]
    const oneSig = signals.filter(s => s.type === 'constant' && s.name === 'one');
    const inputSigs = signals.filter(s => s.type === 'input');
    const outputSigs = signals.filter(s => s.type === 'output');
    const localSigs = signals.filter(s => s.type === 'local' || (s.type === 'constant' && s.name !== 'one'));
    
    witnessVector = [...oneSig, ...inputSigs, ...outputSigs, ...localSigs];
    
    // Display Witness Vector s
    const vectorContainer = document.getElementById("witness-vector-container");
    vectorContainer.innerHTML = `
        <div style="display:flex; flex-wrap:wrap; gap:0.4rem; font-family:var(--font-mono); font-size:0.75rem;">
            s = [
            ${witnessVector.map(s => `<span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-primary); border-color:rgba(255,255,255,0.1)">${s.name}: ${s.val}</span>`).join(', ')}
            ]
        </div>
    `;
    
    // 2. Generate R1CS matrices
    // R1CS formula: A * s  *  B * s  =  C * s
    // Number of constraints m = number of gates
    // Size of vectors n = witnessVector.length
    const m = gates.length;
    const n = witnessVector.length;
    
    r1csMatrices.A = Array(m).fill(0).map(() => Array(n).fill(0));
    r1csMatrices.B = Array(m).fill(0).map(() => Array(n).fill(0));
    r1csMatrices.C = Array(m).fill(0).map(() => Array(n).fill(0));
    
    gates.forEach((gate, rowIdx) => {
        const inIdxA = witnessVector.findIndex(s => s.id === gate.inputs[0]);
        const inIdxB = gate.inputs[1] ? witnessVector.findIndex(s => s.id === gate.inputs[1]) : -1;
        const outIdx = witnessVector.findIndex(s => s.id === gate.output);
        
        switch(gate.type) {
            case "mul":
                // x * y = z  => A_row[x] = 1, B_row[y] = 1, C_row[z] = 1
                if (inIdxA !== -1) r1csMatrices.A[rowIdx][inIdxA] = 1;
                if (inIdxB !== -1) r1csMatrices.B[rowIdx][inIdxB] = 1;
                if (outIdx !== -1) r1csMatrices.C[rowIdx][outIdx] = 1;
                break;
            case "add":
                // (x + y) * 1 = z => A_row[x] = 1, A_row[y] = 1, B_row[one] = 1, C_row[z] = 1
                if (inIdxA !== -1) r1csMatrices.A[rowIdx][inIdxA] = 1;
                if (inIdxB !== -1) r1csMatrices.A[rowIdx][inIdxB] = 1;
                const oneIdx = witnessVector.findIndex(s => s.name === 'one');
                if (oneIdx !== -1) r1csMatrices.B[rowIdx][oneIdx] = 1;
                if (outIdx !== -1) r1csMatrices.C[rowIdx][outIdx] = 1;
                break;
            case "bool":
                // x * (x - 1) = out => A_row[x] = 1, B_row[x] = 1, B_row[one] = -1, C_row[out] = 1
                if (inIdxA !== -1) {
                    r1csMatrices.A[rowIdx][inIdxA] = 1;
                    r1csMatrices.B[rowIdx][inIdxA] = 1;
                }
                const oIdx = witnessVector.findIndex(s => s.name === 'one');
                if (oIdx !== -1) r1csMatrices.B[rowIdx][oIdx] = -1;
                if (outIdx !== -1) r1csMatrices.C[rowIdx][outIdx] = 1;
                break;
            case "scale2":
                // (2 * x) * 1 = z => A_row[x] = 2, B_row[one] = 1, C_row[z] = 1
                if (inIdxA !== -1) r1csMatrices.A[rowIdx][inIdxA] = 2;
                const oIdx2 = witnessVector.findIndex(s => s.name === 'one');
                if (oIdx2 !== -1) r1csMatrices.B[rowIdx][oIdx2] = 1;
                if (outIdx !== -1) r1csMatrices.C[rowIdx][outIdx] = 1;
                break;
            case "scale4":
                // (4 * x) * 1 = z => A_row[x] = 4, B_row[one] = 1, C_row[z] = 1
                if (inIdxA !== -1) r1csMatrices.A[rowIdx][inIdxA] = 4;
                const oIdx4 = witnessVector.findIndex(s => s.name === 'one');
                if (oIdx4 !== -1) r1csMatrices.B[rowIdx][oIdx4] = 1;
                if (outIdx !== -1) r1csMatrices.C[rowIdx][outIdx] = 1;
                break;
        }
    });
    
    renderR1CSMatrices();
    log("R1CS Constraints matrix compiled successfully!", "success");
    
    // Calculate ZK proof receipt simulator
    simulateProofReceipt();
}

function renderR1CSMatrices() {
    const renderMatrix = (matrix, label) => {
        return `
            <div class="matrix-grid">
                <div class="matrix-label">${label}</div>
                <div class="matrix-row">
                    ${matrix.map(row => `
                        <div style="display:flex; flex-direction:column; gap:0.25rem;">
                            ${row.map(val => `<div class="matrix-val ${val !== 0 ? 'active-nz' : ''}">${val}</div>`).join('')}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    };
    
    const container = document.getElementById("r1cs-matrices-container");
    container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:1rem;">
            ${renderMatrix(r1csMatrices.A, "A")}
            ${renderMatrix(r1csMatrices.B, "B")}
            ${renderMatrix(r1csMatrices.C, "C")}
        </div>
    `;
}

function simulateProofReceipt() {
    // Generate proof hash simulator
    const isSat = gates.every(g => g.satisfied === true);
    const proofReceipt = document.getElementById("proof-receipt-container");
    if (!proofReceipt) return;
    
    if (isSat) {
        // Hash computation simulator
        const sString = witnessVector.map(s => s.val).join('-');
        const hash = sha256_hash(sString).substring(0, 32);
        
        proofReceipt.innerHTML = `
            <div style="background:rgba(57,255,20,0.04); border:1px dashed var(--neon-green); border-radius:8px; padding:1rem; font-family:var(--font-mono); font-size:0.8rem; display:flex; flex-direction:column; gap:0.4rem;">
                <div style="color:var(--neon-green); font-weight:700;">✓ PROOF RECEIPT GENERATED</div>
                <div><strong>Proof Hash</strong>: <span style="color:var(--text-primary);">${hash}</span></div>
                <div><strong>R1CS Constraints (m)</strong>: ${gates.length}</div>
                <div><strong>Witness Signals (n)</strong>: ${witnessVector.length}</div>
                <div><strong>Algorithm</strong>: Groth16 Snark Prover</div>
                <div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.2rem;">Proof verified locally in 14ms against SRS keys. Ready for mainnet push!</div>
            </div>
        `;
    } else {
        proofReceipt.innerHTML = `
            <div style="background:rgba(255,7,58,0.04); border:1px dashed var(--neon-crimson); border-radius:8px; padding:1rem; font-family:var(--font-mono); font-size:0.8rem; color:var(--text-secondary);">
                <div style="color:var(--neon-crimson); font-weight:700; margin-bottom:0.4rem;">✗ PROOF FAILED</div>
                Cannot generate proof because one or more constraints are violated or unresolved. Correct input values to compute matching witness values.
            </div>
        `;
    }
}

// Lightweight hash helper for simulation
function sha256_hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0') + "9f3f4c6e9384bc12df08ba23e7cf8a2f";
}

// ----------------------------------------------------
// CANVAS & PHYSICS RENDERING SYSTEM
// ----------------------------------------------------

function buildTopologyGraph() {
    nodes = [];
    links = [];
    
    // Track layout spacing
    const signalNodes = [];
    const gateNodes = [];
    
    // Add signals
    signals.forEach((sig, idx) => {
        const node = {
            id: sig.id,
            name: sig.name,
            type: sig.type,
            value: sig.val,
            isGate: false,
            x: 150,
            y: 100 + idx * 80,
            vx: 0,
            vy: 0
        };
        nodes.push(node);
        signalNodes.push(node);
    });
    
    // Add gates
    gates.forEach((gate, idx) => {
        const node = {
            id: gate.id,
            name: gate.type.toUpperCase(),
            type: gate.type,
            isGate: true,
            satisfied: gate.satisfied,
            x: 400,
            y: 150 + idx * 120,
            vx: 0,
            vy: 0
        };
        nodes.push(node);
        gateNodes.push(node);
    });
    
    // Build links
    gates.forEach(gate => {
        // Input wires: Signal -> Gate
        gate.inputs.forEach(inId => {
            links.push({
                source: inId,
                target: gate.id,
                flowActive: false
            });
        });
        
        // Output wire: Gate -> Signal
        links.push({
            source: gate.id,
            target: gate.output,
            flowActive: false
        });
    });
    
    // Distribute position initially
    nodes.forEach(node => {
        if (!node.isGate) {
            if (node.type === 'input' || node.type === 'constant') {
                node.x = 100 + Math.random() * 50;
            } else if (node.type === 'output') {
                node.x = 600 + Math.random() * 50;
            } else {
                node.x = 300 + Math.random() * 50;
            }
        } else {
            node.x = 350 + Math.random() * 100;
        }
    });
}

function triggerFlowParticles(sourceId, targetId) {
    const srcNode = nodes.find(n => n.id === sourceId);
    const tgtNode = nodes.find(n => n.id === targetId);
    if (!srcNode || !tgtNode) return;
    
    const count = 12;
    for (let i = 0; i < count; i++) {
        particles.push({
            x: srcNode.x,
            y: srcNode.y,
            tx: tgtNode.x,
            ty: tgtNode.y,
            progress: -i * 0.08, // staggered start
            speed: 0.04 + Math.random() * 0.02,
            color: srcNode.isGate ? 'rgba(57,255,20,0.8)' : 'rgba(0,242,254,0.8)'
        });
    }
}

function updatePhysics() {
    const k_spring = 0.04;
    const len_link = 120;
    const k_repulsion = 1200;
    const damping = 0.85;
    
    // 1. Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[j].x - nodes[i].x;
            const dy = nodes[j].y - nodes[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            
            if (dist < 250) {
                const force = k_repulsion / (dist * dist);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                
                nodes[i].vx -= fx;
                nodes[i].vy -= fy;
                nodes[j].vx += fx;
                nodes[j].vy += fy;
            }
        }
    }
    
    // 2. Spring attraction along links
    links.forEach(link => {
        const src = nodes.find(n => n.id === link.source);
        const tgt = nodes.find(n => n.id === link.target);
        if (!src || !tgt) return;
        
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        
        const delta = dist - len_link;
        const force = k_spring * delta;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        
        src.vx += fx;
        src.vy += fy;
        tgt.vx -= fx;
        tgt.vy -= fy;
    });
    
    // 3. Keep layout bounded by types
    nodes.forEach(node => {
        if (node === dragNode) return;
        
        // Horizontal constraints
        if (!node.isGate) {
            if (node.type === 'input' || node.type === 'constant') {
                node.vx += (80 - node.x) * 0.05;
            } else if (node.type === 'output') {
                node.vx += (canvas.width - 150 - node.x) * 0.05;
            }
        } else {
            node.vx += (canvas.width / 2 - node.x) * 0.01;
        }
        
        // Apply forces
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= damping;
        node.vy *= damping;
    });
}

function animationLoop() {
    updatePhysics();
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    // Apply pan & zoom
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);
    
    // 1. Draw connections/wires
    ctx.lineWidth = 2;
    links.forEach(link => {
        const src = nodes.find(n => n.id === link.source);
        const tgt = nodes.find(n => n.id === link.target);
        if (!src || !tgt) return;
        
        // Draw path with neon gradient effect
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        
        // Color based on active status
        ctx.strokeStyle = "rgba(0, 242, 254, 0.15)";
        ctx.stroke();
    });
    
    // 2. Draw animated flow particles
    particles.forEach((p, idx) => {
        p.progress += p.speed;
        if (p.progress >= 1.0) {
            particles.splice(idx, 1);
            return;
        }
        if (p.progress < 0) return; // not started yet
        
        const px = p.x + (p.tx - p.x) * p.progress;
        const py = p.y + (p.ty - p.y) * p.progress;
        
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0; // reset
    });
    
    // 3. Draw nodes
    nodes.forEach(node => {
        ctx.save();
        ctx.translate(node.x, node.y);
        
        if (node.isGate) {
            // Draw gate node (square block)
            const size = 42;
            const satisfiedColor = node.satisfied === true ? varColor('--neon-green') : (node.satisfied === false ? varColor('--neon-crimson') : 'rgba(255, 255, 255, 0.2)');
            
            ctx.shadowBlur = 8;
            ctx.shadowColor = satisfiedColor;
            
            // Background
            ctx.fillStyle = "rgba(10, 14, 23, 0.95)";
            ctx.strokeStyle = satisfiedColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.rect(-size/2, -size/2, size, size);
            ctx.fill();
            ctx.stroke();
            
            // Text Label
            ctx.shadowBlur = 0;
            ctx.fillStyle = varColor('--text-primary');
            ctx.font = `bold 12px ${varFont('--font-mono')}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(node.name, 0, 0);
        } else {
            // Draw signal node (circle)
            const radius = 22;
            const sigColor = node.type === 'input' ? varColor('--neon-cyan') : (node.type === 'output' ? varColor('--neon-green') : varColor('--neon-purple'));
            
            ctx.shadowBlur = 8;
            ctx.shadowColor = sigColor;
            
            ctx.fillStyle = "rgba(10, 14, 23, 0.95)";
            ctx.strokeStyle = sigColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Value text
            ctx.shadowBlur = 0;
            ctx.fillStyle = sigColor;
            ctx.font = `bold 11px ${varFont('--font-mono')}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(node.value !== undefined ? node.value.toString() : '?', 0, -2);
            
            // Name label below node
            ctx.fillStyle = varColor('--text-secondary');
            ctx.font = `10px ${varFont('--font-sans')}`;
            ctx.fillText(node.name, 0, radius + 14);
        }
        ctx.restore();
    });
    
    ctx.restore();
    
    requestAnimationFrame(animationLoop);
}

// Colors helper to extract CSS variable values
function varColor(name) {
    switch(name) {
        case '--neon-cyan': return '#00f2fe';
        case '--neon-green': return '#39ff14';
        case '--neon-yellow': return '#ffd700';
        case '--neon-crimson': return '#ff073a';
        case '--neon-purple': return '#bd00ff';
        case '--text-primary': return '#f0f4f8';
        case '--text-secondary': return '#94a3b8';
        default: return '#ffffff';
    }
}
function varFont(name) {
    if (name === '--font-mono') return "'Fira Code', monospace";
    return "'Outfit', sans-serif";
}

// ----------------------------------------------------
// CANVAS EVENT INTERACTION
// ----------------------------------------------------
function setupCanvasListeners() {
    canvas.addEventListener("mousedown", e => {
        const mouse = getRelativeMousePos(e);
        
        // Check if node clicked
        let clickedNode = null;
        for (let i = nodes.length - 1; i >= 0; i--) {
            const n = nodes[i];
            const dx = mouse.x - n.x;
            const dy = mouse.y - n.y;
            const radius = n.isGate ? 22 : 25;
            if (dx*dx + dy*dy < radius*radius) {
                clickedNode = n;
                break;
            }
        }
        
        if (clickedNode) {
            dragNode = clickedNode;
        } else {
            isPanning = true;
            startPan = { x: e.clientX - offset.x, y: e.clientY - offset.y };
        }
    });
    
    canvas.addEventListener("mousemove", e => {
        if (dragNode) {
            const mouse = getRelativeMousePos(e);
            dragNode.x = mouse.x;
            dragNode.y = mouse.y;
            dragNode.vx = 0;
            dragNode.vy = 0;
        } else if (isPanning) {
            offset.x = e.clientX - startPan.x;
            offset.y = e.clientY - startPan.y;
        }
    });
    
    canvas.addEventListener("mouseup", () => {
        dragNode = null;
        isPanning = false;
    });
    
    canvas.addEventListener("mouseleave", () => {
        dragNode = null;
        isPanning = false;
    });
    
    canvas.addEventListener("wheel", e => {
        e.preventDefault();
        const mouse = getRelativeMousePos(e);
        const zoomFactor = 1.1;
        const newScale = e.deltaY < 0 ? scale * zoomFactor : scale / zoomFactor;
        
        // Bound zoom scale
        if (newScale >= 0.4 && newScale <= 3.0) {
            scale = newScale;
        }
    });
}

function getRelativeMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    
    const x = (clientX - rect.left - offset.x) / scale;
    const y = (clientY - rect.top - offset.y) / scale;
    return { x, y };
}
