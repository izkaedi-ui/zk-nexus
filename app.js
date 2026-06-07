/* ZK-Nexus v2.0 JavaScript Core - Circuit Compiler, Solver, & Canvas Engine */

// Global State
let signals = [];
let gates = [];
let witnessVector = []; // s = [one, inputs, outputs, locals]
let r1csMatrices = { A: [], B: [], C: [] };
let logs = [];

// WebAudio State
let audioCtx = null;
let isMuted = false;
let droneGain = null;
let droneOscs = [];
let droneFilter = null;

// Setup Ceremony State
let isCeremonyCompleted = false;
let pkHash = "";
let vkHash = "";

// Onboarding Tour State
let currentTourStep = 0;
const tourSlides = [
    {
        title: "🌌 Welcome to ZK-Nexus",
        content: "<p>ZK-Nexus is an interactive playground designed to demystify Zero-Knowledge cryptography. In this playground, you can design arithmetic circuits, compile them to R1CS matrices, generate witnesses, and execute proof verification cycles.</p><p><b>First Step:</b> Try choosing a preset sandbox or editing the Circom code on the left panel.</p>"
    },
    {
        title: "🔋 Signals & Witness Generation",
        content: "<p>ZK circuits operate on <b>signals</b>. Input signals are the private witnesses (your secrets), while output signals are public assertions.</p><p>When you modify signal values, the <i>Witness Solver</i> propagates variables through the circuit gates to compute a valid <b>Witness Vector (s)</b>. If a gate's values satisfy its mathematical constraint, it glows green on the canvas; otherwise, it turns crimson.</p>"
    },
    {
        title: "🧮 R1CS Matrices (A, B, C)",
        content: "<p>Before cryptographic proof generation, equations are compiled into a <b>Rank-1 Constraint System (R1CS)</b>: three coefficient matrices <b>A, B, and C</b>.</p><p>A constraint is satisfied if and only if: <code>(A·s) * (B·s) = (C·s)</code>. The heatmaps on the right panel show these matrix coefficients in real-time. Hover over a cell to see how it links to the witness vector!</p>"
    },
    {
        title: "📐 QAP Polynomial Division",
        content: "<p>To bundle all constraints into a single equation, R1CS is converted to a <b>Quadratic Arithmetic Program (QAP)</b> via Lagrange Interpolation.</p><p>We define polynomials <code>A(x), B(x), C(x)</code> over evaluation points 1 to m. The prover computes the quotient <code>H(x) = (A(x)*B(x) - C(x)) / T(x)</code>. If the remainder <code>R(x)</code> is exactly 0, the witness holds true!</p>"
    },
    {
        title: "🧪 Powers-of-Tau Setup Ceremony",
        content: "<p>To build a Groth16 proving environment, we require a <b>Setup Ceremony</b> (structured reference string) to generate PK and VK keys.</p><p>This ceremony generates mock random parameters (often called <i>toxic waste</i>). These parameters must be destroyed after setup to prevent forging proofs. Click the <b>Run Setup</b> button to simulate this process visually!</p>"
    },
    {
        title: "🔑 Prover & Verifier Loop",
        content: "<p>Once setup is complete and all constraints are satisfied, click <b>Generate Proof</b>. The prover computes the proof receipt hash, which the verifier verifies against the Verification Key in milliseconds using bilinear pairings.</p><p>Use the export controls at the bottom of the inspector to download your R1CS matrices, witness vector, or canvas blueprint!</p>"
    }
];

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
let toxicParticles = []; // Spawns during ceremony setup

// Wiring Drag State
let wiringSource = null;
let currentMouse = { x: 0, y: 0 };

// Modal Double-Click Coordinates
let addNodeCoords = { x: 0, y: 0 };


// Default Circom Code Preset
const DEFAULT_CIRCOM_CODE = `// ZK-Nexus Circom Circuit Compiler v2.0
// Double-click canvas to add custom signals or gates!
// Shift-drag from one node to another to connect wires.

template FactorizationProver() {
    signal input secret_x;
    signal input secret_y;
    signal output public_product;

    // Constrain product
    public_product <== secret_x * secret_y;
}

component main = FactorizationProver();`;

