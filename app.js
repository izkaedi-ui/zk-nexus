/* ZK-Nexus JavaScript Core Orchestrator - State & Module Registry Bootstrapper */

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
let toxicParticles = [];

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

// ----------------------------------------------------
// REGISTRIES & CONTROLLERS
// ----------------------------------------------------
const ZKRegistry = {
    connectors: {},
    bridges: {},
    activators: {},
    listeners: {},
    
    registerConnector(name, fn) {
        this.connectors[name] = fn;
        window[name] = fn; // preserve global binding for inline HTML event callbacks
    },
    registerBridge(name, fn) {
        this.bridges[name] = fn;
        window[name] = fn;
    },
    registerActivator(name, fn) {
        this.activators[name] = fn;
        window[name] = fn;
    },
    registerListener(name, fn) {
        this.listeners[name] = fn;
        window[name] = fn;
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

// Circom Code Syntax Highlighter
function updateSyntaxHighlighting() {
    const editor = document.getElementById("circom-editor");
    const highlight = document.getElementById("editor-highlight");
    if (!editor || !highlight) return;
    
    let text = editor.value;
    text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    const comments = [];
    text = text.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, (match) => {
        comments.push(match);
        return `__COMMENT_TOKEN_${comments.length - 1}__`;
    });
    
    text = text.replace(/\b(template|component|main|function|return|if|else|for)\b/g, '<span class="hl-keyword">$1</span>');
    text = text.replace(/\b(signal|input|output|local)\b/g, '<span class="hl-type">$1</span>');
    text = text.replace(/\b(\d+)\b/g, '<span class="hl-number">$1</span>');
    text = text.replace(/(&lt;==|===|===&gt;|\+|-|\*|\/|=)/g, '<span class="hl-operator">$1</span>');
    
    text = text.replace(/__COMMENT_TOKEN_(\d+)__/g, (match, idx) => {
        return `<span class="hl-comment">${comments[parseInt(idx)]}</span>`;
    });
    
    highlight.innerHTML = text + "\n";
}

// Bootstrapper initialization
window.addEventListener("DOMContentLoaded", () => {
    canvas = document.getElementById("circuit-canvas");
    ctx = canvas.getContext("2d");
    
    document.getElementById("circom-editor").value = DEFAULT_CIRCOM_CODE;
    
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    
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
    
    document.getElementById("btn-prove").addEventListener("click", () => {
        compileAndProve();
        playSoundChime('proof');
    });
    document.getElementById("btn-zoom-in").addEventListener("click", () => { scale = Math.min(scale * 1.2, 3.0); });
    document.getElementById("btn-zoom-out").addEventListener("click", () => { scale = Math.max(scale / 1.2, 0.4); });
    document.getElementById("btn-reset").addEventListener("click", () => { offset = { x: 0, y: 0 }; scale = 1.0; });
    
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

    document.getElementById("btn-compile-circom").addEventListener("click", () => {
        const code = document.getElementById("circom-editor").value;
        compileCircom(code);
    });

    document.getElementById("btn-run-ceremony").addEventListener("click", () => {
        runSetupCeremony();
    });

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

    document.getElementById("btn-export-witness").addEventListener("click", () => {
        exportWitness();
    });
    document.getElementById("btn-export-r1cs").addEventListener("click", () => {
        exportR1CS();
    });
    document.getElementById("btn-export-canvas").addEventListener("click", () => {
        exportCanvas();
    });
    
    const volSlider = document.getElementById("slider-volume");
    if (volSlider) {
        volSlider.addEventListener("input", () => {
            initAudio();
            updateDroneVolume();
        });
    }

    const circomEditor = document.getElementById("circom-editor");
    const editorHighlight = document.getElementById("editor-highlight");
    if (circomEditor && editorHighlight) {
        circomEditor.addEventListener("input", updateSyntaxHighlighting);
        circomEditor.addEventListener("scroll", () => {
            editorHighlight.scrollTop = circomEditor.scrollTop;
            editorHighlight.scrollLeft = circomEditor.scrollLeft;
        });
    }
    
    document.getElementById("btn-close-modal").addEventListener("click", () => {
        document.getElementById("add-node-modal").classList.remove("active");
    });
    document.getElementById("btn-save-node").addEventListener("click", saveNodeFromModal);
    
    setupCanvasListeners();
    loadPreset("multiplier");
    requestAnimationFrame(animationLoop);
});

function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
}
