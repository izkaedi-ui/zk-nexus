/* ZK-Nexus Connectors Module - UI Connectors, Exporters, & Presets */

(function() {
    function loadPreset(key) {
        const preset = PRESETS[key];
        document.getElementById("preset-description").innerText = preset.description;
        document.getElementById("circom-editor").value = preset.code;
        
        updateSyntaxHighlighting();
        
        signals = JSON.parse(JSON.stringify(preset.signals));
        gates = JSON.parse(JSON.stringify(preset.gates));
        
        log(`Loaded preset: ${preset.name}`, "info");
        
        renderSignalsPanel();
        buildTopologyGraph();
        compileAndProve();
    }

    function renderSignalsPanel() {
        const container = document.getElementById("signal-list-container");
        if (!container) return;
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
            const parsedVal = parseFloat(val);
            if (isNaN(parsedVal) || !isFinite(parsedVal)) {
                log(`Warning: Invalid numerical input for signal ${sig.name}`, "error");
                return;
            }
            sig.val = parsedVal;
            log(`Signal ${sig.name} set to ${sig.val}`, "info");
            solveWitness();
        }
    }

    function deleteNode(id) {
        const sigIdx = signals.findIndex(s => s.id === id);
        if (sigIdx !== -1) {
            if (signals[sigIdx].type === 'constant') return;
            signals.splice(sigIdx, 1);
            gates = gates.filter(g => g.output !== id && !g.inputs.includes(id));
            log(`Deleted signal node: ${id}`, "info");
        } else {
            gates = gates.filter(g => g.id !== id);
            log(`Deleted constraint gate: ${id}`, "info");
        }
        
        renderSignalsPanel();
        buildTopologyGraph();
        compileAndProve();
    }

    function editMatrixCell(el) {
        if (el.querySelector("input")) return;
        
        const matrix = el.getAttribute("data-matrix");
        const row = parseInt(el.getAttribute("data-row"));
        const col = parseInt(el.getAttribute("data-col"));
        const val = parseFloat(el.getAttribute("data-val"));
        
        el.innerHTML = "";
        const input = document.createElement("input");
        input.type = "number";
        input.className = "heatmap-edit-input";
        input.value = val;
        el.appendChild(input);
        input.focus();
        input.select();
        
        const finishEdit = () => {
            const newVal = parseFloat(input.value) || 0;
            
            r1csMatrices[matrix][row][col] = newVal;
            el.innerHTML = newVal !== 0 ? newVal : "0";
            el.setAttribute("data-val", newVal);
            
            el.classList.remove("val-zero", "val-pos", "val-neg");
            if (newVal === 0) el.classList.add("val-zero");
            else if (newVal > 0) el.classList.add("val-pos");
            else el.classList.add("val-neg");
            
            const signalName = witnessVector[col] ? witnessVector[col].name : `s[${col}]`;
            const gateId = gates[row] ? gates[row].id.toUpperCase() : `G${row+1}`;
            log(`Edited matrix cell ${matrix}[${gateId}, ${signalName}] value to ${newVal}`, "info");
            
            compileQAP();
            simulateProofReceipt();
        };
        
        input.addEventListener("blur", finishEdit);
        input.addEventListener("keydown", (e) => {
            if (e.key === 'Enter') {
                finishEdit();
            }
        });
    }

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

    function saveNodeFromModal() {
        const cat = document.getElementById("node-category").value;
        const name = document.getElementById("node-name").value.trim().replace(/\s+/g, '_');
        
        if (!name) {
            alert("Please specify a valid node identifier name.");
            return;
        }
        
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
        
        document.getElementById("add-node-modal").classList.remove("active");
        
        renderSignalsPanel();
        buildTopologyGraph();
        solveWitness();
        compileAndProve();
        
        const newNode = nodes.find(n => n.id === name);
        if (newNode) {
            newNode.x = addNodeCoords.x;
            newNode.y = addNodeCoords.y;
        }
    }

    // Register module APIs inside ZKRegistry
    ZKRegistry.registerConnector("loadPreset", loadPreset);
    ZKRegistry.registerConnector("renderSignalsPanel", renderSignalsPanel);
    ZKRegistry.registerConnector("updateSignalValue", updateSignalValue);
    ZKRegistry.registerConnector("deleteNode", deleteNode);
    ZKRegistry.registerConnector("editMatrixCell", editMatrixCell);
    ZKRegistry.registerConnector("exportWitness", exportWitness);
    ZKRegistry.registerConnector("exportR1CS", exportR1CS);
    ZKRegistry.registerConnector("exportCanvas", exportCanvas);
    ZKRegistry.registerConnector("toggleModalFields", toggleModalFields);
    ZKRegistry.registerConnector("saveNodeFromModal", saveNodeFromModal);
})();