// Presets Definition
const PRESETS = {
    multiplier: {
        name: "Factorization Prover",
        description: "Prove you know the prime factors of a public number without revealing them: x * y = public_product.",
        signals: [
            { id: "one", name: "one", type: "constant", val: 1 },
            { id: "secret_x", name: "secret_x", type: "input", val: 7 },
            { id: "secret_y", name: "secret_y", type: "input", val: 11 },
            { id: "public_product", name: "public_product", type: "output", val: 77 }
        ],
        gates: [
            { id: "g1", type: "mul", inputs: ["secret_x", "secret_y"], output: "public_product", expr: "secret_x * secret_y" }
        ],
        code: DEFAULT_CIRCOM_CODE
    },
    quadratic: {
        name: "Quadratic Solver",
        description: "Prove you know a secret solution x to the equation: x^2 + 5 = 14. Realized via intermediate constraints.",
        signals: [
            { id: "one", name: "one", type: "constant", val: 1 },
            { id: "secret_x", name: "secret_x", type: "input", val: 3 },
            { id: "x_squared", name: "x_squared", type: "local", val: 9 },
            { id: "const_5", name: "const_5", type: "constant", val: 5 },
            { id: "public_out", name: "public_out", type: "output", val: 14 }
        ],
        gates: [
            { id: "g1", type: "mul", inputs: ["secret_x", "secret_x"], output: "x_squared", expr: "secret_x * secret_x" },
            { id: "g2", type: "add", inputs: ["x_squared", "const_5"], output: "public_out", expr: "x_squared + const_5" }
        ],
        code: `// Quadratic Equation: x^2 + 5 = 14
template QuadraticSolver() {
    signal input secret_x;
    signal local x_squared;
    signal output public_out;
    
    // Constraints
    x_squared <== secret_x * secret_x;
    public_out <== x_squared + const_5;
}`
    },
    range3: {
        name: "3-Bit Range Proof",
        description: "Prove a secret number input_val lies in [0, 7] by decomposing it into 3 bits (b0, b1, b2) and constraining them to be boolean: b * (b - 1) = 0.",
        signals: [
            { id: "one", name: "one", type: "constant", val: 1 },
            { id: "input_val", name: "input_val", type: "input", val: 5 },
            { id: "bit_0", name: "bit_0", type: "input", val: 1 },
            { id: "bit_1", name: "bit_1", type: "input", val: 0 },
            { id: "bit_2", name: "bit_2", type: "input", val: 1 },
            { id: "t_1", name: "t_1", type: "local", val: 2 },
            { id: "t_2", name: "t_2", type: "local", val: 4 },
            { id: "sum_bits", name: "sum_bits", type: "local", val: 5 },
            { id: "bool_check_0", name: "bool_check_0", type: "output", val: 0 },
            { id: "bool_check_1", name: "bool_check_1", type: "output", val: 0 },
            { id: "bool_check_2", name: "bool_check_2", type: "output", val: 0 }
        ],
        gates: [
            { id: "g1", type: "bool", inputs: ["bit_0", "one"], output: "bool_check_0", expr: "bit_0 * (bit_0 - 1)" },
            { id: "g2", type: "bool", inputs: ["bit_1", "one"], output: "bool_check_1", expr: "bit_1 * (bit_1 - 1)" },
            { id: "g3", type: "bool", inputs: ["bit_2", "one"], output: "bool_check_2", expr: "bit_2 * (bit_2 - 1)" },
            { id: "g4", type: "scale2", inputs: ["bit_1", "one"], output: "t_1", expr: "2 * bit_1" },
            { id: "g5", type: "scale4", inputs: ["bit_2", "one"], output: "t_2", expr: "4 * bit_2" },
            { id: "g6", type: "add", inputs: ["bit_0", "t_1"], output: "sum_bits", expr: "bit_0 + 2*bit_1" },
            { id: "g7", type: "add", inputs: ["sum_bits", "t_2"], output: "input_val", expr: "sum_bits + 4*bit_2" }
        ],
        code: `// 3-Bit Range Proof [0, 7]
template RangeProof3() {
    signal input input_val;
    signal input bit_0;
    signal input bit_1;
    signal input bit_2;
    
    // Boolean checks: b * (b - 1) === 0
    bool_check_0 <== bit_0 * (bit_0 - 1);
    bool_check_1 <== bit_1 * (bit_1 - 1);
    bool_check_2 <== bit_2 * (bit_2 - 1);
    
    // Arithmetic scale
    t_1 <== 2 * bit_1;
    t_2 <== 4 * bit_2;
    
    sum_bits <== bit_0 + t_1;
    input_val <== sum_bits + t_2;
}`
    },
    ternary_mux: {
        name: "Ternary MUX (Multiplexer)",
        description: "Prove the output of a selection condition: out = s * (a - b) + b. Enforces s * (s - 1) = 0 (boolean check).",
        signals: [
            { id: "one", name: "one", type: "constant", val: 1 },
            { id: "selector", name: "selector", type: "input", val: 1 },
            { id: "in_a", name: "in_a", type: "input", val: 42 },
            { id: "in_b", name: "in_b", type: "input", val: 18 },
            { id: "diff_ab", name: "diff_ab", type: "local", val: 24 },
            { id: "bool_check", name: "bool_check", type: "local", val: 0 },
            { id: "prod_term", name: "prod_term", type: "local", val: 24 },
            { id: "out", name: "out", type: "output", val: 42 }
        ],
        gates: [
            { id: "g1", type: "bool", inputs: ["selector", "one"], output: "bool_check", expr: "selector * (selector - 1)" },
            { id: "g2", type: "add", inputs: ["in_a", "in_b"], output: "diff_ab", expr: "in_a - in_b" },
            { id: "g3", type: "mul", inputs: ["selector", "diff_ab"], output: "prod_term", expr: "selector * diff_ab" },
            { id: "g4", type: "add", inputs: ["prod_term", "in_b"], output: "out", expr: "prod_term + in_b" }
        ],
        code: `// Ternary Multiplexer Circuit
template TernaryMux() {
    signal input selector;
    signal input in_a;
    signal input in_b;
    signal output out;
    
    signal local diff_ab;
    signal local prod_term;
    signal local bool_check;
    
    // Constraints
    bool_check <== selector * (selector - 1);
    diff_ab <== in_a - in_b;
    prod_term <== selector * diff_ab;
    out <== prod_term + in_b;
}`
    },
    mimc_round: {
        name: "MiMC Cubic Round",
        description: "Prove knowledge of a hash pre-image round computation: out = (x + 3)^3 using quadratic gates.",
        signals: [
            { id: "one", name: "one", type: "constant", val: 1 },
            { id: "secret_x", name: "secret_x", type: "input", val: 2 },
            { id: "const_c", name: "const_c", type: "constant", val: 3 },
            { id: "x_plus_c", name: "x_plus_c", type: "local", val: 5 },
            { id: "x_plus_c_sq", name: "x_plus_c_sq", type: "local", val: 25 },
            { id: "public_hash", name: "public_hash", type: "output", val: 125 }
        ],
        gates: [
            { id: "g1", type: "add", inputs: ["secret_x", "const_c"], output: "x_plus_c", expr: "secret_x + const_c" },
            { id: "g2", type: "mul", inputs: ["x_plus_c", "x_plus_c"], output: "x_plus_c_sq", expr: "x_plus_c * x_plus_c" },
            { id: "g3", type: "mul", inputs: ["x_plus_c_sq", "x_plus_c"], output: "public_hash", expr: "x_plus_c_sq * x_plus_c" }
        ],
        code: `// MiMC Encryption Cubic Round Approximation
template MiMCRound() {
    signal input secret_x;
    signal output public_hash;
    
    signal local x_plus_c;
    signal local x_plus_c_sq;
    
    // Constraints: out = (x + 3)^3
    x_plus_c <== secret_x + const_c;
    x_plus_c_sq <== x_plus_c * x_plus_c;
    public_hash <== x_plus_c_sq * x_plus_c;
}`
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

// ----------------------------------------------------
// WEBAUDIO SYNTHESIZER
// ----------------------------------------------------
function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    log("WebAudio Context initialized.", "info");
    initDrone();
}

function initDrone() {
    if (!audioCtx || droneGain) return;
    try {
        // Create BiquadFilter to keep drone low-pass analog warm
        droneFilter = audioCtx.createBiquadFilter();
        droneFilter.type = "lowpass";
        droneFilter.frequency.setValueAtTime(280, audioCtx.currentTime);
        
        droneGain = audioCtx.createGain();
        droneGain.gain.setValueAtTime(isMuted ? 0 : 0.02, audioCtx.currentTime);
        
        droneFilter.connect(droneGain);
        droneGain.connect(audioCtx.destination);
        
        // 4 voices chord detuned
        const basePitches = [65.41, 98.00, 130.81, 164.81]; // C2, G2, C3, E3 (C major harmonic)
        for (let i = 0; i < 4; i++) {
            const osc = audioCtx.createOscillator();
            osc.type = i % 2 === 0 ? "sawtooth" : "triangle";
            // Detune slightly
            osc.frequency.setValueAtTime(basePitches[i] + (Math.random() - 0.5) * 0.4, audioCtx.currentTime);
            osc.connect(droneFilter);
            osc.start(0);
            droneOscs.push(osc);
        }
        log("Continuous ambient modular drone synth activated.", "info");
    } catch(e) {
        console.error("Audio drone error: ", e);
    }
}

function updateDroneChords(satisfied) {
    if (!audioCtx || droneOscs.length === 0) return;
    const now = audioCtx.currentTime;
    
    const majorPitches = [65.41, 98.00, 130.81, 164.81]; // C2, G2, C3, E3
    const minorPitches = [65.41, 92.50, 116.54, 155.56]; // C2, Gb2, Bb2, Eb3 (Dissonant diminished chord)
    
    const targetPitches = satisfied ? majorPitches : minorPitches;
    
    droneOscs.forEach((osc, idx) => {
        // Smoothly glide frequencies over 0.8s
        osc.frequency.exponentialRampToValueAtTime(targetPitches[idx] + (Math.random() - 0.5) * 0.3, now + 0.8);
    });
    
    if (droneFilter) {
        const targetFreq = satisfied ? 380 : 200;
        droneFilter.frequency.exponentialRampToValueAtTime(targetFreq, now + 0.8);
    }
}

function updateDroneVolume() {
    if (droneGain && audioCtx) {
        const targetVol = isMuted ? 0 : 0.02;
        droneGain.gain.linearRampToValueAtTime(targetVol, audioCtx.currentTime + 0.1);
    }
}

function playSoundChime(type) {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;
    
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    
    if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1760, now + 0.15);
        gainNode.gain.setValueAtTime(0.06, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'failure') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.linearRampToValueAtTime(60, now + 0.25);
        gainNode.gain.setValueAtTime(0.08, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'proof') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(1100, now + 0.2);
        osc.frequency.linearRampToValueAtTime(880, now + 0.45);
        
        gainNode.gain.setValueAtTime(0.08, now);
        gainNode.gain.linearRampToValueAtTime(0.04, now + 0.2);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
    }
}

