import { gl } from "./global.js";
import { getAndCompileShader } from "./utils.js";
import { mat4, vec3 } from "gl-matrix";

const SHADOW_MAP_SIZE = 2048;

export class ShadowMap {
    constructor() {
        this.size = SHADOW_MAP_SIZE;
        this.lightSpaceMatrix = mat4.create();
        this.depthTexture = null;
        this.framebuffer = null;

        // Depth-only shader programs
        this.depthPrograms = {};

        this.createFramebuffer();
        this.createDepthPrograms();
    }

    createFramebuffer() {
        // Create depth texture
        this.depthTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F,
            this.size, this.size, 0,
            gl.DEPTH_COMPONENT, gl.FLOAT, null
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // Enable hardware shadow comparison for texture() lookups
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);

        // Create framebuffer with depth-only attachment
        this.framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depthTexture, 0);

        // No color buffer needed — tell WebGL explicitly
        gl.drawBuffers([gl.NONE]);
        gl.readBuffer(gl.NONE);
        
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error("Shadow framebuffer incomplete:", status);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    createDepthPrograms() {
        this.depthPrograms.rigid = this.createDepthProgram("shadowDepthVertexShader", "shadowDepthFragmentShader");
        this.depthPrograms.skinned = this.createDepthProgram("shadowDepthSkinnedVertexShader", "shadowDepthFragmentShader");
    }

    createDepthProgram(vertexId, fragmentId) {
        const program = gl.createProgram();
        gl.attachShader(program, getAndCompileShader(vertexId));
        gl.attachShader(program, getAndCompileShader(fragmentId));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error("Shadow program link error: " + gl.getProgramInfoLog(program));
        }
        return program;
    }

    /*
     * Compute the light-space matrix for a directional / far-away point light.
     * Uses an orthographic projection sized to capture the relevant scene area.
     */
    computeLightSpaceMatrix(lightPosition, sceneCenter, sceneRadius) {
        const lightViewMatrix = mat4.create();
        const lightProjMatrix = mat4.create();

        // Light looks toward the scene center
        const up = vec3.fromValues(0, 1, 0);

        // If the light is nearly directly above, use a different up vector
        const lightDir = vec3.create();
        vec3.subtract(lightDir, sceneCenter, lightPosition);
        vec3.normalize(lightDir, lightDir);
        if (Math.abs(vec3.dot(lightDir, up)) > 0.99) {
            vec3.set(up, 0, 0, 1);
        }

        mat4.lookAt(lightViewMatrix, lightPosition, sceneCenter, up);

        // Orthographic projection that encompasses the scene
        const halfSize = sceneRadius;
        mat4.ortho(lightProjMatrix, -halfSize, halfSize, -halfSize, halfSize, 0.1, sceneRadius * 4);

        mat4.multiply(this.lightSpaceMatrix, lightProjMatrix, lightViewMatrix);
        return this.lightSpaceMatrix;
    }

    bind() {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.viewport(0, 0, this.size, this.size);
        gl.clear(gl.DEPTH_BUFFER_BIT);

        // Use front-face culling during shadow pass to reduce shadow acne
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.FRONT);

        gl.enable(gl.DEPTH_TEST);
    }

    unbind(canvasWidth, canvasHeight) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvasWidth, canvasHeight);

        // Restore default back-face culling
        gl.cullFace(gl.BACK);
        gl.disable(gl.CULL_FACE);
    }
}
