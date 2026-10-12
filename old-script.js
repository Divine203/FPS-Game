class Plane {
    constructor(x, y, z, w, h, texture1, rx = 0, ry = 0, rz = 0, rpu = .7) {
        this.position = vec3.fromValues(x, y, z);
        this.size = vec3.fromValues(w, h, 1);
        this.rotation = vec3.fromValues(rx, ry, rz);
        this.modelMatrix = mat4.create();

        this.rpu = rpu;
        this.texture1 = texture1;
    }

    initShaders() {
        this.vertexShader = getAndCompileShader("mainVertexShader");
        this.fragmentShader = getAndCompileShader("mainFragmentShader");

        this.shaderProgram = gl.createProgram();

        gl.attachShader(this.shaderProgram, this.vertexShader);
        gl.attachShader(this.shaderProgram, this.fragmentShader);
        gl.linkProgram(this.shaderProgram);

        this.modelMatrixLocation = gl.getUniformLocation(this.shaderProgram, "modelMatrix");
        this.viewMatrixLocation = gl.getUniformLocation(this.shaderProgram, "viewMatrix");
        this.projectionMatrixLocation = gl.getUniformLocation(this.shaderProgram, "projectionMatrix");
        this.cameraPositionLocation = gl.getUniformLocation(this.shaderProgram, "cameraPosition");

        this.sampler0Location = gl.getUniformLocation(this.shaderProgram, "uTexture");
    }

    initBuffers() {
        this.vertices = [...planeVertices];

        let repeatPerUnit = this.rpu;

        this.textureCoordinates = [
            0.0, 0.0,
            this.size[0] * repeatPerUnit, 0.0,
            this.size[0] * repeatPerUnit, this.size[1] * repeatPerUnit,
            this.size[0] * repeatPerUnit, this.size[1] * repeatPerUnit,
            0.0, this.size[1] * repeatPerUnit,
            0.0, 0.0
        ];

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW);

        this.positionAttributeLocation = gl.getAttribLocation(this.shaderProgram, "position");
        gl.enableVertexAttribArray(this.positionAttributeLocation);
        gl.vertexAttribPointer(this.positionAttributeLocation, 3, gl.FLOAT, false, 0, 0);

        this.textureCoordinatesBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.textureCoordinatesBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.textureCoordinates), gl.STATIC_DRAW);

        this.textureCoordinateAttributeLocation = gl.getAttribLocation(this.shaderProgram, "textureCoordinate");
        gl.enableVertexAttribArray(this.textureCoordinateAttributeLocation);
        gl.vertexAttribPointer(this.textureCoordinateAttributeLocation, 2, gl.FLOAT, false, 0, 0);

        gl.bindVertexArray(null);
    }

    draw(viewMatrix, projectionMatrix) {
        mat4.identity(this.modelMatrix);

        mat4.translate(this.modelMatrix, this.modelMatrix, this.position);

        mat4.rotateZ(this.modelMatrix, this.modelMatrix, this.rotation[2]);
        mat4.rotateY(this.modelMatrix, this.modelMatrix, this.rotation[1]);
        mat4.rotateX(this.modelMatrix, this.modelMatrix, this.rotation[0]);

        mat4.scale(this.modelMatrix, this.modelMatrix, this.size);

        gl.useProrgam(this.shaderProgram);
        gl.bindVertexArray(this.vao);

        gl.uniformMatrix4fv(this.modelMatrixLocation, false, this.modelMatrix);
        gl.uniformMatrix4fv(this.viewMatrixLocation, false, viewMatrix);
        gl.uniformMatrix4fv(this.projectionMatrixLocation, false, projectionMatrix);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture1);
        gl.uniform1i(this.sampler0Location, 0);

        gl.drawArrays(gl.TRIANGLES, 0, this.vertices.length / 3);

    }
}



const K = {
    r: false,
    l: false,
    u: false,
    d: false,

    W: false,
    A: false,
    S: false,
    D: false,
    Q: false,
    E: false,
};

let movVel = 0.055;
let rotVel = 0.021;

document.addEventListener('keydown', (e) => {
    switch (e.key) {
        case 'ArrowUp':
            if (!K.d) K.u = true;
            break;
        case 'ArrowLeft':
            if (!K.r) K.l = true;
            break;
        case 'ArrowRight':
            if (!K.l) K.r = true;
            break;
        case 'ArrowDown':
            if (!K.u) K.d = true;
            break;

        case 'w':
            if (!K.S) K.W = true;
            break;
        case 'a':
            if (!K.D) K.A = true;
            break;
        case 's':
            if (!K.W) K.S = true;
            break;
        case 'd':
            if (!K.A) K.D = true;
            break;
        case 'q':
            if (!K.E) K.Q = true;
            break;
        case 'e':
            if (!K.Q) K.E = true;
            break;
    }
});

document.addEventListener('keyup', (e) => {
    switch (e.key) {
        case 'ArrowUp':
            K.u = false;
            break;
        case 'ArrowLeft':
            K.l = false;
            break;
        case 'ArrowRight':
            K.r = false;
            break;
        case 'ArrowDown':
            K.d = false;
            break;

        case 'w':
            K.W = false;
            break;
        case 'a':
            K.A = false;
            break;
        case 's':
            K.S = false;
            break;
        case 'd':
            K.D = false;
            break;
        case 'q':
            K.Q = false;
            break;
        case 'e':
            K.E = false;
            break;
    }
});

const camera = {
    position: vec3.fromValues(0, .3, 7), // posiiton [x, y, z]
    direction: vec3.fromValues(0, 0, -1),
    noYdirection: vec3.fromValues(0, 0, -1),
    pitch: 0,
    yaw: -1 * Math.PI / 2.0
};

function applyViewBob(deltaTime) {
    const bobAmount = 0.05;
    const swayAmount = 0.03;

    if (isMoving) {
        camera.viewBobTime += deltaTime * 8; // bob speed
    } else {
        camera.viewBobTime = 0; // reset if standing still
    }

    const verticalBob = Math.sin(camera.viewBobTime) * bobAmount;
    const sidewaysSway = Math.cos(camera.viewBobTime * 0.5) * swayAmount;

    // clone the real position, add bob offsets
    const renderPos = vec3.clone(camera.position);
    renderPos[1] += verticalBob;  // up/down
    renderPos[0] += sidewaysSway; // left/right

    return renderPos;
}

const moveCamera = () => {
    camera.direction[0] = Math.cos(camera.pitch) * Math.cos(camera.yaw);
    camera.direction[1] = Math.sin(camera.pitch);
    camera.direction[2] = Math.cos(camera.pitch) * Math.sin(camera.yaw);

    camera.noYdirection[0] = Math.cos(0) * Math.cos(camera.yaw);
    camera.noYdirection[1] = Math.sin(0);
    camera.noYdirection[2] = Math.cos(0) * Math.sin(camera.yaw);

    camera.right = vec3.fromValues(-1 * Math.sin(camera.yaw), 0, Math.cos(camera.yaw));

    let movementDirection = vec3.create();
    if (K.u) {
        vec3.scale(movementDirection, camera.noYdirection, movVel);
        vec3.add(camera.position, camera.position, movementDirection);
    }
    if (K.d) {
        vec3.scale(movementDirection, camera.noYdirection, -movVel);
        vec3.add(camera.position, camera.position, movementDirection);
    }
    if (K.l) {
        camera.yaw -= rotVel;
    }
    if (K.r) {
        camera.yaw += rotVel;
    }
    if (K.W) {
        camera.pitch += rotVel;
    }
    if (K.S) {
        camera.pitch -= rotVel;
    }

    isMoving = (K.u || K.d);
}