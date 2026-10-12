import { gl } from "./global.js";
import { getAndCompileShader } from "./utils.js";
import { mat4, quat, vec3 } from "gl-matrix";
import { lightingLights, material, cameraPosition } from "./lighting.js";
import { ShadowMap } from "./shadow.js";

export class model {
    constructor(url, x, y, z, rx = 0, ry = 0, rz = 0, scale = 0.02) {
        this.url = url;
        this.position = vec3.fromValues(x, y, z);
        this.rotation = vec3.fromValues(rx, ry, rz);
        this.scale = scale;
        this.modelMatrix = mat4.create();
        this.meshes = [];
        this.nodes = [];
        this.skins = [];
        this.animations = [];
        this.currentAnimation = null;
        this.animationTime = 0;
        this.animationDuration = 0;
        this.animationSpeed = 1;
        this.loopAnimation = true;
        this.animationList = null;
        this.animationIndex = 0;
        this.isLoaded = false;
        this.gltf = null;
        this.binaryBuffer = null;
        this.textures = [];
        this.programs = {};
        this.jointMatrices = new Float32Array(55 * 16);
        this.isObstacle = true;
        this._cachedBoundingBoxes = null;
        this._lastBoxPos = vec3.create();
        this._lastBoxRot = vec3.create();
        this._lastBoxScale = 0;
    }

