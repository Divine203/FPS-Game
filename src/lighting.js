import { vec3 } from "gl-matrix";

const lightSphereRadius = 2;
const lightVisible = true;

const windowLights = [
    { // glass
        position: vec3.fromValues(334.60, 75.23, -354.79),
        color: vec3.fromValues(1.0, 0.0, 0.0),
        intensity: 1.8,
        range: 0,
        shape: "rectangle", dimensions: [26, 22], rotation: vec3.fromValues(0.0, 0.59, 0), opacity: 0.4
    },

    { // actual light
        position: vec3.fromValues(334.60, 75.23, -356.49),
        color: vec3.fromValues(1.0, 0.0, 0.0),
        intensity: 2.8,
        range: 255,
        shape: "rectangle", dimensions: [26, 22], rotation: vec3.fromValues(0.0, 0.59, 0), opacity: 0,
    },


    { // glass
        position: vec3.fromValues(259.44, 76.09, -303.61),
        color: vec3.fromValues(1.0, 0.0, 0.0),
        intensity: 1.8,
        range: 0,
        shape: "rectangle", dimensions: [28, 26], rotation: vec3.fromValues(0.0, 0.59, 0), opacity: 0.4
    },

    { // actual light
        position: vec3.fromValues(256.94, 76.09, -307.45),
        color: vec3.fromValues(1.0, 0.0, 0.0),
        intensity: 2.8,
        range: 255,
        shape: "rectangle", dimensions: [28, 20], rotation: vec3.fromValues(0.0, 0.59, 0), opacity: 0
    },



    { // glass
        position: vec3.fromValues(80.41, 75.44, -617.84),
        color: vec3.fromValues(1.0, 0.0, 0.4),
        intensity: 1.8,
        range: 0,
        shape: "rectangle", dimensions: [30, 22], rotation: vec3.fromValues(0.0, 0.59, 0), opacity: 1.0,
    },

    { // actual light
        position: vec3.fromValues(80.41, 75.44, -607.84),
        color: vec3.fromValues(1.0, 0.0, 0.4),
        intensity: 2.8,
        range: 255,
        shape: "rectangle", dimensions: [26, 22], rotation: vec3.fromValues(0.0, 0.59, 0), opacity: 0,
    },


    { // glass
        position: vec3.fromValues(2.92, 75.44, -566.15),
        color: vec3.fromValues(1.0, 0.0, 0.4),
        intensity: 1.8,
        range: 0,
        shape: "rectangle", dimensions: [30, 22], rotation: vec3.fromValues(0.0, 0.59, 0), opacity: 1.0
    },

    { // actual light
        position: vec3.fromValues(7.92, 75.44, -563.01),
        color: vec3.fromValues(1.0, 0.0, 0.4),
        intensity: 2.8,
        range: 255,
        shape: "rectangle", dimensions: [26, 22], rotation: vec3.fromValues(0.0, 0.59, 0), opacity: 0,
    },


    { // glass
        position: vec3.fromValues(-59.59, 75.44, -536.19),
        color: vec3.fromValues(0.0, 0.3, 1.0),
        intensity: 1.8,
        range: 0,
        shape: "rectangle", dimensions: [30, 22], rotation: vec3.fromValues(0.0, 0.59, 0), opacity: 1.0,
    },

    { // actual light
        position: vec3.fromValues(-54.59, 75.44, -533.04),
        color: vec3.fromValues(0.0, 0.3, 1.0),
        intensity: 2.8,
        range: 255,
        shape: "rectangle", dimensions: [26, 22], rotation: vec3.fromValues(0.0, 0.59, 0), opacity: 0,
    },


    { // glass
        position: vec3.fromValues(-84.54, 75.44, -520.69),
        color: vec3.fromValues(0.0, 0.3, 1.0),
        intensity: 1.8,
        range: 0,
        shape: "rectangle", dimensions: [30, 22], rotation: vec3.fromValues(0.0, 0.59, 0), opacity: 1.0,
    },

    { // actual light
        position: vec3.fromValues(-79.54, 75.44, -517.54),
        color: vec3.fromValues(0.0, 0.3, 1.0),
        intensity: 2.8,
        range: 255,
        shape: "rectangle", dimensions: [26, 22], rotation: vec3.fromValues(0.0, 0.59, 0), opacity: 0,
    },


    { // glass
        position: vec3.fromValues(-107.79, 34.66, -506.59),
        color: vec3.fromValues(1.0, 1.0, 1.0),
        intensity: 0.8,
        range: 0,
        shape: "rectangle", dimensions: [30, 22], rotation: vec3.fromValues(0.57, -0.009, 1.57), opacity: 1.0
    },

    { // actual light
        position: vec3.fromValues(-102.79, 34.66, -503.44),
        color: vec3.fromValues(1.0, 1.0, 1.0),
        intensity: 1.8,
        range: 255,
        shape: "rectangle", dimensions: [26, 22], rotation: vec3.fromValues(0.57, -0.009, 1.57), opacity: 0, visible: false
    },

    { // actual light
        position: vec3.fromValues(-327.81, 248.82, 58.09),
        color: vec3.fromValues(1.0, 1.0, 1.0),
        intensity: 1.8,
        range: 255,
        shape: "rectangle", dimensions: [26, 22], rotation: vec3.fromValues(1.57, -0.03, 1.64), opacity: 0, visible: false
    },

    { // actual light
        position: vec3.fromValues(-364.57, 159.60, 220.60),
        color: vec3.fromValues(1.0, 1.0, 1.0),
        intensity: 1.8,
        range: 255,
        shape: "rectangle", dimensions: [26, 22], rotation: vec3.fromValues(1.57, -0.03, 1.64), opacity: 0, visible: false,
    },

    { // actual light
        position: vec3.fromValues(-388.58, 239.68, -60.35),
        color: vec3.fromValues(1.0, 1.0, 1.0),
        intensity: 1.8,
        range: 255,
        shape: "rectangle", dimensions: [26, 22], rotation: vec3.fromValues(1.57, -0.03, 1.64), opacity: 0, visible: false,
    },

    { // actual light
        position: vec3.fromValues(-312.44, 74.66, -86.59),
        color: vec3.fromValues(1.0, 1.0, 0.0),
        intensity: 2.2,
        range: 75,
        shape: "rectangle", dimensions: [26, 22], rotation: vec3.fromValues(1.57, -0.03, 1.64), opacity: 0, visible: false,
    },

    { // actual light
        position: vec3.fromValues(-324.16, 605.98, 1143.91),
        color: vec3.fromValues(1.0, 1.0, 1.0),
        intensity: 1.5,
        range: 75,
        shape: "rectangle", dimensions: [26, 22], rotation: vec3.fromValues(-0.45, -0.03, 1.55), opacity: 0, visible: false,
    },

    { // actual light
        position: vec3.fromValues(-324.16, 448.38, 1143.91),
        color: vec3.fromValues(1.0, 1.0, 1.0),
        intensity: 1.5,
        range: 75,
        shape: "rectangle", dimensions: [26, 22], rotation: vec3.fromValues(-0.45, -0.03, 1.55), opacity: 0, visible: false
    },

    { // actual light
        position: vec3.fromValues(-324.16, 245.50, 1143.91),
        color: vec3.fromValues(1.0, 1.0, 1.0),
        intensity: 1.5,
        range: 75,
        shape: "rectangle", dimensions: [26, 22], rotation: vec3.fromValues(-0.45, -0.03, 1.55), opacity: 0, visible: false
    },
]