// Initialize Application
window.addEventListener("DOMContentLoaded", () => {
    canvas = document.getElementById("circuit-canvas");
    ctx = canvas.getContext("2d");
    
    // Setup Code Editor default value
    document.getElementById("circom-editor").value = DEFAULT_CIRCOM_CODE;
    
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
    document.getElementById("btn-prove").addEventListener("click", () => {
        compileAndProve();
        playSoundChime('proof');
    });
    document.getElementById("btn-zoom-in").addEventListener("click", () => { scale = Math.min(scale * 1.2, 3.0); });
    document.getElementById("btn-zoom-out").addEventListener("click", () => { scale = Math.max(scale / 1.2, 0.4); });
    document.getElementById("btn-reset").addEventListener("click", () => { offset = { x: 0, y: 0 }; scale = 1.0; });
    
    // Audio toggler
    const audioBtn = document.getElementById("btn-mute-sound");
    audioBtn.addEventListener("click", () => {
        isMuted = !isMuted;
        if (isMuted) {
            audioBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
            audioBtn.style.color = 'var(--neon-crimson)';
        } else {
            audioBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
            audioBtn.style.color = 'var(--neon-cyan)';
            initAudio();
        }
        updateDroneVolume();
    });

    // Compile Circom Button
    document.getElementById("btn-compile-circom").addEventListener("click", () => {
        const code = document.getElementById("circom-editor").value;
        compileCircom(code);
    });

    // Setup Ceremony Button
    document.getElementById("btn-run-ceremony").addEventListener("click", () => {
        runSetupCeremony();
    });

    // Onboarding Guide Buttons
    document.getElementById("btn-open-tour").addEventListener("click", () => {
        openTour();
    });
    document.getElementById("btn-close-tour").addEventListener("click", () => {
        closeTour();
    });
    document.getElementById("btn-tour-prev").addEventListener("click", () => {
        prevTourStep();
    });
    document.getElementById("btn-tour-next").addEventListener("click", () => {
        nextTourStep();
    });

    // Export Action Buttons
    document.getElementById("btn-export-witness").addEventListener("click", () => {
        exportWitness();
    });
    document.getElementById("btn-export-r1cs").addEventListener("click", () => {
        exportR1CS();
    });
    document.getElementById("btn-export-canvas").addEventListener("click", () => {
        exportCanvas();
    });
    
    // Modal controls
    document.getElementById("btn-close-modal").addEventListener("click", () => {
        document.getElementById("add-node-modal").classList.remove("active");
    });
    document.getElementById("btn-save-node").addEventListener("click", saveNodeFromModal);
    
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
    document.getElementById("circom-editor").value = preset.code;
    
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
                <div style="display:flex; align-items:center; gap:0.4rem;">
                    <input type="number" 
                           class="signal-val-input" 
                           value="${sig.val}" 
                           ${isConstant ? 'disabled' : ''} 
                           onchange="updateSignalValue('${sig.id}', this.value)">
                    ${!isConstant ? `<button class="tool-btn" style="color:var(--neon-crimson); font-size:0.75rem;" onclick="deleteNode('${sig.id}')"><i class="fas fa-trash-alt"></i></button>` : ''}
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
    let playSound = false;
    
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
                        // Check if expression represents subtraction
                        if (gate.expr && gate.expr.includes('-')) {
                            outVal = valA - valB;
                        } else {
                            outVal = valA + valB;
                        }
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
                
                if (gate.satisfied !== isSat) {
                    playSound = true;
                }
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
    
    // Update synth audio drone chord
    updateDroneChords(satisfied);
    
    if (satisfied) {
        log(`Witness converged: ${satisfiedGates}/${totalGates} constraints satisfied!`, "success");
        if (playSound) playSoundChime('success');
    } else {
        log(`Witness error: ${totalGates - satisfiedGates} constraints violated or unsolved!`, "error");
        if (playSound) playSoundChime('failure');
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
            <div class="constraint-card ${stateClass}" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div><strong>Gate ${g.id.toUpperCase()}</strong>: ${g.expr}</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.25rem;">
                        Evaluation: ${g.satisfied === true ? 'Satisfied ✓' : (g.satisfied === false ? 'Violated ✗' : 'Unresolved')}
                    </div>
                </div>
                <button class="tool-btn" style="color:var(--neon-crimson); font-size:0.75rem;" onclick="deleteNode('${g.id}')"><i class="fas fa-trash-alt"></i></button>
            </div>
        `;
    }).join('');
}

// ----------------------------------------------------
// CIRCOM COMPILER PARSER
// ----------------------------------------------------
function compileCircom(code) {
    log("Compiling Circom code snippet...", "info");
    
    // Check code diagnostics first on raw text
    runCircomDiagnostics(code);
    
    // Strip comments
    code = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    
    // Scan instructions split by semicolons/braces
    const lines = code.split(/[\n;{}]/);
    const newSignals = [
        { id: "one", name: "one", type: "constant", val: 1 }
    ];
    const newGates = [];
    
    let gateIdCounter = 0;
    
    lines.forEach(line => {
        line = line.trim();
        if (!line) return;
        
        // Match signal declarations
        const sigMatch = line.match(/signal\s+(input|output|local)?\s*([a-zA-Z0-9_]+)/);
        if (sigMatch) {
            const type = sigMatch[1] || 'local';
            const name = sigMatch[2];
            if (!newSignals.find(s => s.id === name)) {
                newSignals.push({
                    id: name,
                    name: name,
                    type: type,
                    val: type === 'input' ? 5 : (type === 'constant' ? 1 : 0) // default value
                });
            }
            return;
        }
        
        // Match constraint statement using <== or ===
        let exprMatch = line.match(/([a-zA-Z0-9_]+)\s*(<==|===|===>)\s*(.+)/);
        if (exprMatch) {
            const outName = exprMatch[1].trim();
            const rightExpr = exprMatch[3].trim();
            
            // Check if signal exists in vector, if not add it as local
            const addSigIfMissing = (name) => {
                if (!newSignals.find(s => s.id === name) && isNaN(name)) {
                    newSignals.push({ id: name, name: name, type: "local", val: 0 });
                }
            };
            
            addSigIfMissing(outName);
            
            // Case 1: Multiplication: x * y
            let mulMatch = rightExpr.match(/([a-zA-Z0-9_]+)\s*\*\s*([a-zA-Z0-9_]+)/);
            if (mulMatch) {
                const in1 = mulMatch[1];
                const in2 = mulMatch[2];
                addSigIfMissing(in1);
                addSigIfMissing(in2);
                
                let isBool = false;
                if (rightExpr.includes('-')) {
                    isBool = true;
                }
                newGates.push({
                    id: `g_${++gateIdCounter}`,
                    type: isBool ? "bool" : "mul",
                    inputs: [in1, isBool ? "one" : in2],
                    output: outName,
                    expr: `${in1} * ${isBool ? '(' + in1 + '-1)' : in2}`
                });
                return;
            }
            
            // Case 2: Scaling: 2 * x or 4 * x
            let scale2Match = rightExpr.match(/2\s*\*\s*([a-zA-Z0-9_]+)/);
            if (scale2Match) {
                const in1 = scale2Match[1];
                addSigIfMissing(in1);
                newGates.push({
                    id: `g_${++gateIdCounter}`,
                    type: "scale2",
                    inputs: [in1, "one"],
                    output: outName,
                    expr: `2 * ${in1}`
                });
                return;
            }
            let scale4Match = rightExpr.match(/4\s*\*\s*([a-zA-Z0-9_]+)/);
            if (scale4Match) {
                const in1 = scale4Match[1];
                addSigIfMissing(in1);
                newGates.push({
                    id: `g_${++gateIdCounter}`,
                    type: "scale4",
                    inputs: [in1, "one"],
                    output: outName,
                    expr: `4 * ${in1}`
                });
                return;
            }
            
            // Case 3: Addition/Subtraction: x + y or x - y
            let addMatch = rightExpr.match(/([a-zA-Z0-9_]+)\s*(\+|-)\s*([a-zA-Z0-9_]+)/);
            if (addMatch) {
                const in1 = addMatch[1];
                const op = addMatch[2];
                const in2 = addMatch[3];
                addSigIfMissing(in1);
                addSigIfMissing(in2);
                newGates.push({
                    id: `g_${++gateIdCounter}`,
                    type: "add",
                    inputs: [in1, in2],
                    output: outName,
                    expr: `${in1} ${op} ${in2}`
                });
                return;
            }
        }
    });
    
    if (newSignals.length > 1 && newGates.length > 0) {
        signals = newSignals;
        gates = newGates;
        log(`Compiled ${signals.length - 1} signals and ${gates.length} constraints from Circom.`, "success");
        renderSignalsPanel();
        buildTopologyGraph();
        compileAndProve();
    } else {
        log("Circom compiler error: No valid constraints or signal declarations found.", "error");
    }
}

// Delete Node Handler
function deleteNode(id) {
    // Check if it is a signal
    const sigIdx = signals.findIndex(s => s.id === id);
    if (sigIdx !== -1) {
        if (signals[sigIdx].type === 'constant') return;
        signals.splice(sigIdx, 1);
        // Remove connected gates
        gates = gates.filter(g => g.output !== id && !g.inputs.includes(id));
        log(`Deleted signal node: ${id}`, "info");
    } else {
        // Must be a gate
        gates = gates.filter(g => g.id !== id);
        log(`Deleted constraint gate: ${id}`, "info");
    }
    
    renderSignalsPanel();
    buildTopologyGraph();
    compileAndProve();
}

// ----------------------------------------------------
// R1CS & POLYNOMIAL QAP COMPILER
// ----------------------------------------------------
function compileAndProve() {
    solveWitness();
    
    log("Compiling Circuit to R1CS matrices...", "info");
    
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
                if (inIdxA !== -1) r1csMatrices.A[rowIdx][inIdxA] = 1;
                if (inIdxB !== -1) r1csMatrices.B[rowIdx][inIdxB] = 1;
                if (outIdx !== -1) r1csMatrices.C[rowIdx][outIdx] = 1;
                break;
            case "add":
                if (inIdxA !== -1) r1csMatrices.A[rowIdx][inIdxA] = 1;
                if (inIdxB !== -1) {
                    if (gate.expr && gate.expr.includes('-')) {
                        r1csMatrices.A[rowIdx][inIdxB] = -1; // subtraction
                    } else {
                        r1csMatrices.A[rowIdx][inIdxB] = 1;
                    }
                }
                const oneIdx = witnessVector.findIndex(s => s.name === 'one');
                if (oneIdx !== -1) r1csMatrices.B[rowIdx][oneIdx] = 1;
                if (outIdx !== -1) r1csMatrices.C[rowIdx][outIdx] = 1;
                break;
            case "bool":
                if (inIdxA !== -1) {
                    r1csMatrices.A[rowIdx][inIdxA] = 1;
                    r1csMatrices.B[rowIdx][inIdxA] = 1;
                }
                const oIdx = witnessVector.findIndex(s => s.name === 'one');
                if (oIdx !== -1) r1csMatrices.B[rowIdx][oIdx] = -1;
                if (outIdx !== -1) r1csMatrices.C[rowIdx][outIdx] = 1;
                break;
            case "scale2":
                if (inIdxA !== -1) r1csMatrices.A[rowIdx][inIdxA] = 2;
                const oIdx2 = witnessVector.findIndex(s => s.name === 'one');
                if (oIdx2 !== -1) r1csMatrices.B[rowIdx][oIdx2] = 1;
                if (outIdx !== -1) r1csMatrices.C[rowIdx][outIdx] = 1;
                break;
            case "scale4":
                if (inIdxA !== -1) r1csMatrices.A[rowIdx][inIdxA] = 4;
                const oIdx4 = witnessVector.findIndex(s => s.name === 'one');
                if (oIdx4 !== -1) r1csMatrices.B[rowIdx][oIdx4] = 1;
                if (outIdx !== -1) r1csMatrices.C[rowIdx][outIdx] = 1;
                break;
        }
    });
    
    renderR1CSMatrices();
    
    // QAP Calculation
    compileQAP();
    
    // Calculate ZK proof receipt simulator
    simulateProofReceipt();
}

function renderR1CSMatrices() {
    const renderHeatmap = (matrix, label) => {
        return `
            <div class="heatmap-row">
                <div class="heatmap-label">${label}</div>
                <div class="heatmap-cells-wrapper">
                    ${matrix.map((row, rIdx) => `
                        <div style="display:flex; flex-direction:column; gap:0.2rem;">
                            ${row.map((val, cIdx) => {
                                let valClass = "val-zero";
                                if (val > 0) valClass = "val-pos";
                                if (val < 0) valClass = "val-neg";
                                return `
                                    <div class="heatmap-cell ${valClass}" 
                                         data-matrix="${label}" 
                                         data-row="${rIdx}" 
                                         data-col="${cIdx}" 
                                         data-val="${val}"
                                         onmouseenter="showHeatmapTooltip(this)"
                                         onmouseleave="clearHeatmapTooltip()">${val !== 0 ? val : "0"}</div>
                                `;
                            }).join('')}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    };
    
    const container = document.getElementById("r1cs-matrices-container");
    if (container) {
        container.innerHTML = `
            <div class="matrix-heatmap-grid">
                ${renderHeatmap(r1csMatrices.A, "A")}
                ${renderHeatmap(r1csMatrices.B, "B")}
                ${renderHeatmap(r1csMatrices.C, "C")}
            </div>
        `;
    }
}

function showHeatmapTooltip(el) {
    const matrix = el.getAttribute("data-matrix");
    const row = parseInt(el.getAttribute("data-row"));
    const col = parseInt(el.getAttribute("data-col"));
    const val = parseFloat(el.getAttribute("data-val"));
    
    const signalName = witnessVector[col] ? witnessVector[col].name : `s[${col}]`;
    const gateId = gates[row] ? gates[row].id.toUpperCase() : `G${row+1}`;
    
    const tooltip = document.getElementById("heatmap-tooltip");
    if (tooltip) {
        tooltip.innerHTML = `Matrix ${matrix}[${gateId}, ${signalName}] = <strong>${val}</strong>`;
        tooltip.style.color = "var(--neon-yellow)";
    }
    
    // Highlight matching signal card in left side panel
    if (witnessVector[col]) {
        const card = document.getElementById(`sig-card-${witnessVector[col].id}`);
        if (card) {
            card.style.borderColor = "var(--neon-yellow)";
            card.style.background = "rgba(255, 215, 0, 0.08)";
        }
    }
}

function clearHeatmapTooltip() {
    const tooltip = document.getElementById("heatmap-tooltip");
    if (tooltip) {
        tooltip.innerHTML = "Hover cell to inspect";
        tooltip.style.color = "var(--neon-cyan)";
    }
    
    // Clear highlights on all signal cards
    document.querySelectorAll(".signal-card").forEach(card => {
        card.style.borderColor = "";
        card.style.background = "";
    });
}

// ----------------------------------------------------
// POLYNOMIAL MATHEMATICS (LAGRANGE INTERPOLATION)
// ----------------------------------------------------
function polyMul(p1, p2) {
    const result = Array(p1.length + p2.length - 1).fill(0);
    for (let i = 0; i < p1.length; i++) {
        for (let j = 0; j < p2.length; j++) {
            result[i + j] += p1[i] * p2[j];
        }
    }
    return result;
}

function polyScale(p, scalar) {
    return p.map(c => c * scalar);
}

function polyAdd(p1, p2) {
    const maxLen = Math.max(p1.length, p2.length);
    const result = Array(maxLen).fill(0);
    for (let i = 0; i < maxLen; i++) {
        result[i] = (p1[i] || 0) + (p2[i] || 0);
    }
    return result;
}

function polySub(p1, p2) {
    const maxLen = Math.max(p1.length, p2.length);
    const result = Array(maxLen).fill(0);
    for (let i = 0; i < maxLen; i++) {
        result[i] = (p1[i] || 0) - (p2[i] || 0);
    }
    return result;
}

function lagrangeBasis(j, points) {
    let result = [1];
    let denominator = 1;
    const xj = points[j];
    
    for (let k = 0; k < points.length; k++) {
        if (k === j) continue;
        const xk = points[k];
        result = polyMul(result, [-xk, 1]);
        denominator *= (xj - xk);
    }
    return polyScale(result, 1.0 / denominator);
}

function interpolate(points, values) {
    let result = [0];
    for (let j = 0; j < points.length; j++) {
        const basis = lagrangeBasis(j, points);
        const scaledBasis = polyScale(basis, values[j]);
        result = polyAdd(result, scaledBasis);
    }
    return result;
}

function polyDiv(num, den) {
    const N = [...num];
    const D = [...den];
    let nDeg = N.length - 1;
    const dDeg = D.length - 1;
    
    // Trim zeros
    while (nDeg >= 0 && Math.abs(N[nDeg]) < 1e-9) {
        N.pop();
        nDeg--;
    }
    
    if (dDeg < 0) return { q: [0], r: [0] };
    if (nDeg < dDeg) return { q: [0], r: N.length === 0 ? [0] : N };
    
    const Q = Array(nDeg - dDeg + 1).fill(0);
    for (let i = nDeg - dDeg; i >= 0; i--) {
        const coeff = N[i + dDeg] / D[dDeg];
        Q[i] = coeff;
        for (let j = 0; j <= dDeg; j++) {
            N[i + j] -= coeff * D[j];
        }
    }
    
    // Trim remainder
    while (N.length > 0 && Math.abs(N[N.length - 1]) < 1e-9) {
        N.pop();
    }
    return { q: Q, r: N.length === 0 ? [0] : N };
}

function formatPoly(coeffs) {
    let terms = [];
    coeffs.forEach((c, idx) => {
        if (Math.abs(c) < 1e-5) return;
        const sign = c < 0 ? "-" : (terms.length > 0 ? "+" : "");
        const absVal = Math.abs(c);
        let valStr = absVal.toFixed(3);
        valStr = valStr.replace(/\.?0+$/, ""); // clean trailing decimals
        if (valStr === "1" && idx > 0) valStr = "";
        
        let termStr = "";
        if (idx === 0) {
            termStr = valStr || "1";
        } else if (idx === 1) {
            termStr = valStr + "x";
        } else {
            termStr = valStr + `x^${idx}`;
        }
        terms.push(sign + " " + termStr);
    });
    if (terms.length === 0) return "0";
    return terms.join(" ").trim();
}

function compileQAP() {
    const m = gates.length;
    const n = witnessVector.length;
    
    if (m === 0 || n === 0) return;
    
    const points = Array(m).fill(0).map((_, i) => i + 1); // target points x = 1, 2, ... m
    
    // 1. Calculate polynomials A_i(x), B_i(x), C_i(x) for each witness variable i
    const Apols = [];
    const Bpols = [];
    const Cpols = [];
    
    for (let i = 0; i < n; i++) {
        // Extract evaluations at points
        const a_vals = r1csMatrices.A.map(row => row[i]);
        const b_vals = r1csMatrices.B.map(row => row[i]);
        const c_vals = r1csMatrices.C.map(row => row[i]);
        
        Apols.push(interpolate(points, a_vals));
        Bpols.push(interpolate(points, b_vals));
        Cpols.push(interpolate(points, c_vals));
    }
    
    // 2. Sum up linear combinations with witness values
    let Ax = [0];
    let Bx = [0];
    let Cx = [0];
    
    for (let i = 0; i < n; i++) {
        const val = witnessVector[i].val;
        Ax = polyAdd(Ax, polyScale(Apols[i], val));
        Bx = polyAdd(Bx, polyScale(Bpols[i], val));
        Cx = polyAdd(Cx, polyScale(Cpols[i], val));
    }
    
    // 3. Compute target polynomial T(x) = (x-1)(x-2)...(x-m)
    let Tx = [1];
    for (let j = 1; j <= m; j++) {
        Tx = polyMul(Tx, [-j, 1]);
    }
    
    // 4. Compute numerator Num(x) = A(x)*B(x) - C(x)
    const num = polySub(polyMul(Ax, Bx), Cx);
    
    // 5. Divide by T(x)
    const division = polyDiv(num, Tx);
    const Qx = division.q;
    const Rx = division.r;
    
    const isRemainderZero = Rx.every(c => Math.abs(c) < 1e-5);
    
    const container = document.getElementById("qap-container");
    container.innerHTML = `
        <div class="qap-poly-block"><strong>A(x)</strong>: ${formatPoly(Ax)}</div>
        <div class="qap-poly-block"><strong>B(x)</strong>: ${formatPoly(Bx)}</div>
        <div class="qap-poly-block"><strong>C(x)</strong>: ${formatPoly(Cx)}</div>
        <div class="qap-poly-block" style="border-left-color:var(--neon-purple);"><strong>T(x) target</strong>: ${formatPoly(Tx)}</div>
        <div class="qap-poly-block"><strong>H(x) quotient</strong>: ${formatPoly(Qx)}</div>
        <div class="qap-poly-block ${isRemainderZero ? 'success' : 'error'}">
            <strong>Remainder R(x)</strong>: ${formatPoly(Rx)} 
            <span style="font-size:0.65rem; display:block; margin-top:0.15rem; color:${isRemainderZero ? 'var(--neon-green)' : 'var(--neon-crimson)'};">
                ${isRemainderZero ? '✓ Divides perfectly (proof valid)' : '✗ Not divisible (proof invalid)'}
            </span>
        </div>
    `;
}

function simulateProofReceipt() {
    const isSat = gates.every(g => g.satisfied === true);
    const proofReceipt = document.getElementById("proof-receipt-container");
    if (!proofReceipt) return;
    
    if (isSat) {
        const sString = witnessVector.map(s => s.val).join('-');
        const hash = sha256_hash(sString).substring(0, 32);
        
        let keysInfo = "";
        if (isCeremonyCompleted) {
            keysInfo = `<div style="font-size:0.65rem; color:var(--neon-green); margin-top:0.2rem;">✓ Verified against ceremony SRS keys:<br><span style="text-overflow:ellipsis; overflow:hidden; display:block; max-width:350px;">VK: ${vkHash.substring(0, 24)}...</span></div>`;
        } else {
            keysInfo = `<div style="font-size:0.65rem; color:var(--neon-yellow); margin-top:0.2rem;"><i class="fas fa-exclamation-triangle"></i> Generated using default unverified keys. Run the setup ceremony above for production SRS security!</div>`;
        }
        
        proofReceipt.innerHTML = `
            <div style="background:rgba(57,255,20,0.04); border:1px dashed ${isCeremonyCompleted ? 'var(--neon-green)' : 'var(--neon-yellow)'}; border-radius:8px; padding:0.75rem; font-family:var(--font-mono); font-size:0.75rem; display:flex; flex-direction:column; gap:0.3rem;">
                <div style="color:${isCeremonyCompleted ? 'var(--neon-green)' : 'var(--neon-yellow)'}; font-weight:700;">✓ PROOF RECEIPT GENERATED</div>
                <div><strong>Proof Hash</strong>: <span style="color:var(--text-primary);">${hash}</span></div>
                <div><strong>R1CS Constraints (m)</strong>: ${gates.length}</div>
                <div><strong>Witness Signals (n)</strong>: ${witnessVector.length}</div>
                <div><strong>Algorithm</strong>: Groth16 Snark Prover</div>
                ${keysInfo}
            </div>
        `;
    } else {
        proofReceipt.innerHTML = `
            <div style="background:rgba(255,7,58,0.04); border:1px dashed var(--neon-crimson); border-radius:8px; padding:0.75rem; font-family:var(--font-mono); font-size:0.75rem; color:var(--text-secondary);">
                <div style="color:var(--neon-crimson); font-weight:700; margin-bottom:0.3rem;">✗ PROOF FAILED</div>
                Cannot generate proof because one or more constraints are violated or unresolved. Correct input values to compute matching witness values.
            </div>
        `;
    }
}

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
    });
    
    // Build links
    gates.forEach(gate => {
        gate.inputs.forEach(inId => {
            links.push({ source: inId, target: gate.id });
        });
        links.push({ source: gate.id, target: gate.output });
    });
    
    // Distribute positions
    nodes.forEach(node => {
        if (!node.isGate) {
            if (node.type === 'input' || node.type === 'constant') {
                node.x = 100 + Math.random() * 50;
            } else if (node.type === 'output') {
                node.x = canvas.width / scale - 120;
            } else {
                node.x = 280 + Math.random() * 50;
            }
        } else {
            node.x = canvas.width / (2 * scale) - 50 + Math.random() * 100;
        }
    });
}

function triggerFlowParticles(sourceId, targetId) {
    const srcNode = nodes.find(n => n.id === sourceId);
    const tgtNode = nodes.find(n => n.id === targetId);
    if (!srcNode || !tgtNode) return;
    
    const count = 10;
    for (let i = 0; i < count; i++) {
        particles.push({
            x: srcNode.x,
            y: srcNode.y,
            tx: tgtNode.x,
            ty: tgtNode.y,
            progress: -i * 0.08,
            speed: 0.04 + Math.random() * 0.02,
            color: srcNode.isGate ? '#39ff14' : '#00f2fe'
        });
    }
}

function updatePhysics() {
    const k_spring = 0.04;
    const len_link = 130;
    const k_repulsion = 1500;
    const damping = 0.82;
    
    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[j].x - nodes[i].x;
            const dy = nodes[j].y - nodes[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            
            if (dist < 200) {
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
    
    // Spring attraction
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
    
    // Bound layout
    nodes.forEach(node => {
        if (node === dragNode) return;
        
        if (!node.isGate) {
            if (node.type === 'input' || node.type === 'constant') {
                node.vx += (80 - node.x) * 0.05;
            } else if (node.type === 'output') {
                node.vx += (canvas.width / scale - 120 - node.x) * 0.05;
            }
        } else {
            node.vx += (canvas.width / (2 * scale) - node.x) * 0.01;
        }
        
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= damping;
        node.vy *= damping;
    });
}

function animationLoop() {
    updatePhysics();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);
    
    // 1. Draw connections/wires
    ctx.lineWidth = 2;
    links.forEach(link => {
        const src = nodes.find(n => n.id === link.source);
        const tgt = nodes.find(n => n.id === link.target);
        if (!src || !tgt) return;
        
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.strokeStyle = "rgba(0, 242, 254, 0.15)";
        ctx.stroke();
    });
    
    // 2. Draw live drag link preview
    if (wiringSource) {
        ctx.beginPath();
        ctx.moveTo(wiringSource.x, wiringSource.y);
        ctx.lineTo(currentMouse.x, currentMouse.y);
        ctx.strokeStyle = "rgba(255, 215, 0, 0.5)";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]); // reset
    }
    
    // 3. Draw animated flow particles
    particles.forEach((p, idx) => {
        p.progress += p.speed;
        if (p.progress >= 1.0) {
            particles.splice(idx, 1);
            return;
        }
        if (p.progress < 0) return;
        
        const px = p.x + (p.tx - p.x) * p.progress;
        const py = p.y + (p.ty - p.y) * p.progress;
        
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0;
    });
    
    // 3.1 Draw toxic waste ceremony particles
    toxicParticles.forEach((tp, idx) => {
        tp.x += tp.vx;
        tp.y += tp.vy;
        tp.life -= tp.decay;
        if (tp.life <= 0) {
            toxicParticles.splice(idx, 1);
            return;
        }
        
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, tp.size * tp.life, 0, Math.PI * 2);
        ctx.fillStyle = tp.color;
        ctx.shadowBlur = 12 * tp.life;
        ctx.shadowColor = tp.color;
        ctx.fill();
        ctx.shadowBlur = 0;
    });
    
    // 4. Draw nodes
    nodes.forEach(node => {
        ctx.save();
        ctx.translate(node.x, node.y);
        
        if (node.isGate) {
            const size = 42;
            const satisfiedColor = node.satisfied === true ? '#39ff14' : (node.satisfied === false ? '#ff073a' : 'rgba(255, 255, 255, 0.2)');
            
            ctx.shadowBlur = 8;
            ctx.shadowColor = satisfiedColor;
            ctx.fillStyle = "rgba(10, 14, 23, 0.95)";
            ctx.strokeStyle = satisfiedColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.rect(-size/2, -size/2, size, size);
            ctx.fill();
            ctx.stroke();
            
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#f0f4f8';
            ctx.font = "bold 12px 'Fira Code', monospace";
            ctx.fillText(node.name, -ctx.measureText(node.name).width/2, 4);
        } else {
            const radius = 22;
            const sigColor = node.type === 'input' ? '#00f2fe' : (node.type === 'output' ? '#39ff14' : '#bd00ff');
            
            ctx.shadowBlur = 8;
            ctx.shadowColor = sigColor;
            ctx.fillStyle = "rgba(10, 14, 23, 0.95)";
            ctx.strokeStyle = sigColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            ctx.shadowBlur = 0;
            ctx.fillStyle = sigColor;
            ctx.font = "bold 11px 'Fira Code', monospace";
            const valStr = node.value !== undefined ? node.value.toString() : '?';
            ctx.fillText(valStr, -ctx.measureText(valStr).width/2, 4);
            
            ctx.fillStyle = '#94a3b8';
            ctx.font = "10px 'Outfit', sans-serif";
            ctx.fillText(node.name, -ctx.measureText(node.name).width/2, radius + 14);
        }
        ctx.restore();
    });
    
    ctx.restore();
    requestAnimationFrame(animationLoop);
}

// ----------------------------------------------------
// CANVAS INTERACTION & DRAG-WIRING
// ----------------------------------------------------
function setupCanvasListeners() {
    // Double click to open modal
    canvas.addEventListener("dblclick", e => {
        const mouse = getRelativeMousePos(e);
        addNodeCoords = { x: mouse.x, y: mouse.y };
        
        // Open modal
        document.getElementById("node-name").value = "";
        document.getElementById("add-node-modal").classList.add("active");
        toggleModalFields();
    });
    
    canvas.addEventListener("mousedown", e => {
        initAudio();
        const mouse = getRelativeMousePos(e);
        
        // Find clicked node
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
            if (e.shiftKey) {
                // Start drag-wiring mode
                wiringSource = clickedNode;
                currentMouse = { x: clickedNode.x, y: clickedNode.y };
            } else {
                dragNode = clickedNode;
            }
        } else {
            isPanning = true;
            startPan = { x: e.clientX - offset.x, y: e.clientY - offset.y };
        }
    });
    
    canvas.addEventListener("mousemove", e => {
        const mouse = getRelativeMousePos(e);
        currentMouse = mouse;
        
        if (dragNode) {
            dragNode.x = mouse.x;
            dragNode.y = mouse.y;
            dragNode.vx = 0;
            dragNode.vy = 0;
        } else if (isPanning) {
            offset.x = e.clientX - startPan.x;
            offset.y = e.clientY - startPan.y;
        }
    });
    
    canvas.addEventListener("mouseup", e => {
        if (wiringSource) {
            const mouse = getRelativeMousePos(e);
            
            // Check if dropped over another node
            let targetNode = null;
            for (let i = nodes.length - 1; i >= 0; i--) {
                const n = nodes[i];
                const dx = mouse.x - n.x;
                const dy = mouse.y - n.y;
                const radius = n.isGate ? 22 : 25;
                if (dx*dx + dy*dy < radius*radius) {
                    targetNode = n;
                    break;
                }
            }
            
            if (targetNode && targetNode.id !== wiringSource.id) {
                // Establish connection
                linkNodes(wiringSource, targetNode);
            }
            wiringSource = null;
        }
        dragNode = null;
        isPanning = false;
    });
    
    canvas.addEventListener("mouseleave", () => {
        dragNode = null;
        isPanning = false;
        wiringSource = null;
    });
    
    canvas.addEventListener("wheel", e => {
        e.preventDefault();
        const newScale = e.deltaY < 0 ? scale * 1.1 : scale / 1.1;
        if (newScale >= 0.4 && newScale <= 3.0) {
            scale = newScale;
        }
    });
}

function getRelativeMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset.x) / scale;
    const y = (e.clientY - rect.top - offset.y) / scale;
    return { x, y };
}

// GUI Linker helper
function linkNodes(src, tgt) {
    // 1. If Signal -> Gate input
    if (!src.isGate && tgt.isGate) {
        const gate = gates.find(g => g.id === tgt.id);
        if (gate && !gate.inputs.includes(src.id)) {
            gate.inputs.push(src.id);
            gate.expr = gate.inputs.join(gate.type === 'add' ? ' + ' : ' * ');
            log(`Wired signal ${src.id} as input to Gate ${tgt.id.toUpperCase()}`, "info");
        }
    }
    // 2. If Gate -> Signal output
    else if (src.isGate && !tgt.isGate) {
        const gate = gates.find(g => g.id === src.id);
        if (gate) {
            gate.output = tgt.id;
            log(`Wired Gate ${src.id.toUpperCase()} output to signal ${tgt.id}`, "info");
        }
    }
    
    solveWitness();
    compileAndProve();
    buildTopologyGraph();
}

// Modal Form toggler
function toggleModalFields() {
    const cat = document.getElementById("node-category").value;
    if (cat === 'signal') {
        document.getElementById("modal-signal-fields").style.display = "block";
        document.getElementById("modal-gate-fields").style.display = "none";
    } else {
        document.getElementById("modal-signal-fields").style.display = "none";
        document.getElementById("modal-gate-fields").style.display = "block";
    }
}

// Add Node Handler from Modal Form
function saveNodeFromModal() {
    const cat = document.getElementById("node-category").value;
    const name = document.getElementById("node-name").value.trim().replace(/\s+/g, '_');
    
    if (!name) {
        alert("Please specify a valid node identifier name.");
        return;
    }
    
    // Check duplication
    if (signals.find(s => s.id === name) || gates.find(g => g.id === name)) {
        alert("Node identifier already exists. Specify a unique name.");
        return;
    }
    
    if (cat === 'signal') {
        const type = document.getElementById("signal-type").value;
        signals.push({
            id: name,
            name: name,
            type: type,
            val: type === 'input' ? 5 : (type === 'constant' ? 1 : 0)
        });
        log(`Created new signal: ${name} (${type})`, "info");
    } else {
        const gateType = document.getElementById("gate-type").value;
        gates.push({
            id: name,
            type: gateType,
            inputs: [],
            output: "",
            expr: "undefined"
        });
        log(`Created new constraint gate: ${name.toUpperCase()} (${gateType})`, "info");
    }
    
    // Hide modal
    document.getElementById("add-node-modal").classList.remove("active");
    
    renderSignalsPanel();
    buildTopologyGraph();
    solveWitness();
    compileAndProve();
    
    // Place new node near click coordinate
    const newNode = nodes.find(n => n.id === name);
    if (newNode) {
        newNode.x = addNodeCoords.x;
        newNode.y = addNodeCoords.y;
    }
}

// ----------------------------------------------------
// POWERS-OF-TAU SETUP CEREMONY SIMULATION
// ----------------------------------------------------
function runSetupCeremony() {
    initAudio();
    const entropyInput = document.getElementById("setup-entropy");
    const seed = (entropyInput ? entropyInput.value.trim() : "") || "0x" + Math.random().toString(16).substring(2, 10);
    
    log(`Initiating Powers-of-Tau Setup Ceremony with seed: ${seed}`, "info");
    playSoundChime('proof');
    
    // Reset ceremony status
    isCeremonyCompleted = false;
    document.getElementById("pk-hash").innerText = "Computing...";
    document.getElementById("vk-hash").innerText = "Computing...";
    
    const statusBar = document.getElementById("ceremony-status-bar");
    const progressEl = document.getElementById("ceremony-progress");
    
    if (statusBar && progressEl) {
        statusBar.style.display = "block";
        progressEl.style.width = "0%";
    }
    
    let progress = 0;
    const interval = setInterval(() => {
        progress += 5;
        if (progressEl) {
            progressEl.style.width = `${progress}%`;
        }
        
        // Visual toxic waste particles decay animation on canvas
        if (progress % 10 === 0 && canvas) {
            // Spawn some floating green/purple particles
            for (let i = 0; i < 6; i++) {
                toxicParticles.push({
                    x: Math.random() * (canvas.width / scale),
                    y: Math.random() * (canvas.height / scale),
                    vx: (Math.random() - 0.5) * 6,
                    vy: (Math.random() - 0.5) * 6,
                    size: 3 + Math.random() * 6,
                    life: 1.0,
                    decay: 0.015 + Math.random() * 0.02,
                    color: Math.random() > 0.5 ? '#bd00ff' : '#39ff14'
                });
            }
        }
        
        if (progress === 20) log("Phase 1: Generating powers of tau Lagrange parameters...", "info");
        if (progress === 40) log("Phase 2: Contributions submitted. Evaluating polynomial mappings...", "info");
        if (progress === 60) log("Phase 3: Computing random beacon delta scaling...", "info");
        if (progress === 80) log("Phase 4: Establishing Structured Reference String (SRS) keys...", "info");
        
        if (progress >= 100) {
            clearInterval(interval);
            
            // Compute hashes
            pkHash = "PK_" + sha256_hash(seed + "_proving_key").substring(0, 36) + "_G1";
            vkHash = "VK_" + sha256_hash(seed + "_verifying_key").substring(0, 36) + "_G2";
            
            document.getElementById("pk-hash").innerText = pkHash;
            document.getElementById("vk-hash").innerText = vkHash;
            
            isCeremonyCompleted = true;
            log("Ceremony complete! Structured Reference String keys generated. Toxic waste parameters discarded successfully.", "success");
            playSoundChime('success');
            
            // Flash canvas with clean particle burst
            for (let i = 0; i < 30; i++) {
                toxicParticles.push({
                    x: (canvas.width / (2 * scale)),
                    y: (canvas.height / (2 * scale)),
                    vx: (Math.random() - 0.5) * 12,
                    vy: (Math.random() - 0.5) * 12,
                    size: 4 + Math.random() * 8,
                    life: 1.0,
                    decay: 0.02 + Math.random() * 0.02,
                    color: '#00f2fe'
                });
            }
            
            setTimeout(() => {
                if (statusBar) statusBar.style.display = "none";
            }, 800);
            
            compileAndProve();
        }
    }, 80);
}

// ----------------------------------------------------
// CIRCOM STATIC ANALYSIS & DIAGNOSTICS WARNINGS
// ----------------------------------------------------
function runCircomDiagnostics(code) {
    const warnings = [];
    
    // 1. Scan for unlinked or unused signals
    signals.forEach(sig => {
        if (sig.type === 'constant') return;
        
        // Find if this signal is either an input to any gate or an output of any gate
        const isUsedAsInput = gates.some(g => g.inputs.includes(sig.id));
        const isUsedAsOutput = gates.some(g => g.output === sig.id);
        
        if (!isUsedAsInput && !isUsedAsOutput) {
            warnings.push(`Dangling signal: <code>${sig.name}</code> is declared but not connected to any gates.`);
        }
    });
    
    // 2. Scan raw editor code for non-quadratic multiplication constraints
    const codeLines = code.split('\n');
    codeLines.forEach((line, idx) => {
        // Strip comment
        const cleanLine = line.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '').trim();
        if (cleanLine.includes('<==') || cleanLine.includes('===')) {
            // Count '*' operators on the right hand side
            const parts = cleanLine.split(/<==|===/);
            if (parts[1]) {
                const starCount = (parts[1].match(/\*/g) || []).length;
                if (starCount > 1) {
                    warnings.push(`Line ${idx+1}: Non-quadratic constraint warning. Circom only permits degree <= 2 constraints (single multiplication like <code>A * B</code>). Decompose <code>${parts[1].trim()}</code> into intermediate gates.`);
                }
            }
        }
    });
    
    // 3. Render in UI
    const diagnosticsBox = document.getElementById("compiler-diagnostics");
    const listContainer = document.getElementById("diagnostics-list");
    if (diagnosticsBox && listContainer) {
        if (warnings.length > 0) {
            listContainer.innerHTML = warnings.map(w => `<li>${w}</li>`).join('');
            diagnosticsBox.style.display = "block";
        } else {
            diagnosticsBox.style.display = "none";
        }
    }
}

// ----------------------------------------------------
// EXPORTING MECHANICS (JSON, PNG, RECEIPT)
// ----------------------------------------------------
function exportWitness() {
    if (witnessVector.length === 0) {
        alert("Witness vector is empty. Solve the witness first.");
        return;
    }
    const data = witnessVector.map(s => ({ signal: s.name, type: s.type, value: s.val }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zk_nexus_witness.json";
    a.click();
    URL.revokeObjectURL(url);
    log("Witness vector exported successfully as JSON.", "success");
}

// Export R1CS Matrices
function exportR1CS() {
    if (r1csMatrices.A.length === 0) {
        alert("R1CS matrices are empty. Compile the circuit first.");
        return;
    }
    const data = {
        witness_signals: witnessVector.map(s => s.name),
        matrix_A: r1csMatrices.A,
        matrix_B: r1csMatrices.B,
        matrix_C: r1csMatrices.C,
        constraints_count: gates.length
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zk_nexus_r1cs.json";
    a.click();
    URL.revokeObjectURL(url);
    log("R1CS matrices and signal maps exported successfully as JSON.", "success");
}

// Export Canvas Topology Blueprint
function exportCanvas() {
    if (!canvas) return;
    try {
        const url = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = "zk_nexus_circuit_blueprint.png";
        a.click();
        log("Canvas circuit topology blueprint exported as PNG.", "success");
    } catch(e) {
        console.error("Canvas export failed: ", e);
        alert("Canvas security sandbox error: cannot export image locally.");
    }
}

// ----------------------------------------------------
// ONBOARDING TOUR NAVIGATION HELPERS
// ----------------------------------------------------
function openTour() {
    currentTourStep = 0;
    const modal = document.getElementById("help-tour-modal");
    if (modal) {
        modal.classList.add("active");
        renderTourSlide();
    }
}

function closeTour() {
    const modal = document.getElementById("help-tour-modal");
    if (modal) {
        modal.classList.remove("active");
    }
}

function renderTourSlide() {
    const slide = tourSlides[currentTourStep];
    const container = document.getElementById("tour-content");
    if (container) {
        container.innerHTML = `
            <h4 style="color:var(--neon-cyan); font-size:1.15rem; font-weight:700; margin-bottom:0.5rem; display:flex; align-items:center; gap:0.4rem;">
                ${slide.title}
            </h4>
            <div style="font-size:0.85rem; line-height:1.5; color:var(--text-primary);">
                ${slide.content}
            </div>
        `;
    }
    
    // Render Dots
    const dotsContainer = document.getElementById("tour-dots");
    if (dotsContainer) {
        dotsContainer.innerHTML = tourSlides.map((_, idx) => `
            <div class="tour-dot ${idx === currentTourStep ? 'active' : ''}" onclick="goToTourStep(${idx})"></div>
        `).join('');
    }
    
    // Enable/Disable Back button
    const prevBtn = document.getElementById("btn-tour-prev");
    if (prevBtn) {
        prevBtn.disabled = currentTourStep === 0;
        prevBtn.style.opacity = currentTourStep === 0 ? "0.3" : "1";
    }
    
    // Next Button text
    const nextBtn = document.getElementById("btn-tour-next");
    if (nextBtn) {
        if (currentTourStep === tourSlides.length - 1) {
            nextBtn.innerHTML = `Finish <i class="fas fa-check"></i>`;
        } else {
            nextBtn.innerHTML = `Next <i class="fas fa-arrow-right"></i>`;
        }
    }
}

function goToTourStep(step) {
    currentTourStep = step;
    renderTourSlide();
}

function nextTourStep() {
    if (currentTourStep < tourSlides.length - 1) {
        currentTourStep++;
        renderTourSlide();
        playSoundChime('success');
    } else {
        closeTour();
        log("ZK-Nexus Proving Guide completed.", "info");
    }
}

function prevTourStep() {
    if (currentTourStep > 0) {
        currentTourStep--;
        renderTourSlide();
        playSoundChime('success');
    }
}