    async load() {
        // Read the GLB, then turn its data into GPU resources.
        const response = await fetch(this.url);
        if (!response.ok) throw new Error(`Could not load model: ${response.status}`);

        const buffer = await response.arrayBuffer();
        const view = new DataView(buffer);
        if (view.getUint32(0, true) !== 0x46546c67) throw new Error("Invalid GLB file");
        if (view.getUint32(4, true) !== 2) throw new Error("Only GLB version 2 is supported");

        const jsonLength = view.getUint32(12, true);
        if (view.getUint32(16, true) !== 0x4e4f534a) throw new Error("GLB JSON chunk is missing");
        this.gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));

        const binHeader = 20 + jsonLength;
        if (binHeader + 8 > buffer.byteLength) throw new Error("GLB binary chunk is missing");
        const binLength = view.getUint32(binHeader, true);
        if (view.getUint32(binHeader + 4, true) !== 0x004e4942) throw new Error("GLB binary chunk is invalid");
        this.binaryBuffer = buffer.slice(binHeader + 8, binHeader + 8 + binLength);

        this.skins = this.gltf.skins ?? [];
        this.animations = this.gltf.animations ?? [];
        const jointCount = Math.max(0, ...this.skins.map(skin => skin.joints.length));
        this.jointMatrices = new Float32Array(jointCount * 16);
        await this.loadTextures();
        this.createPrograms();
        this.createNodes();
        this.createMeshes();
        this.updateNodeMatrices();
        this.updateJointMatrices();
        this.isLoaded = true;
        return this;
    }

    async loadTextures() {
        // The textures are stored inside this GLB, not as separate files.
        this.textures = await Promise.all((this.gltf.images ?? []).map(async image => {
            // console.log(this.gltf.images);
            const view = this.gltf.bufferViews[image.bufferView];
            const start = view.byteOffset ?? 0;
            const bytes = this.binaryBuffer.slice(start, start + view.byteLength);
            const url = URL.createObjectURL(new Blob([bytes], { type: image.mimeType }));
            const element = new Image();
            element.src = url;
            await element.decode();
            URL.revokeObjectURL(url);

            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            // glTF UVs expect the image orientation as stored.
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            return texture;
        }));
    }

    readAccessor(accessorIndex) {
        // Accessors describe where positions, UVs, joints, and keyframes live.
        const accessor = this.gltf.accessors[accessorIndex];
        const bufferView = this.gltf.bufferViews[accessor.bufferView];
        const arrayTypes = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
        const componentCounts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT3: 9, MAT4: 16 };
        const ArrayType = arrayTypes[accessor.componentType];
        const componentCount = componentCounts[accessor.type];
        if (!ArrayType || !componentCount) throw new Error(`Unsupported accessor ${accessorIndex}`);

        const offset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
        const elementBytes = componentBytes(accessor.componentType) * componentCount;
        const stride = bufferView.byteStride ?? elementBytes;
        if (stride === elementBytes) {
            return new ArrayType(this.binaryBuffer, offset, accessor.count * componentCount);
        }

        const result = new ArrayType(accessor.count * componentCount);
        for (let i = 0; i < accessor.count; i++) {
            const values = new ArrayType(this.binaryBuffer, offset + i * stride, componentCount);
            result.set(values, i * componentCount);
        }
        return result;
    }

    createPrograms() {
        this.programs.rigid = this.createProgram("modelVertexShader", "modelFragmentShader");
        this.programs.skinned = this.createProgram("skinnedVertexShader", "modelFragmentShader");
        // Depth-only programs for shadow map pass
        this.programs.depthRigid = this.createProgram("shadowDepthVertexShader", "shadowDepthFragmentShader");
        this.programs.depthSkinned = this.createProgram("shadowDepthSkinnedVertexShader", "shadowDepthFragmentShader");
    }

    createProgram(vertexId, fragmentId) {
        const program = gl.createProgram();
        gl.attachShader(program, getAndCompileShader(vertexId));
        gl.attachShader(program, getAndCompileShader(fragmentId));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        return program;
    }

    createNodes() {
        this.nodes = (this.gltf.nodes ?? []).map(source => {
            const node = {
                source,
                children: source.children ?? [],
                localMatrix: mat4.create(),
                worldMatrix: mat4.create(),
                translation: vec3.fromValues(...(source.translation ?? [0, 0, 0])),
                rotation: quat.fromValues(...(source.rotation ?? [0, 0, 0, 1])),
                scale: vec3.fromValues(...(source.scale ?? [1, 1, 1]))
            };
            if (source.matrix) mat4.copy(node.localMatrix, source.matrix);
            else mat4.fromRotationTranslationScale(node.localMatrix, node.rotation, node.translation, node.scale);
            return node;
        });
    }

    createMeshes() {
        // A single GLB can contain several separate pieces of a model.
        for (let nodeIndex = 0; nodeIndex < this.nodes.length; nodeIndex++) {
            const source = this.nodes[nodeIndex].source;
            if (source.mesh === undefined) continue;
            for (const primitive of this.gltf.meshes[source.mesh].primitives) {
                this.meshes.push(this.createPrimitive(primitive, nodeIndex, source.skin));
            }
        }
    }

    createPrimitive(primitive, nodeIndex, skinIndex) {
        const program = skinIndex === undefined ? this.programs.rigid : this.programs.skinned;
        const depthProgram = skinIndex === undefined ? this.programs.depthRigid : this.programs.depthSkinned;

        // --- Shared vertex data buffers (used by both main and depth VAOs) ---
        const posAccessor = this.gltf.accessors[primitive.attributes.POSITION];
        const localBounds = {
            min: posAccessor && posAccessor.min ? [...posAccessor.min] : [-1, -1, -1],
            max: posAccessor && posAccessor.max ? [...posAccessor.max] : [1, 1, 1]
        };
        const positionData = this.readAccessor(primitive.attributes.POSITION);
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positionData, gl.STATIC_DRAW);

        let jointsData, jointsBuffer, weightsData, weightsBuffer;
        if (skinIndex !== undefined) {
            jointsData = this.readAccessor(primitive.attributes.JOINTS_0);
            jointsBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, jointsBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, jointsData, gl.STATIC_DRAW);

            weightsData = this.readAccessor(primitive.attributes.WEIGHTS_0);
            weightsBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, weightsBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, weightsData, gl.STATIC_DRAW);
        }

        const indexAccessor = this.gltf.accessors[primitive.indices];
        const indices = this.readAccessor(primitive.indices);
        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

        // --- Main rendering VAO ---
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        this.createAttribute(program, "position", primitive.attributes.POSITION, 3);
        if (primitive.attributes.NORMAL !== undefined) this.createAttribute(program, "normal", primitive.attributes.NORMAL, 3);
        if (primitive.attributes.TEXCOORD_0 !== undefined) this.createAttribute(program, "textureCoordinate", primitive.attributes.TEXCOORD_0, 2);
        const hasTangent = primitive.attributes.TANGENT !== undefined;
        if (hasTangent) this.createAttribute(program, "tangent", primitive.attributes.TANGENT, 4);
        if (skinIndex !== undefined) {
            this.createAttribute(program, "joints", primitive.attributes.JOINTS_0, 4);
            this.createAttribute(program, "weights", primitive.attributes.WEIGHTS_0, 4);
        }
        const mainIndexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mainIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        gl.bindVertexArray(null);

        // --- Depth (shadow) VAO ---
        const depthVao = gl.createVertexArray();
        gl.bindVertexArray(depthVao);
        this.createAttribute(depthProgram, "position", primitive.attributes.POSITION, 3);
        if (skinIndex !== undefined) {
            this.createAttribute(depthProgram, "joints", primitive.attributes.JOINTS_0, 4);
            this.createAttribute(depthProgram, "weights", primitive.attributes.WEIGHTS_0, 4);
        }
        const depthIndexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, depthIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        gl.bindVertexArray(null);

        const matInfo = this.materialInfo(primitive.material);

        return {
            vao,
            depthVao,
            program,
            depthProgram,
            nodeIndex,
            skinIndex,
            hasTangent,
            matInfo,
            localBounds,
            mode: primitive.mode ?? gl.TRIANGLES,
            indexCount: indexAccessor.count,
            indexType: glIndexType(indexAccessor.componentType),
            // Main shader uniform locations
            modelMatrixLocation: gl.getUniformLocation(program, "modelMatrix"),
            nodeMatrixLocation: gl.getUniformLocation(program, "nodeMatrix"),
            viewMatrixLocation: gl.getUniformLocation(program, "viewMatrix"),
            projectionMatrixLocation: gl.getUniformLocation(program, "projectionMatrix"),
            jointMatricesLocation: gl.getUniformLocation(program, "jointMatrices"),
            lightPositionLocation: gl.getUniformLocation(program, "lightPosition"),
            lightColorLocation: gl.getUniformLocation(program, "lightColor"),
            lightRangeLocation: gl.getUniformLocation(program, "lightRange"),
            lightCountLocation: gl.getUniformLocation(program, "lightCount"),
            cameraPositionLocation: gl.getUniformLocation(program, "cameraPosition"),
            materialAmbientLocation: gl.getUniformLocation(program, "materialAmbient"),
            materialDiffuseLocation: gl.getUniformLocation(program, "materialDiffuse"),
            materialSpecularLocation: gl.getUniformLocation(program, "materialSpecular"),
            materialShininessLocation: gl.getUniformLocation(program, "materialShininess"),

            // Texture samplers
            textureLocation: gl.getUniformLocation(program, "uTexture"),
            metallicRoughnessLocation: gl.getUniformLocation(program, "uMetallicRoughnessMap"),
            normalMapLocation: gl.getUniformLocation(program, "uNormalMap"),
            emissiveMapLocation: gl.getUniformLocation(program, "uEmissiveMap"),
            occlusionMapLocation: gl.getUniformLocation(program, "uOcclusionMap"),

            // Material presence flags
            hasMetallicRoughnessLocation: gl.getUniformLocation(program, "uHasMetallicRoughness"),
            hasNormalMapLocation: gl.getUniformLocation(program, "uHasNormalMap"),
            hasEmissiveMapLocation: gl.getUniformLocation(program, "uHasEmissiveMap"),
            hasOcclusionMapLocation: gl.getUniformLocation(program, "uHasOcclusionMap"),
            hasTangentLocation: gl.getUniformLocation(program, "uHasTangent"),

            // Material factors
            baseColorFactorLocation: gl.getUniformLocation(program, "uBaseColorFactor"),
            emissiveFactorLocation: gl.getUniformLocation(program, "uEmissiveFactor"),
            metallicFactorLocation: gl.getUniformLocation(program, "uMetallicFactor"),
            roughnessFactorLocation: gl.getUniformLocation(program, "uRoughnessFactor"),

            // Shadow uniform locations (main shader)
            lightSpaceMatrixLocation: gl.getUniformLocation(program, "lightSpaceMatrix"),
            shadowMapLocation: gl.getUniformLocation(program, "shadowMap"),
            shadowEnabledLocation: gl.getUniformLocation(program, "shadowEnabled"),
            // Depth shader uniform locations
            depthLightSpaceMatrixLocation: gl.getUniformLocation(depthProgram, "lightSpaceMatrix"),
            depthModelMatrixLocation: gl.getUniformLocation(depthProgram, "modelMatrix"),
            depthNodeMatrixLocation: gl.getUniformLocation(depthProgram, "nodeMatrix"),
            depthJointMatricesLocation: gl.getUniformLocation(depthProgram, "jointMatrices"),
        };
    }

    materialInfo(materialIndex) {
        if (materialIndex === undefined || !this.gltf.materials?.[materialIndex]) {
            return {
                baseColorTexture: null,
                metallicRoughnessTexture: null,
                normalTexture: null,
                emissiveTexture: null,
                occlusionTexture: null,
                hasMetallicRoughness: false,
                hasNormalMap: false,
                hasEmissiveMap: false,
                hasOcclusionMap: false,
                baseColorFactor: new Float32Array([1, 1, 1, 1]),
                emissiveFactor: new Float32Array([0, 0, 0]),
                metallicFactor: 0.0,
                roughnessFactor: 0.82,
                doubleSided: false
            };
        }

        const mat = this.gltf.materials[materialIndex];
        const pbr = mat.pbrMetallicRoughness ?? {};

        const getTexture = (info) => {
            if (!info || info.index === undefined) return null;
            const imgIdx = this.gltf.textures?.[info.index]?.source;
            return imgIdx !== undefined ? this.textures[imgIdx] : null;
        };

        const baseColorTexture = getTexture(pbr.baseColorTexture);
        const metallicRoughnessTexture = getTexture(pbr.metallicRoughnessTexture);
        const normalTexture = getTexture(mat.normalTexture);
        const emissiveTexture = getTexture(mat.emissiveTexture);
        const occlusionTexture = getTexture(mat.occlusionTexture);

        return {
            baseColorTexture,
            metallicRoughnessTexture,
            normalTexture,
            emissiveTexture,
            occlusionTexture,
            hasMetallicRoughness: !!metallicRoughnessTexture,
            hasNormalMap: !!normalTexture,
            hasEmissiveMap: !!emissiveTexture,
            hasOcclusionMap: !!occlusionTexture,
            baseColorFactor: new Float32Array(pbr.baseColorFactor ?? [1, 1, 1, 1]),
            emissiveFactor: new Float32Array(mat.emissiveFactor ?? [0, 0, 0]),
            metallicFactor: pbr.metallicFactor ?? 1.0,
            roughnessFactor: pbr.roughnessFactor ?? 1.0,
            doubleSided: mat.doubleSided ?? false
        };
    }

    createAttribute(program, name, accessorIndex, size) {
        const data = this.readAccessor(accessorIndex);
        const accessor = this.gltf.accessors[accessorIndex];
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        const location = gl.getAttribLocation(program, name);
        if (location < 0) return;
        gl.enableVertexAttribArray(location);
        if (name === "joints") gl.vertexAttribIPointer(location, size, glIndexType(accessor.componentType), 0, 0);
        else gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    }

    update(deltaTime) {
        // Advance the selected clip, then update the skeleton for this frame.
        if (this.currentAnimation) {
            this.animationTime += deltaTime * this.animationSpeed;
            
            // Handle time-based segments
            if (this.animationStartTime !== undefined && this.animationEndTime !== undefined) {
                const segmentTime = this.animationStartTime + (this.animationTime % this.animationSegmentDuration);
                
                if (this.loopAnimation) {
                    // Loop within the segment
                    if (this.animationTime >= this.animationSegmentDuration) {
                        this.animationTime = this.animationTime % this.animationSegmentDuration;
                    }
                } else {
                    // Clamp to segment end
                    if (this.animationTime >= this.animationSegmentDuration) {
                        this.animationTime = this.animationSegmentDuration;
                    }
                }
                
                this.applyAnimation(this.currentAnimation, segmentTime);
            } else {
                // Original behavior for full animations
                if (this.animationList && this.animationTime >= this.animationDuration) {
                    this.animationIndex = (this.animationIndex + 1) % this.animationList.length;
                    this.play(this.animationList[this.animationIndex], { loop: false });
                } else {
                    this.animationTime = this.loopAnimation
                        ? this.animationTime % this.animationDuration
                        : Math.min(this.animationTime, this.animationDuration);
                }
                this.applyAnimation(this.currentAnimation, this.animationTime);
            }
        }
        this.updateNodeMatrices();
        this.updateJointMatrices();
    }

    play(name, options = {}, modelName = "") {
        const animation = name === undefined ? this.animations[0] : this.animations.find(clip => clip.name === name);
        if (!animation) throw new Error(`Animation not found: ${name ?? "first animation"}`);
        this.currentAnimation = animation;
        this.animationTime = options.startTime || 0;
        this.animationSpeed = options.speed ?? 1;
        this.loopAnimation = options.loop ?? true;
        this.animationDuration = this.getAnimationDuration(animation);

        // console.log(options);
        
        // Time-based animation support
        this.animationStartTime = options.startTime || 0;
        this.animationEndTime = options.endTime || this.animationDuration;
        this.animationSegmentDuration = this.animationEndTime - this.animationStartTime;
        
        // console.log(`Model ${modelName} Playing animation "${name}" from ${this.animationStartTime}s to ${this.animationEndTime}s`);
    }

    playSegment(name, startTime, endTime, options = {}) {
        const segmentOptions = {
            ...options,
            startTime: startTime,
            endTime: endTime,
            loop: options.loop ?? false
        };
        this.play(name, segmentOptions);
    }

    playAllAnimations() {
        this.animationList = this.animations.map(animation => animation.name);
        this.animationIndex = 0;
        this.play(this.animationList[0], { loop: false });
    }

    getAnimationDuration(animation) {
        return Math.max(...animation.samplers.map(sampler => {
            const times = this.readAccessor(sampler.input);
            return times[times.length - 1];
        }));
    }

    applyAnimation(animation, time) {
        for (const channel of animation.channels) {
            const sampler = animation.samplers[channel.sampler];
            const times = this.readAccessor(sampler.input);
            const values = this.readAccessor(sampler.output);
            const node = this.nodes[channel.target.node];
            const size = channel.target.path === "rotation" ? 4 : 3;
            let index = 0;
            while (index < times.length - 1 && time >= times[index + 1]) index++;
            const next = Math.min(index + 1, times.length - 1);
            const amount = times[next] === times[index] ? 0 : (time - times[index]) / (times[next] - times[index]);
            const a = values.subarray(index * size, index * size + size);
            const b = values.subarray(next * size, next * size + size);
            if (channel.target.path === "rotation") quat.slerp(node.rotation, a, b, amount);
            else if (channel.target.path === "translation") vec3.lerp(node.translation, a, b, amount);
            else if (channel.target.path === "scale") vec3.lerp(node.scale, a, b, amount);
            mat4.fromRotationTranslationScale(node.localMatrix, node.rotation, node.translation, node.scale);
        }
    }

    updateNodeMatrices() {
        const children = new Set(this.nodes.flatMap(node => node.children));
        for (let i = 0; i < this.nodes.length; i++) {
            if (!children.has(i)) this.updateNodeWorld(i, mat4.create());
        }
    }

    updateNodeWorld(nodeIndex, parentMatrix) {
        const node = this.nodes[nodeIndex];
        mat4.multiply(node.worldMatrix, parentMatrix, node.localMatrix);
        for (const child of node.children) this.updateNodeWorld(child, node.worldMatrix);
    }

    updateJointMatrices() {
        // Convert joint poses into the matrices used by the skinning shader.
        const skin = this.skins[0];
        if (!skin) return;
        const inverseBinds = this.readAccessor(skin.inverseBindMatrices);
        const skinnedMesh = this.meshes.find(mesh => mesh.skinIndex === 0);
        const inverseMeshMatrix = mat4.create();
        if (skinnedMesh) {
            mat4.invert(inverseMeshMatrix, this.nodes[skinnedMesh.nodeIndex].worldMatrix);
        }

        for (let i = 0; i < skin.joints.length; i++) {
            const matrix = mat4.create();
            mat4.multiply(matrix, this.nodes[skin.joints[i]].worldMatrix, inverseBinds.subarray(i * 16, i * 16 + 16));
            mat4.multiply(matrix, inverseMeshMatrix, matrix);
            this.jointMatrices.set(matrix, i * 16);
        }
    }

    /**
     * Depth-only pass: renders the model into the shadow map.
     * Uses minimal shaders for maximum performance.
     */
    drawDepth(shadowMap) {
        if (!this.isLoaded) return;
        this.computeModelMatrix();

        for (const mesh of this.meshes) {
            gl.useProgram(mesh.depthProgram);
            gl.bindVertexArray(mesh.depthVao);
            gl.uniformMatrix4fv(mesh.depthLightSpaceMatrixLocation, false, shadowMap.lightSpaceMatrix);
            gl.uniformMatrix4fv(mesh.depthModelMatrixLocation, false, this.modelMatrix);
            gl.uniformMatrix4fv(mesh.depthNodeMatrixLocation, false, this.nodes[mesh.nodeIndex].worldMatrix);
            if (mesh.skinIndex !== undefined) {
                gl.uniformMatrix4fv(mesh.depthJointMatricesLocation, false, this.jointMatrices);
            }
            gl.drawElements(mesh.mode, mesh.indexCount, mesh.indexType, 0);
        }
        gl.bindVertexArray(null);
    }

    draw(viewMatrix, projectionMatrix, shadowMap) {
        if (!this.isLoaded) return;
        this.computeModelMatrix();
        const defTex = getDefaultTextures();

        for (const mesh of this.meshes) {
            gl.useProgram(mesh.program);
            gl.bindVertexArray(mesh.vao);
            gl.uniformMatrix4fv(mesh.modelMatrixLocation, false, this.modelMatrix);
            gl.uniformMatrix4fv(mesh.nodeMatrixLocation, false, this.nodes[mesh.nodeIndex].worldMatrix);
            gl.uniformMatrix4fv(mesh.viewMatrixLocation, false, viewMatrix);
            gl.uniformMatrix4fv(mesh.projectionMatrixLocation, false, projectionMatrix);
            if (mesh.skinIndex !== undefined) gl.uniformMatrix4fv(mesh.jointMatricesLocation, false, this.jointMatrices);
            gl.uniform3fv(mesh.lightPositionLocation, new Float32Array(lightingLights.flatMap(light => Array.from(light.position))));
            gl.uniform3fv(mesh.lightColorLocation, new Float32Array(lightingLights.flatMap(light =>
                Array.from(light.color, channel => channel * light.intensity)
            )));
            gl.uniform1fv(mesh.lightRangeLocation, new Float32Array(lightingLights.map(light => light.range)));
            gl.uniform1i(mesh.lightCountLocation, lightingLights.length);
            gl.uniform3fv(mesh.cameraPositionLocation, cameraPosition);
            gl.uniform3fv(mesh.materialAmbientLocation, material.ambient);
            gl.uniform3fv(mesh.materialDiffuseLocation, material.diffuse);
            gl.uniform3fv(mesh.materialSpecularLocation, material.specular);
            gl.uniform1f(mesh.materialShininessLocation, material.shininess);

            // Unit 0: Base Color Map
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, mesh.matInfo.baseColorTexture ?? defTex.white);
            gl.uniform1i(mesh.textureLocation, 0);

            // Unit 1: Shadow Map
            if (shadowMap) {
                gl.uniformMatrix4fv(mesh.lightSpaceMatrixLocation, false, shadowMap.lightSpaceMatrix);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, shadowMap.depthTexture);
                gl.uniform1i(mesh.shadowMapLocation, 1);
                gl.uniform1i(mesh.shadowEnabledLocation, 1);
            } else {
                gl.uniform1i(mesh.shadowEnabledLocation, 0);
            }

            // Unit 2: Metallic-Roughness Map
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, mesh.matInfo.metallicRoughnessTexture ?? defTex.roughness);
            gl.uniform1i(mesh.metallicRoughnessLocation, 2);

            // Unit 3: Normal Map
            gl.activeTexture(gl.TEXTURE3);
            gl.bindTexture(gl.TEXTURE_2D, mesh.matInfo.normalTexture ?? defTex.normal);
            gl.uniform1i(mesh.normalMapLocation, 3);

            // Unit 4: Emissive Map
            gl.activeTexture(gl.TEXTURE4);
            gl.bindTexture(gl.TEXTURE_2D, mesh.matInfo.emissiveTexture ?? defTex.black);
            gl.uniform1i(mesh.emissiveMapLocation, 4);

            // Unit 5: Occlusion Map
            gl.activeTexture(gl.TEXTURE5);
            gl.bindTexture(gl.TEXTURE_2D, mesh.matInfo.occlusionTexture ?? defTex.white);
            gl.uniform1i(mesh.occlusionMapLocation, 5);

            // Upload material flags & factors
            gl.uniform1i(mesh.hasMetallicRoughnessLocation, mesh.matInfo.hasMetallicRoughness ? 1 : 0);
            gl.uniform1i(mesh.hasNormalMapLocation, mesh.matInfo.hasNormalMap ? 1 : 0);
            gl.uniform1i(mesh.hasEmissiveMapLocation, mesh.matInfo.hasEmissiveMap ? 1 : 0);
            gl.uniform1i(mesh.hasOcclusionMapLocation, mesh.matInfo.hasOcclusionMap ? 1 : 0);
            gl.uniform1i(mesh.hasTangentLocation, mesh.hasTangent ? 1 : 0);

            gl.uniform4fv(mesh.baseColorFactorLocation, mesh.matInfo.baseColorFactor);
            gl.uniform3fv(mesh.emissiveFactorLocation, mesh.matInfo.emissiveFactor);
            gl.uniform1f(mesh.metallicFactorLocation, mesh.matInfo.metallicFactor);
            gl.uniform1f(mesh.roughnessFactorLocation, mesh.matInfo.roughnessFactor);

            if (mesh.matInfo.doubleSided) {
                gl.disable(gl.CULL_FACE);
            } else {
                gl.enable(gl.CULL_FACE);
            }

            gl.drawElements(mesh.mode, mesh.indexCount, mesh.indexType, 0);
        }
        gl.disable(gl.CULL_FACE);
        gl.bindVertexArray(null);
    }

    /** Compute model matrix from position/rotation/scale (shared between draw passes) */
    computeModelMatrix() {
        mat4.identity(this.modelMatrix);
        mat4.translate(this.modelMatrix, this.modelMatrix, this.position);
        mat4.rotateZ(this.modelMatrix, this.modelMatrix, this.rotation[2]);
        mat4.rotateY(this.modelMatrix, this.modelMatrix, this.rotation[1]);
        mat4.rotateX(this.modelMatrix, this.modelMatrix, this.rotation[0]);
        mat4.scale(this.modelMatrix, this.modelMatrix, [this.scale, this.scale, this.scale]);
    }

    /**
     * Create a clone of this model with new position, rotation, and scale.
     * Shares the loaded resources (meshes, textures, etc.) for efficiency.
     */
    clone(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, scale = this.scale) {
        if (!this.isLoaded) {
            throw new Error("Cannot clone model that hasn't been loaded yet");
        }

        const clonedModel = new model(this.url, x, y, z, rx, ry, rz, scale);
        
        // Copy all the loaded resources from the original model
        clonedModel.gltf = this.gltf;
        clonedModel.binaryBuffer = this.binaryBuffer;
        clonedModel.textures = this.textures;
        clonedModel.programs = this.programs;
        clonedModel.meshes = this.meshes;
        clonedModel.nodes = this.nodes;
        clonedModel.skins = this.skins;
        clonedModel.animations = this.animations;
        clonedModel.jointMatrices = new Float32Array(this.jointMatrices.length);
        clonedModel.jointMatrices.set(this.jointMatrices);
        clonedModel.isLoaded = true;
        
        // Copy animation state
        clonedModel.currentAnimation = this.currentAnimation;
        clonedModel.animationTime = 0; // Start fresh
        clonedModel.animationDuration = this.animationDuration;
        clonedModel.animationSpeed = this.animationSpeed;
        clonedModel.loopAnimation = this.loopAnimation;
        clonedModel.animationList = this.animationList;
        clonedModel.animationIndex = this.animationIndex;
        
        return clonedModel;
    }

    /**
     * Compute world-space axis-aligned bounding boxes (AABBs) for all mesh primitives.
     * Caches the result if position, rotation, and scale haven't changed.
     */
    getWorldBoundingBoxes() {
        if (!this.isLoaded) return [];

        const posChanged = !vec3.exactEquals(this.position, this._lastBoxPos);
        const rotChanged = !vec3.exactEquals(this.rotation, this._lastBoxRot);
        const scaleChanged = this.scale !== this._lastBoxScale;

        if (this._cachedBoundingBoxes && !posChanged && !rotChanged && !scaleChanged) {
            return this._cachedBoundingBoxes;
        }

        this.computeModelMatrix();
        vec3.copy(this._lastBoxPos, this.position);
        vec3.copy(this._lastBoxRot, this.rotation);
        this._lastBoxScale = this.scale;

        const boxes = [];
        const combo = mat4.create();
        const v = vec3.create();

        const transformCorners = (mat, corners) => {
            let wMin = [Infinity, Infinity, Infinity];
            let wMax = [-Infinity, -Infinity, -Infinity];
            for (let i = 0; i < 8; i++) {
                vec3.transformMat4(v, corners[i], mat);
                if (v[0] < wMin[0]) wMin[0] = v[0];
                if (v[1] < wMin[1]) wMin[1] = v[1];
                if (v[2] < wMin[2]) wMin[2] = v[2];
                if (v[0] > wMax[0]) wMax[0] = v[0];
                if (v[1] > wMax[1]) wMax[1] = v[1];
                if (v[2] > wMax[2]) wMax[2] = v[2];
            }
            return { min: wMin, max: wMax };
        };

        for (const mesh of this.meshes) {
            if (!mesh.localBounds) continue;

            const node = this.nodes[mesh.nodeIndex];
            mat4.multiply(combo, this.modelMatrix, node.worldMatrix);

            const min = mesh.localBounds.min;
            const max = mesh.localBounds.max;
            const corners = [
                [min[0], min[1], min[2]],
                [max[0], min[1], min[2]],
                [min[0], max[1], min[2]],
                [max[0], max[1], min[2]],
                [min[0], min[1], max[2]],
                [max[0], min[1], max[2]],
                [min[0], max[1], max[2]],
                [max[0], max[1], max[2]],
            ];

            let box = transformCorners(combo, corners);
            // Handle skinned meshes where parent node scales down mesh before bone inversion
            if (mesh.skinIndex !== undefined && (box.max[1] - box.min[1] < 1.0) && (max[1] - min[1] > 0.5)) {
                box = transformCorners(this.modelMatrix, corners);
            }

            boxes.push(box);
        }

        this._cachedBoundingBoxes = boxes;
        return boxes;
    }
}

function componentBytes(componentType) {
    return { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[componentType];
}

function glIndexType(componentType) {
    return { 5121: gl.UNSIGNED_BYTE, 5123: gl.UNSIGNED_SHORT, 5125: gl.UNSIGNED_INT }[componentType];
}

let defaultTextures = null;
function getDefaultTextures() {
    if (defaultTextures) return defaultTextures;

    function make1x1(r, g, b, a) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([r, g, b, a]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        return tex;
    }

    defaultTextures = {
        white: make1x1(255, 255, 255, 255),
        normal: make1x1(128, 128, 255, 255),
        roughness: make1x1(0, 209, 0, 255),
        black: make1x1(0, 0, 0, 255)
    };
    return defaultTextures;
}
