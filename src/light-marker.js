import { gl } from "./global.js";
import { getAndCompileShader } from "./utils.js";
import { mat4 } from "gl-matrix";

export class LightMarker {
    constructor(light, radius = light.radius ?? 2) {
        this.light = light;
        this.radius = radius;
        this.modelMatrix = mat4.create();
        this.vertices = light.shape === "rectangle"
            ? createRectangleVertices(light.dimensions ?? [1, 1])
            : createSphereVertices(16, 24);

        const vertexShader = getAndCompileShader("lightSphereVertexShader");
        const fragmentShader = getAndCompileShader("lightSphereFragmentShader");
        this.shaderProgram = gl.createProgram();
        gl.attachShader(this.shaderProgram, vertexShader);
        gl.attachShader(this.shaderProgram, fragmentShader);
        gl.linkProgram(this.shaderProgram);
        if (!gl.getProgramParameter(this.shaderProgram, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(this.shaderProgram));
        }

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW);

        const positionLocation = gl.getAttribLocation(this.shaderProgram, "position");
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);

        this.modelMatrixLocation = gl.getUniformLocation(this.shaderProgram, "modelMatrix");
        this.viewMatrixLocation = gl.getUniformLocation(this.shaderProgram, "viewMatrix");
        this.projectionMatrixLocation = gl.getUniformLocation(this.shaderProgram, "projectionMatrix");
        this.colorLocation = gl.getUniformLocation(this.shaderProgram, "color");
    }

    draw(viewMatrix, projectionMatrix) {
        if (this.light.visible === false) return;

        mat4.identity(this.modelMatrix);
        mat4.translate(this.modelMatrix, this.modelMatrix, this.light.position);
        const rotation = this.light.rotation ?? [0, 0, 0];
        mat4.rotateZ(this.modelMatrix, this.modelMatrix, rotation[2]);
        mat4.rotateY(this.modelMatrix, this.modelMatrix, rotation[1]);
        mat4.rotateX(this.modelMatrix, this.modelMatrix, rotation[0]);
        if (this.light.shape === "rectangle") {
            mat4.scale(this.modelMatrix, this.modelMatrix, [1, 1, 1]);
        } else {
            mat4.scale(this.modelMatrix, this.modelMatrix, [this.radius, this.radius, this.radius]);
        }

        gl.useProgram(this.shaderProgram);
        gl.bindVertexArray(this.vao);
        gl.uniformMatrix4fv(this.modelMatrixLocation, false, this.modelMatrix);
        gl.uniformMatrix4fv(this.viewMatrixLocation, false, viewMatrix);
        gl.uniformMatrix4fv(this.projectionMatrixLocation, false, projectionMatrix);
        gl.uniform4f(
            this.colorLocation,
            this.light.color[0] * this.light.intensity,
            this.light.color[1] * this.light.intensity,
            this.light.color[2] * this.light.intensity,
            this.light.opacity ?? 1
        );
        const transparent = (this.light.opacity ?? 1) < 1;
        if (transparent) gl.depthMask(false);
        gl.drawArrays(gl.TRIANGLES, 0, this.vertices.length / 3);
        if (transparent) gl.depthMask(true);
        gl.bindVertexArray(null);
    }
}

function createSphereVertices(latitudeBands, longitudeBands) {
    const vertices = [];

    for (let latitude = 0; latitude < latitudeBands; latitude++) {
        const theta1 = latitude * Math.PI / latitudeBands;
        const theta2 = (latitude + 1) * Math.PI / latitudeBands;

        for (let longitude = 0; longitude < longitudeBands; longitude++) {
            const phi1 = longitude * Math.PI * 2 / longitudeBands;
            const phi2 = (longitude + 1) * Math.PI * 2 / longitudeBands;

            const a = spherePoint(theta1, phi1);
            const b = spherePoint(theta2, phi1);
            const c = spherePoint(theta2, phi2);
            const d = spherePoint(theta1, phi2);

            vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
        }
    }

    return vertices;
}

function createRectangleVertices(dimensions) {
    const width = dimensions[0];
    const height = dimensions[1];
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    return [
        -halfWidth, -halfHeight, 0,
         halfWidth, -halfHeight, 0,
         halfWidth,  halfHeight, 0,
        -halfWidth, -halfHeight, 0,
         halfWidth,  halfHeight, 0,
        -halfWidth,  halfHeight, 0
    ];
}

function spherePoint(theta, phi) {
    const sinTheta = Math.sin(theta);
    return [
        sinTheta * Math.cos(phi),
        Math.cos(theta),
        sinTheta * Math.sin(phi)
    ];
}