const streetLights = [
    // right side
    { position: vec3.fromValues(94.33, 24, -493.33), color: vec3.fromValues(1.0, 1.0, 0.0), intensity: 0.6, range: 350, opacity: 0, visible: false },
    { position: vec3.fromValues(-183.39, 24, -288.99), color: vec3.fromValues(1.0, 1.0, 0.0), intensity: 0.6, range: 350, opacity: 0 },
    { position: vec3.fromValues(-254.65, 24, 20.12), color: vec3.fromValues(1.0, 1.0, 0.0), intensity: 0.6, range: 350, opacity: 0 },
    { position: vec3.fromValues(-254.65, 24, 483.77), color: vec3.fromValues(1.0, 1.0, 0.0), intensity: 0.6, range: 350, opacity: 0 },


    // left side
    { position: vec3.fromValues(188, 23.67, -345), color: vec3.fromValues(1.0, 1.0, 0.0), intensity: 0.6, range: 350, opacity: 0 },
    { position: vec3.fromValues(-49.9, 24, -149.1), color: vec3.fromValues(1.0, 1.0, 0.0), intensity: 0.6, range: 350, opacity: 0 },
    { position: vec3.fromValues(-61.56, 24, 231.83), color: vec3.fromValues(1.0, 1.0, 0.0), intensity: 0.6, range: 350, opacity: 0 },

].map(light => ({
    ...light,
    radius: light.radius ?? lightSphereRadius,
    visible: false,
    rotation: light.rotation ?? vec3.create()
}));

export const lights = [
    // Moonlight: cool blue overhead illumination.
    {
        position: vec3.fromValues(25.2, 1869.19, 1250.02),
        // color: vec3.fromValues(0.28, 0.42, 1.0),
        color: vec3.fromValues(1.0, 1.0, 1.0),
        intensity: 1.0,
        range: 8460,
        radius: 120,
    },

    // hidden moon
    {
        position: vec3.fromValues(2051.76, 2255.43, -2363.1),
        // color: vec3.fromValues(0.28, 0.42, 1.0),
        color: vec3.fromValues(1.0, 1.0, 2.2),
        intensity: 0.1,
        range: 6460,
        radius: 120,
        // moveable: true
        visible: false
    },

    ...streetLights, ...windowLights
].map(light => ({
    ...light,
    visible: light.visible ?? lightVisible,
    rotation: light.rotation ?? vec3.create()
}));

export const lightingLights = lights.filter(light => light.range > 0);

export const material = {
    ambient: new Float32Array([0.18, 0.2, 0.28]),
    diffuse: new Float32Array([0.9, 0.9, 0.9]),
    specular: new Float32Array([0.35, 0.35, 0.4]),
    shininess: 48
};

export const cameraPosition = vec3.create();

export function setCameraPosition(position) {
    vec3.copy(cameraPosition, position);
}