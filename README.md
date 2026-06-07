# ZK-Nexus 🌌

**Interactive ZK-SNARK Constraint Compiler & Witness Flow Simulator**

ZK-Nexus is a visual, standalone web application that compiles arithmetic circuits into **Quadratic Arithmetic Programs (QAP)** using **Rank-1 Constraint Systems (R1CS)**, solves the corresponding witness parameters, and simulates the ZK proof verification loop in real-time.

Designed for systems programmers and zero-knowledge cryptography researchers, this tool provides a clear, interactive visual bridge between writing circuits (similar to SnarkyJS or Circom) and their underlying matrix representations ($A, B, C$).

---

## Features

1. **Interactive Signal Control**: Modify input signal parameters in real-time to watch how values propagate through the circuit.
2. **Dynamic Witness Solver**: Resolves local/intermediate variables iteratively. If constraints fail, unsatisfied gates turn glowing crimson; if resolved, they illuminate green.
3. **R1CS Matrix Compiler**: Compiles the circuit equations into formal coefficient matrices $A$, $B$, and $C$, yielding the vector evaluation system:
   $$(A \cdot s) \circ (B \cdot s) = C \cdot s$$
   where $s$ is the compiled witness vector and $\circ$ is the Hadamard (entry-wise) product.
4. **Live Witness Vector ($s$) Inspector**: Watch $s = [1, x_1, x_2, \dots, y_1, \dots]$ update instantly.
5. **Interactive Preset Sandboxes**:
   - **Factorization Prover**: Prove knowledge of the factors $x, y$ of a public product $p$ ($x \cdot y = p$) without revealing $x$ and $y$.
   - **Quadratic Solver**: Prove knowledge of a secret solution $x$ for the equation $x^2 + 5 = 14$ using intermediate constraint gates.
   - **3-Bit Range Proof**: Decomposes a secret value into 3 bits ($b_0, b_1, b_2$) and enforces boolean checks ($b \cdot (b - 1) = 0$) to prove the number is within $[0, 7]$.
6. **WebGL/Canvas 2D Particle-Physics Engine**: Simulates particle flows along circuit links during witness evaluation, with smooth pan, zoom, and node dragging.
7. **Powers-of-Tau Setup Ceremony**: Run simulated structured reference key generation ceremonies with custom seeds and visual toxic waste decay particle animations.
8. **Continuous Ambient Synth Drone**: Synthesizes custom sawtooth/triangle wave pad chords in real-time, transitioning from dissonant minor to harmonic major depending on witness satisfaction.
9. **Interactive Matrix Heatmaps**: Inspect hoverable visual grids of R1CS matrices $A, B,$ and $C$, with instant card highlighting for signals.
10. **Static Code Diagnostics Warning Analyzer**: Reports unused signals or non-quadratic compiler warnings (degree > 2) directly inside the editor sidebar.
11. **Comprehensive Export controls**: Package and download Witness vectors (JSON), R1CS matrices (JSON), or canvas blueprint layouts (PNG).

---

## The Mathematics of R1CS

A **Rank-1 Constraint System (R1CS)** is a sequence of constraints of the form:
$$(a_i \cdot s) \times (b_i \cdot s) = c_i \cdot s$$

Where:
- $s$ is the **witness vector** containing all signals in the system. The first element of $s$ is always the constant $1$.
- $a_i, b_i, c_i$ are the coefficient vectors representing the linear combination of inputs to the left, right, and output of the $i$-th gate.

### Example: Multiplier Gate
For a constraint gate representing $x \times y = z$, with a witness vector $s = [1, x, y, z]$:
- $a_i = [0, 1, 0, 0]$ (selects $x$)
- $b_i = [0, 0, 1, 0]$ (selects $y$)
- $c_i = [0, 0, 0, 1]$ (selects $z$)

$$(1 \cdot x) \times (1 \cdot y) = (1 \cdot z) \implies x \times y = z$$

### Example: Adder Gate
For an addition gate representing $x + y = z$, we must rewrite it as a quadratic constraint by multiplying by the constant $1$:
$$(x + y) \times 1 = z$$

Using witness vector $s = [1, x, y, z]$:
- $a_i = [0, 1, 1, 0]$ (selects $x + y$)
- $b_i = [1, 0, 0, 0]$ (selects constant $1$)
- $c_i = [0, 0, 0, 1]$ (selects $z$)

$$(x + y) \times 1 = z \implies x + y = z$$

---

## File Structure

```text
zk_nexus/
├── index.html   # Main Dashboard Structure & Semantic SEO
├── style.css    # Cyberpunk design system & visual tokens
├── app.js       # Witness propagation solver & R1CS compiler
└── README.md    # Circuit math documentation (this file)
```

---

## Instructions to Push to GitHub

You can publish this standalone project as a new repository on GitHub:

1. **Initialize git local repository**:
   ```bash
   cd H:/agents/zk_nexus
   git init
   ```

2. **Stage and commit the files**:
   ```bash
   git add .
   git commit -m "feat: initialize ZK-Nexus interactive circuit builder and simulator"
   ```

3. **Create a new repository on GitHub** (e.g. `zk-nexus`) and add it as remote:
   ```bash
   git remote add origin https://github.com/<your-username>/zk-nexus.git
   git branch -M main
   ```

4. **Push to GitHub**:
   ```bash
   git push -u origin main
   ```

---

## Running Locally

Since this app is built with pure, optimized Vanilla HTML/CSS/JS without external package dependencies, you can run it instantly:
- Simply double-click `index.html` to open it in any modern web browser.
- Alternatively, launch a local server:
  ```bash
  python -m http.server 8080
  ```
  Then navigate to `http://localhost:8080`.
