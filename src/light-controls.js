const keys = {
    q: false,
    a: false,
    e: false,
    d: false,
    z: false,
    c: false,
    r: false,
    f: false,
    t: false,
    g: false,
    v: false,
    b: false
};

const moveSpeed = 50;
const rotateSpeed = 1.5;

document.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();
    if (key in keys) keys[key] = true;
});

document.addEventListener("keyup", event => {
    const key = event.key.toLowerCase();
    if (key in keys) keys[key] = false;
});

export function moveLights(lights, deltaTime) {
    const horizontal = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    const depth = (keys.e ? 1 : 0) - (keys.q ? 1 : 0);
    const vertical = (keys.z ? 1 : 0) - (keys.c ? 1 : 0);
    const rotateX = (keys.r ? 1 : 0) - (keys.f ? 1 : 0);
    const rotateY = (keys.t ? 1 : 0) - (keys.g ? 1 : 0);
    const rotateZ = (keys.v ? 1 : 0) - (keys.b ? 1 : 0);
    if (horizontal === 0 && depth === 0 && vertical === 0 && rotateX === 0 && rotateY === 0 && rotateZ === 0) return;

    const distance = moveSpeed * deltaTime;
    for (const light of lights) {
        if (!light.moveable) continue;

        light.position[0] += horizontal * distance;
        light.position[2] += depth * distance;
        light.position[1] += vertical * distance;
        if (light.rotation) {
            light.rotation[0] += rotateX * rotateSpeed * deltaTime;
            light.rotation[1] += rotateY * rotateSpeed * deltaTime;
            light.rotation[2] += rotateZ * rotateSpeed * deltaTime;
        }
        console.log(`Light position: [${light.position.map(value => value.toFixed(2)).join(", ")}] rotation: [${(light.rotation ?? [0, 0, 0]).map(value => value.toFixed(2)).join(", ")}]`);
    }
}