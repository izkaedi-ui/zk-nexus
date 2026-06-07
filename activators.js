/* ZK-Nexus Activators Module - Cryptographic Ceremonies & Warnings Verification */

function runSetupCeremony() {
    initAudio();
    const entropyInput = document.getElementById("setup-entropy");
    const seed = (entropyInput ? entropyInput.value.trim() : "") || "0x" + Math.random().toString(16).substring(2, 10);
    
    log(`Initiating Powers-of-Tau Setup Ceremony with seed: ${seed}`, "info");
    playSoundChime('proof');
    
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
        
        if (progress % 10 === 0 && canvas) {
            const centerX = canvas.width / (2 * scale);
            const centerY = canvas.height / (2 * scale);
            for (let i = 0; i < 8; i++) {
                const angle = Math.random() * Math.PI * 2;
                const distance = 200 + Math.random() * 100;
                toxicParticles.push({
                    x: centerX + Math.cos(angle) * distance,
                    y: centerY + Math.sin(angle) * distance,
                    vx: 0,
                    vy: 0,
                    size: 3 + Math.random() * 5,
                    life: 1.0,
                    decay: 0.01 + Math.random() * 0.01,
                    color: Math.random() > 0.5 ? '#bd00ff' : '#39ff14',
                    pull: true
                });
            }
        }
        
        if (progress === 20) log("Phase 1: Generating powers of tau Lagrange parameters...", "info");
        if (progress === 40) log("Phase 2: Contributions submitted. Evaluating polynomial mappings...", "info");
        if (progress === 60) log("Phase 3: Computing random beacon delta scaling...", "info");
        if (progress === 80) log("Phase 4: Establishing Structured Reference String (SRS) keys...", "info");
        
        if (progress >= 100) {
            clearInterval(interval);
            
            pkHash = "PK_" + sha256_hash(seed + "_proving_key").substring(0, 36) + "_G1";
            vkHash = "VK_" + sha256_hash(seed + "_verifying_key").substring(0, 36) + "_G2";
            
            document.getElementById("pk-hash").innerText = pkHash;
            document.getElementById("vk-hash").innerText = vkHash;
            
            isCeremonyCompleted = true;
            log("Ceremony complete! Structured Reference String keys generated. Toxic waste parameters discarded successfully.", "success");
            playSoundChime('success');
            
            const centerX = canvas.width / (2 * scale);
            const centerY = canvas.height / (2 * scale);
            for (let i = 0; i < 35; i++) {
                toxicParticles.push({
                    x: centerX,
                    y: centerY,
                    vx: (Math.random() - 0.5) * 12,
                    vy: (Math.random() - 0.5) * 12,
                    size: 4 + Math.random() * 8,
                    life: 1.0,
                    decay: 0.015 + Math.random() * 0.015,
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

function runCircomDiagnostics(code) {
    const warnings = [];
    
    signals.forEach(sig => {
        if (sig.type === 'constant') return;
        
        const isUsedAsInput = gates.some(g => g.inputs.includes(sig.id));
        const isUsedAsOutput = gates.some(g => g.output === sig.id);
        
        if (!isUsedAsInput && !isUsedAsOutput) {
            warnings.push(`Dangling signal: <code>${sig.name}</code> is declared but not connected to any gates.`);
        }
    });
    
    const codeLines = code.split('\n');
    codeLines.forEach((line, idx) => {
        const cleanLine = line.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '').trim();
        if (cleanLine.includes('<==') || cleanLine.includes('===')) {
            const parts = cleanLine.split(/<==|===/);
            if (parts[1]) {
                const starCount = (parts[1].match(/\*/g) || []).length;
                if (starCount > 1) {
                    warnings.push(`Line ${idx+1}: Non-quadratic constraint warning. Circom only permits degree <= 2 constraints (single multiplication like <code>A * B</code>). Decompose <code>${parts[1].trim()}</code> into intermediate gates.`);
                }
            }
        }
    });
    
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

// Register inside ZKRegistry
ZKRegistry.registerActivator("runSetupCeremony", runSetupCeremony);
ZKRegistry.registerActivator("simulateProofReceipt", simulateProofReceipt);
ZKRegistry.registerActivator("runCircomDiagnostics", runCircomDiagnostics);
