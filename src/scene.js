import { gl, c } from "./global";
import { model } from "./model.js";

export class Scene {
    constructor() {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        this.shadowMap = null;
    }

    render(viewMatrix, projectionMatrix) {
        // --- Pass 1: Shadow depth pass ---
        if (this.shadowMap) {
            this.shadowMap.bind();
            for (let obj of this.objects) {
                // Only models cast shadows (light markers don't)
                if (obj instanceof model && obj.drawDepth) {
                    obj.drawDepth(this.shadowMap);
                }
            }
            this.shadowMap.unbind(c.width, c.height);
        }

        // --- Pass 2: Main rendering pass ---
        gl.clearColor(0, 0, 0, 1); // black
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);

        for (let obj of this.objects) {
            if (obj.draw.length >= 3) {
                // model.draw(viewMatrix, projectionMatrix, shadowMap)
                obj.draw(viewMatrix, projectionMatrix, this.shadowMap);
            } else {
                // LightMarker.draw(viewMatrix, projectionMatrix)
                obj.draw(viewMatrix, projectionMatrix);
            }
        }
    }

    /**
     * Check if a player circle at (px, pz) at camera height py collides with any solid obstacle.
     * @param {number} px - Candidate player X position
     * @param {number} py - Player eye/camera Y position
     * @param {number} pz - Candidate player Z position
     * @param {number} radius - Player horizontal collision radius (default 3.5)
     * @returns {boolean} True if colliding with any obstacle
     */
    checkPlayerCollision(px, py, pz, radius = 3.5) {
        // Player height bounds relative to camera (head at py + 2.0, feet above ground at py - 27.0)
        const yMin = py - 27.0;
        const yMax = py + 2.0;
        const rSq = radius * radius;

        for (const obj of this.objects) {
            if (!obj || !obj.isObstacle || !obj.isLoaded) continue;
            const boxes = obj.getWorldBoundingBoxes();
            for (let i = 0; i < boxes.length; i++) {
                const b = boxes[i];
                // Fast vertical reject: ignore ground floor (b.max < -27) and upper roofs (b.min > 17)
                if (yMax < b.min[1] || yMin > b.max[1]) continue;

                // Find closest point on AABB to circle center in (X, Z) plane
                const cx = Math.max(b.min[0], Math.min(px, b.max[0]));
                const cz = Math.max(b.min[2], Math.min(pz, b.max[2]));
                const dx = px - cx;
                const dz = pz - cz;

                if ((dx * dx + dz * dz) < rSq) {
                    return true;
                }
            }
        }
        return false;
    }
}
