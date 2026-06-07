/* ZK-Nexus Listeners Module - Canvas Physics Engine, Interactions, & Onboarding Guides */

(function() {
    function buildTopologyGraph() {
        nodes = [];
        links = [];
        
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
        
        gates.forEach(gate => {
            gate.inputs.forEach(inId => {
                links.push({ source: inId, target: gate.id });
            });
            links.push({ source: gate.id, target: gate.output });
        });
        
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
        
        ctx.fillStyle = "rgba(0, 242, 254, 0.04)";
        const gridSize = 40;
        const gridLimitX = canvas.width / scale;
        const gridLimitY = canvas.height / scale;
        
        const startX = -Math.floor(offset.x / (gridSize * scale)) * gridSize - gridSize * 2;
        const endX = startX + gridLimitX + gridSize * 4;
        
        const startY = -Math.floor(offset.y / (gridSize * scale)) * gridSize - gridSize * 2;
        const endY = startY + gridLimitY + gridSize * 4;
        
        for (let x = startX; x < endX; x += gridSize) {
            for (let y = startY; y < endY; y += gridSize) {
                ctx.beginPath();
                ctx.arc(x, y, 1.0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
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
        
        if (wiringSource) {
            ctx.beginPath();
            ctx.moveTo(wiringSource.x, wiringSource.y);
            ctx.lineTo(currentMouse.x, currentMouse.y);
            ctx.strokeStyle = "rgba(255, 215, 0, 0.5)";
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
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
        
        toxicParticles.forEach((tp, idx) => {
            if (tp.pull) {
                const centerX = canvas.width / (2 * scale);
                const centerY = canvas.height / (2 * scale);
                const dx = centerX - tp.x;
                const dy = centerY - tp.y;
                const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                
                const strength = 0.08;
                tp.vx += (dx / dist) * strength;
                tp.vy += (dy / dist) * strength;
                
                tp.vx *= 0.95;
                tp.vy *= 0.95;
            }
            
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
        
        const setupBar = document.getElementById("ceremony-status-bar");
        if (setupBar && setupBar.style.display === "block") {
            ctx.save();
            const centerX = canvas.width / (2 * scale);
            const centerY = canvas.height / (2 * scale);
            
            const pulse = 1 + Math.sin(Date.now() * 0.015) * 0.12;
            const rad = 25 * pulse;
            
            ctx.beginPath();
            ctx.arc(centerX, centerY, rad + 18, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(189, 0, 255, 0.15)";
            ctx.lineWidth = 4;
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(centerX, centerY, rad + 6, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(0, 242, 254, 0.35)";
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(centerX, centerY, rad, 0, Math.PI * 2);
            ctx.fillStyle = "#020408";
            ctx.strokeStyle = "var(--neon-purple)";
            ctx.lineWidth = 3;
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = "rgba(0, 242, 254, 0.8)";
            ctx.font = "bold 9px 'Fira Code', monospace";
            const txt = "SRS INCINERATOR";
            ctx.fillText(txt, centerX - ctx.measureText(txt).width/2, centerY + 3);
            ctx.restore();
        }
        
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

    function setupCanvasListeners() {
        canvas.addEventListener("dblclick", e => {
            const mouse = getRelativeMousePos(e);
            addNodeCoords = { x: mouse.x, y: mouse.y };
            
            document.getElementById("node-name").value = "";
            document.getElementById("add-node-modal").classList.add("active");
            toggleModalFields();
        });
        
        canvas.addEventListener("mousedown", e => {
            initAudio();
            const mouse = getRelativeMousePos(e);
            
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
                const targetX = e.clientX - startPan.x;
                const targetY = e.clientY - startPan.y;
                
                // Fortify bounds check: constrain panning bounds
                const maxPanDistanceX = canvas.width * 2;
                const maxPanDistanceY = canvas.height * 2;
                
                offset.x = Math.max(-maxPanDistanceX, Math.min(maxPanDistanceX, targetX));
                offset.y = Math.max(-maxPanDistanceY, Math.min(maxPanDistanceY, targetY));
            }
        });
        
        canvas.addEventListener("mouseup", e => {
            if (wiringSource) {
                const mouse = getRelativeMousePos(e);
                
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

    function linkNodes(src, tgt) {
        if (!src.isGate && tgt.isGate) {
            const gate = gates.find(g => g.id === tgt.id);
            if (gate && !gate.inputs.includes(src.id)) {
                gate.inputs.push(src.id);
                gate.expr = gate.inputs.join(gate.type === 'add' ? ' + ' : ' * ');
                log(`Wired signal ${src.id} as input to Gate ${tgt.id.toUpperCase()}`, "info");
            }
        }
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

    function openTour() {
        currentTourStep = 0;
        const modal = document.getElementById("help-tour-modal");
        if (modal) {
            modal.classList.add("active");
            renderTourSlide();
        }
    }

    // close and reset state cleanly
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
        
        const dotsContainer = document.getElementById("tour-dots");
        if (dotsContainer) {
            dotsContainer.innerHTML = tourSlides.map((_, idx) => `
                <div class="tour-dot ${idx === currentTourStep ? 'active' : ''}" onclick="goToTourStep(${idx})"></div>
            `).join('');
        }
        
        const prevBtn = document.getElementById("btn-tour-prev");
        if (prevBtn) {
            prevBtn.disabled = currentTourStep === 0;
            prevBtn.style.opacity = currentTourStep === 0 ? "0.3" : "1";
        }
        
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

    // Register module APIs inside ZKRegistry
    ZKRegistry.registerListener("buildTopologyGraph", buildTopologyGraph);
    ZKRegistry.registerListener("triggerFlowParticles", triggerFlowParticles);
    ZKRegistry.registerListener("updatePhysics", updatePhysics);
    ZKRegistry.registerListener("animationLoop", animationLoop);
    ZKRegistry.registerListener("setupCanvasListeners", setupCanvasListeners);
    ZKRegistry.registerListener("getRelativeMousePos", getRelativeMousePos);
    ZKRegistry.registerListener("linkNodes", linkNodes);
    ZKRegistry.registerListener("openTour", openTour);
    ZKRegistry.registerListener("closeTour", closeTour);
    ZKRegistry.registerListener("renderTourSlide", renderTourSlide);
    ZKRegistry.registerListener("goToTourStep", goToTourStep);
    ZKRegistry.registerListener("nextTourStep", nextTourStep);
    ZKRegistry.registerListener("prevTourStep", prevTourStep);
})();
