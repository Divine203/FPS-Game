import { vec3 } from "gl-matrix";

export const c = document.querySelector("#c");
export const gl = c.getContext("webgl2", { alpha: false, stencil: true });

