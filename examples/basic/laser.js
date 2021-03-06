/**
 * @author rogerscg / https://github.com/rogerscg
 */

import {Entity} from '../../src/era.js';

const GEOMETRY = new THREE.CubeGeometry(.3, .3, 8);
const MATERIAL = new THREE.MeshLambertMaterial({color: 0xff2222});
const LIFETIME = 2000;
const VELOCITY = 10;

/**
 * A laser beam shot by the cannons.
 */
class Laser extends Entity {
  constructor() {
    super();
    this.fireTime = Date.now();
  }

  /** @override */
  generateMesh() {
    return new THREE.Mesh(GEOMETRY, MATERIAL);
  }

  /** @override */
  update() {
    this.position.z += VELOCITY;
    if (Date.now() - this.fireTime > LIFETIME) {
      this.destroy();
    }
  }
}

export default Laser;