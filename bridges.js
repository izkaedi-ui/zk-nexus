/* ZK-Nexus Bridges Module - Compilation, Solver, & WebAudio Synths */

(function() {
    function initAudio() {
        if (audioCtx) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        log("WebAudio Context initialized.", "info");
        initDrone();
    }

    let analyserNode = null;
    let delayNode = null;
    let delayFeedback = null;

    function initDrone() {
        if (!audioCtx || droneGain) return;
        try {
            analyserNode = audioCtx.createAnalyser();
            analyserNode.fftSize = 128;
            
            droneFilter = audioCtx.createBiquadFilter();
            droneFilter.type = "lowpass";
            droneFilter.frequency.setValueAtTime(280, audioCtx.currentTime);
            
            delayNode = audioCtx.createDelay(1.0);
            delayNode.delayTime.setValueAtTime(0.4, audioCtx.currentTime);
            
            delayFeedback = audioCtx.createGain();
            delayFeedback.gain.setValueAtTime(0.45, audioCtx.currentTime);
            
            delayNode.connect(delayFeedback);
            delayFeedback.connect(delayNode);
            
            droneGain = audioCtx.createGain();
            const volumeSlider = document.getElementById("slider-volume");
            const baseVol = volumeSlider ? (parseFloat(volumeSlider.value) / 100) * 0.05 : 0.015;
            droneGain.gain.setValueAtTime(isMuted ? 0 : baseVol, audioCtx.currentTime);
            
            droneFilter.connect(analyserNode);
            droneFilter.connect(delayNode);
            
            delayNode.connect(analyserNode);
            analyserNode.connect(droneGain);
            droneGain.connect(audioCtx.destination);
            
            const basePitches = [65.41, 98.00, 130.81, 164.81];
            for (let i = 0; i < 4; i++) {
                const osc = audioCtx.createOscillator();
                osc.type = i % 2 === 0 ? "sawtooth" : "triangle";
                osc.frequency.setValueAtTime(basePitches[i] + (Math.random() - 0.5) * 0.4, audioCtx.currentTime);
                osc.connect(droneFilter);
                osc.start(0);
                droneOscs.push(osc);
            }
            log("Continuous ambient modular drone synth activated with echo delay.", "info");
            
            const waveCanvas = document.getElementById("audio-waveform");
            if (waveCanvas) {
                waveCanvas.style.display = "block";
                startWaveformAnimation();
            }
        } catch(e) {
            console.error("Audio drone error: ", e);
        }
    }

    function updateDroneChords(satisfied) {
        if (!audioCtx || droneOscs.length === 0) return;
        const now = audioCtx.currentTime;
        
        const majorPitches = [65.41, 98.00, 130.81, 164.81];
        const minorPitches = [65.41, 92.50, 116.54, 155.56];
        
        const targetPitches = satisfied ? majorPitches : minorPitches;
        
        droneOscs.forEach((osc, idx) => {
            osc.frequency.exponentialRampToValueAtTime(targetPitches[idx] + (Math.random() - 0.5) * 0.3, now + 0.8);
        });
        
        if (droneFilter) {
            const targetFreq = satisfied ? 380 : 200;
            droneFilter.frequency.exponentialRampToValueAtTime(targetFreq, now + 0.8);
        }
    }

    function updateDroneVolume() {
        if (droneGain && audioCtx) {
            const volumeSlider = document.getElementById("slider-volume");
            const sliderVal = volumeSlider ? parseFloat(volumeSlider.value) : 30;
            
            const baseVol = (sliderVal / 100) * 0.05;
            const targetVol = isMuted ? 0 : baseVol;
            droneGain.gain.linearRampToValueAtTime(targetVol, audioCtx.currentTime + 0.1);
        }
    }

    function startWaveformAnimation() {
        const waveCanvas = document.getElementById("audio-waveform");
        if (!waveCanvas) return;
        const wCtx = waveCanvas.getContext("2d");
        
        function drawWave() {
            if (!analyserNode) return;
            requestAnimationFrame(drawWave);
            
            const bufferLength = analyserNode.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            
            if (isMuted) {
                wCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
                wCtx.beginPath();
                wCtx.moveTo(0, waveCanvas.height / 2);
                wCtx.lineTo(waveCanvas.width, waveCanvas.height / 2);
                wCtx.strokeStyle = "rgba(0, 242, 254, 0.2)";
                wCtx.lineWidth = 1.5;
                wCtx.stroke();
                return;
            }
            
            analyserNode.getByteTimeDomainData(dataArray);
            wCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
            wCtx.lineWidth = 1.5;
            wCtx.strokeStyle = "var(--neon-cyan)";
            wCtx.shadowBlur = 4;
            wCtx.shadowColor = "var(--neon-cyan)";
            wCtx.beginPath();
            
            const sliceWidth = waveCanvas.width / bufferLength;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = (v * waveCanvas.height) / 2;
                
                if (i === 0) {
                    wCtx.moveTo(x, y);
                } else {
                    wCtx.lineTo(x, y);
                }
                x += sliceWidth;
            }
            
            wCtx.lineTo(waveCanvas.width, waveCanvas.height / 2);
            wCtx.stroke();
            wCtx.shadowBlur = 0;
        }
        
        drawWave();
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

    function solveWitness() {
        log("Solving constraint witness...", "info");
        
        gates.forEach(g => g.satisfied = null);
        
        let progress = true;
        let iterations = 0;
        const maxIterations = 20;
        let playSound = false;
        
        while (progress && iterations < maxIterations) {
            progress = false;
            iterations++;
            
            gates.forEach(gate => {
                if (gate.satisfied !== null) return;
                
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
                            if (outSig.type === 'local' || outSig.type === 'output') {
                                outSig.val = outVal;
                                isSat = true;
                            }
                            break;
                        case "add":
                            if (gate.expr && gate.expr.includes('-')) {
                                outVal = valA - valB;
                            } else {
                                outVal = valA + valB;
                            }
                            isSat = Math.abs(outSig.val - outVal) < 1e-9;
                            if (outSig.type === 'local' || outSig.type === 'output') {
                                outSig.val = outVal;
                                isSat = true;
                            }
                            break;
                        case "bool":
                            outVal = valA * (valA - 1);
                            isSat = Math.abs(outSig.val - outVal) < 1e-9;
                            if (outSig.type === 'local' || outSig.type === 'output') {
                                outSig.val = outVal;
                                isSat = true;
                            }
                            break;
                        case "scale2":
                            outVal = 2.0 * valA;
                            isSat = Math.abs(outSig.val - outVal) < 1e-9;
                            if (outSig.type === 'local' || outSig.type === 'output') {
                                outSig.val = outVal;
                                isSat = true;
                            }
                            break;
                        case "scale4":
                            outVal = 4.0 * valA;
                            isSat = Math.abs(outSig.val - outVal) < 1e-9;
                            if (outSig.type === 'local' || outSig.type === 'output') {
                                outSig.val = outVal;
                                isSat = true;
                            }
                            break;
                    }
                    
                    gate.inputs.forEach(inId => triggerFlowParticles(inId, gate.id));
                    setTimeout(() => triggerFlowParticles(gate.id, gate.output), 150);
                    
                    if (gate.satisfied !== isSat) {
                        playSound = true;
                    }
                    gate.satisfied = isSat;
                    progress = true;
                    
                    const sigInputEl = document.querySelector(`#sig-card-${outSig.id} .signal-val-input`);
                    if (sigInputEl && (outSig.type === 'local' || outSig.type === 'output')) {
                        sigInputEl.value = outSig.val.toFixed(2);
                    }
                }
            });
        }
        
        const totalGates = gates.length;
        const satisfiedGates = gates.filter(g => g.satisfied === true).length;
        const satisfied = satisfiedGates === totalGates;
        
        renderSignalsPanel();
        updateConstraintsPanel();
        updateNodeVisualValues();
        
        updateDroneChords(satisfied);
        
        if (satisfied) {
            log(`Witness converged: ${satisfiedGates}/${totalGates} constraints satisfied!`, "success");
            if (playSound) playSoundChime('success');
        } else {
            log(`Witness error: ${totalGates - satisfiedGates} constraints violated or unsolved!`, "error");
            if (playSound) playSoundChime('failure');
        }
    }

    function compileCircom(code) {
        log("Compiling Circom code snippet...", "info");
        runCircomDiagnostics(code);
        
        code = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        const lines = code.split(/[\n;{}]/);
        const newSignals = [
            { id: "one", name: "one", type: "constant", val: 1 }
        ];
        const newGates = [];
        let gateIdCounter = 0;
        
        lines.forEach(line => {
            line = line.trim();
            if (!line) return;
            
            const sigMatch = line.match(/signal\s+(input|output|local)?\s*([a-zA-Z0-9_]+)/);
            if (sigMatch) {
                const type = sigMatch[1] || 'local';
                const name = sigMatch[2];
                if (!newSignals.find(s => s.id === name)) {
                    newSignals.push({
                        id: name,
                        name: name,
                        type: type,
                        val: type === 'input' ? 5 : (type === 'constant' ? 1 : 0)
                    });
                }
                return;
            }
            
            let exprMatch = line.match(/([a-zA-Z0-9_]+)\s*(<==|===|===>)\s*(.+)/);
            if (exprMatch) {
                const outName = exprMatch[1].trim();
                const rightExpr = exprMatch[3].trim();
                
                const addSigIfMissing = (name) => {
                    if (!newSignals.find(s => s.id === name) && isNaN(name)) {
                        newSignals.push({ id: name, name: name, type: "local", val: 0 });
                    }
                };
                
                addSigIfMissing(outName);
                
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

    function compileAndProve() {
        solveWitness();
        
        log("Compiling Circuit to R1CS matrices...", "info");
        
        const oneSig = signals.filter(s => s.type === 'constant' && s.name === 'one');
        const inputSigs = signals.filter(s => s.type === 'input');
        const outputSigs = signals.filter(s => s.type === 'output');
        const localSigs = signals.filter(s => s.type === 'local' || (s.type === 'constant' && s.name !== 'one'));
        
        witnessVector = [...oneSig, ...inputSigs, ...outputSigs, ...localSigs];
        
        const vectorContainer = document.getElementById("witness-vector-container");
        if (vectorContainer) {
            vectorContainer.innerHTML = `
                <div style="display:flex; flex-wrap:wrap; gap:0.4rem; font-family:var(--font-mono); font-size:0.75rem;">
                    s = [
                    ${witnessVector.map(s => `<span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-primary); border-color:rgba(255,255,255,0.1)">${s.name}: ${s.val}</span>`).join(', ')}
                    ]
                </div>
            `;
        }
        
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
                            r1csMatrices.A[rowIdx][inIdxB] = -1;
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
        compileQAP();
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
                                             onmouseleave="clearHeatmapTooltip()"
                                             onclick="editMatrixCell(this)">${val !== 0 ? val : "0"}</div>
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
        
        document.querySelectorAll(".signal-card").forEach(card => {
            card.style.borderColor = "";
            card.style.background = "";
        });
    }

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

    // subtract p2 from p1
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

    // polynomial division num / den
    function polyDiv(num, den) {
        const N = [...num];
        const D = [...den];
        let nDeg = N.length - 1;
        const dDeg = D.length - 1;
        
        while (nDeg >= 0 && Math.abs(N[nDeg]) < 1e-9) {
            N.pop();
            nDeg--;
        }
        
        // Fortify: prevent division-by-zero or division by empty denominator
        if (dDeg < 0 || D.every(c => Math.abs(c) < 1e-9)) {
            return { q: [0], r: N.length === 0 ? [0] : N };
        }
        
        if (nDeg < dDeg) return { q: [0], r: N.length === 0 ? [0] : N };
        
        const Q = Array(nDeg - dDeg + 1).fill(0);
        for (let i = nDeg - dDeg; i >= 0; i--) {
            const coeff = N[i + dDeg] / D[dDeg];
            Q[i] = coeff;
            for (let j = 0; j <= dDeg; j++) {
                N[i + j] -= coeff * D[j];
            }
        }
        
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
            valStr = valStr.replace(/\.?0+$/, "");
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
        
        const points = Array(m).fill(0).map((_, i) => i + 1);
        
        const Apols = [];
        const Bpols = [];
        const Cpols = [];
        
        for (let i = 0; i < n; i++) {
            const a_vals = r1csMatrices.A.map(row => row[i]);
            const b_vals = r1csMatrices.B.map(row => row[i]);
            const c_vals = r1csMatrices.C.map(row => row[i]);
            
            Apols.push(interpolate(points, a_vals));
            Bpols.push(interpolate(points, b_vals));
            Cpols.push(interpolate(points, c_vals));
        }
        
        let Ax = [0];
        let Bx = [0];
        let Cx = [0];
        
        for (let i = 0; i < n; i++) {
            const val = witnessVector[i].val;
            Ax = polyAdd(Ax, polyScale(Apols[i], val));
            Bx = polyAdd(Bx, polyScale(Bpols[i], val));
            Cx = polyAdd(Cx, polyScale(Cpols[i], val));
        }
        
        let Tx = [1];
        for (let j = 1; j <= m; j++) {
            Tx = polyMul(Tx, [-j, 1]);
        }
        
        const num = polySub(polyMul(Ax, Bx), Cx);
        const division = polyDiv(num, Tx);
        const Qx = division.q;
        const Rx = division.r;
        
        const isRemainderZero = Rx.every(c => Math.abs(c) < 1e-5);
        
        const container = document.getElementById("qap-container");
        if (container) {
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
    }

    function sha256_hash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(16).padStart(8, '0') + "9f3f4c6e9384bc12df08ba23e7cf8a2f";
    }

    // Register module APIs inside ZKRegistry
    ZKRegistry.registerBridge("initAudio", initAudio);
    ZKRegistry.registerBridge("initDrone", initDrone);
    ZKRegistry.registerBridge("updateDroneChords", updateDroneChords);
    ZKRegistry.registerBridge("updateDroneVolume", updateDroneVolume);
    ZKRegistry.registerBridge("startWaveformAnimation", startWaveformAnimation);
    ZKRegistry.registerBridge("playSoundChime", playSoundChime);
    ZKRegistry.registerBridge("solveWitness", solveWitness);
    ZKRegistry.registerBridge("compileCircom", compileCircom);
    ZKRegistry.registerBridge("compileAndProve", compileAndProve);
    ZKRegistry.registerBridge("renderR1CSMatrices", renderR1CSMatrices);
    ZKRegistry.registerBridge("showHeatmapTooltip", showHeatmapTooltip);
    ZKRegistry.registerBridge("clearHeatmapTooltip", clearHeatmapTooltip);
    ZKRegistry.registerBridge("polyMul", polyMul);
    ZKRegistry.registerBridge("polyScale", polyScale);
    ZKRegistry.registerBridge("polyAdd", polyAdd);
    ZKRegistry.registerBridge("polySub", polySub);
    ZKRegistry.registerBridge("lagrangeBasis", lagrangeBasis);
    ZKRegistry.registerBridge("interpolate", interpolate);
    ZKRegistry.registerBridge("polyDiv", polyDiv);
    ZKRegistry.registerBridge("formatPoly", formatPoly);
    ZKRegistry.registerBridge("compileQAP", compileQAP);
    ZKRegistry.registerBridge("sha256_hash", sha256_hash);
})();
